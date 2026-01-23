"""Background worker for flushing events to the server.

The worker runs in a daemon thread and periodically flushes
batched events to the MLRun server with adaptive batching
and optional compression.
"""

from __future__ import annotations

import gzip
import json
import logging
import threading
import time
from typing import TYPE_CHECKING, Any

from mlrun.batching import AdaptiveBatcher, BatchConfig, BatchStats, FlushMetrics
from mlrun.queue import Event, EventQueue, EventType
from mlrun.transport.base import Transport, TransportError

if TYPE_CHECKING:
    from mlrun.config import Config

logger = logging.getLogger(__name__)


class FlushWorker:
    """Background worker that flushes events to the server.

    Runs in a daemon thread with adaptive batching:
    - Flush triggers: max items, max bytes, max time
    - Metric coalescing: merge same (name, step)
    - Param/tag deduplication: keep last value
    - Optional gzip compression

    Handles retries with exponential backoff on failures.
    """

    def __init__(
        self,
        queue: EventQueue,
        transport: Transport,
        config: Config,
    ) -> None:
        """Initialize the flush worker.

        Args:
            queue: The event queue to drain
            transport: The transport to use for sending
            config: SDK configuration
        """
        self._queue = queue
        self._transport = transport
        self._config = config
        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._flush_event = threading.Event()
        self._lock = threading.Lock()

        # Initialize adaptive batcher
        batch_config = BatchConfig(
            max_items=config.batch_size,
            max_bytes=config.batch_max_bytes,
            max_age_ms=config.batch_timeout_ms,
            coalesce_metrics=config.coalesce_metrics,
            dedupe_params=config.dedupe_params,
            dedupe_tags=config.dedupe_tags,
        )
        self._batcher = AdaptiveBatcher(batch_config)

        # Metrics
        self._metrics = FlushMetrics()
        self._batch_count = 0
        self._error_count = 0

    def start(self) -> None:
        """Start the background worker thread."""
        with self._lock:
            if self._thread is not None and self._thread.is_alive():
                return

            self._stop_event.clear()
            self._thread = threading.Thread(
                target=self._run,
                name="mlrun-flush-worker",
                daemon=True,
            )
            self._thread.start()
            logger.debug("Flush worker started")

    def stop(self, timeout: float = 5.0) -> None:
        """Stop the worker and wait for it to finish.

        Args:
            timeout: Maximum time to wait for the worker to stop
        """
        with self._lock:
            if self._thread is None or not self._thread.is_alive():
                return

            self._stop_event.set()
            self._flush_event.set()  # Wake up the worker

        self._thread.join(timeout=timeout)
        if self._thread.is_alive():
            logger.warning("Flush worker did not stop cleanly")

    def flush(self) -> None:
        """Trigger an immediate flush."""
        self._flush_event.set()

    def _run(self) -> None:
        """Main worker loop."""
        logger.debug("Flush worker running")

        while not self._stop_event.is_set():
            try:
                # Check for flush trigger from batcher
                check_interval = min(
                    self._config.batch_timeout_ms / 1000.0,
                    0.1,  # Check at least every 100ms
                )
                self._flush_event.wait(timeout=check_interval)
                self._flush_event.clear()

                # Drain events from queue into batcher until empty to avoid idle gaps.
                while True:
                    events = self._queue.get_batch(
                        max_items=self._config.batch_size,
                        timeout_ms=50,  # Short timeout
                    )

                    if not events:
                        break

                    for event in events:
                        should_flush = self._batcher.add(event)
                        if should_flush:
                            self._do_flush(trigger=self._get_trigger())

                    if self._queue.is_empty():
                        break

                # Check if time trigger should fire
                if not self._batcher.is_empty() and self._batcher.should_flush():
                    self._do_flush(trigger=self._get_trigger())

            except Exception as e:
                logger.exception(f"Error in flush worker: {e}")
                self._error_count += 1
                time.sleep(1)  # Back off on errors

        # Final drain on shutdown
        self._drain_remaining()
        logger.debug("Flush worker stopped")

    def _get_trigger(self) -> str:
        """Determine which trigger caused the flush."""
        stats = self._batcher.stats
        config = self._batcher.config

        if stats.event_count >= config.max_items:
            return "size"
        if stats.estimated_bytes >= config.max_bytes:
            return "bytes"
        if stats.age_ms >= config.max_age_ms:
            return "time"
        return "manual"

    def _drain_remaining(self) -> None:
        """Drain and send all remaining events on shutdown."""
        # First, drain queue into batcher
        events = self._queue.drain()
        for event in events:
            self._batcher.add(event)

        # Then flush the batcher
        if not self._batcher.is_empty():
            logger.debug(f"Draining {self._batcher.stats.event_count} remaining events")
            self._do_flush(trigger="shutdown")

    def _do_flush(self, trigger: str) -> None:
        """Flush the batcher and send to server."""
        events, stats = self._batcher.flush()
        if not events:
            return

        start_time = time.perf_counter()
        self._send_batch(events, stats)
        duration_ms = (time.perf_counter() - start_time) * 1000

        # Record metrics
        self._metrics.record_flush(
            events=len(events),
            bytes_est=stats.estimated_bytes,
            coalesced=stats.coalesced_count,
            duration_ms=duration_ms,
            trigger=trigger,
        )

        if stats.coalesced_count > 0:
            logger.debug(f"Coalesced {stats.coalesced_count} events")

    def _send_batch(self, events: list[Event], stats: BatchStats) -> None:
        """Send a batch of events to the server.

        Args:
            events: List of events to send
            stats: Batch statistics
        """
        if not events:
            return

        # Group events by type
        metrics = []
        params = []
        tags = []

        for event in events:
            if event.type == EventType.METRIC:
                metrics.append(event.data)
            elif event.type == EventType.PARAM:
                params.append(event.data)
            elif event.type == EventType.TAG:
                tags.append(event.data)

        # Build batch payload
        batch: dict[str, Any] = {
            "run_id": events[0].run_id,
            "metrics": metrics,
            "params": params,
            "tags": tags,
            "timestamp": time.time(),
            "stats": {
                "metric_count": stats.metric_count,
                "param_count": stats.param_count,
                "tag_count": stats.tag_count,
                "coalesced_count": stats.coalesced_count,
            },
        }

        # Apply compression if enabled and payload is large enough
        payload = json.dumps(batch).encode("utf-8")
        compressed = False

        if (
            self._config.compression_enabled
            and len(payload) >= self._config.compression_min_bytes
        ):
            payload = gzip.compress(payload, compresslevel=self._config.compression_level)
            compressed = True
            logger.debug(
                f"Compressed batch: {stats.estimated_bytes} -> {len(payload)} bytes"
            )

        # Send with retries
        retries = 0
        delay = self._config.retry_delay_ms / 1000.0

        while retries <= self._config.max_retries:
            try:
                # Pass compression info to transport
                self._transport.send_batch(
                    batch,
                    compressed=compressed,
                    raw_payload=payload if compressed else None,
                )
                self._batch_count += 1
                logger.debug(
                    f"Sent batch: {len(metrics)} metrics, "
                    f"{len(params)} params, {len(tags)} tags"
                )
                return
            except TransportError as e:
                if not e.retryable or retries >= self._config.max_retries:
                    logger.error(f"Failed to send batch: {e}")
                    self._error_count += 1
                    return

                logger.warning(f"Retrying batch send ({retries + 1}): {e}")
                retries += 1
                time.sleep(delay)
                delay *= self._config.retry_backoff

    @property
    def batch_count(self) -> int:
        """Number of batches successfully sent."""
        return self._batch_count

    @property
    def error_count(self) -> int:
        """Number of errors encountered."""
        return self._error_count

    @property
    def is_running(self) -> bool:
        """Whether the worker is currently running."""
        return self._thread is not None and self._thread.is_alive()

    @property
    def metrics(self) -> FlushMetrics:
        """Flush metrics for monitoring."""
        return self._metrics

    def get_stats(self) -> dict[str, Any]:
        """Get worker statistics.

        Returns:
            Dictionary with worker stats
        """
        return {
            "batch_count": self._batch_count,
            "error_count": self._error_count,
            "queue_size": self._queue.size,
            "queue_dropped": self._queue.dropped_count,
            "batcher": {
                "pending_events": self._batcher.stats.event_count,
                "pending_bytes": self._batcher.stats.estimated_bytes,
            },
            "flush_metrics": self._metrics.to_dict(),
        }
