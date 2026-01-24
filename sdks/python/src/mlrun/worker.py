"""Background worker for flushing events to the server.

The worker runs in a daemon thread and periodically flushes
batched events to the MLRun server.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import TYPE_CHECKING

from mlrun.queue import Event, EventQueue, EventType
from mlrun.transport.base import Transport, TransportError

if TYPE_CHECKING:
    from mlrun.config import Config

logger = logging.getLogger(__name__)


class FlushWorker:
    """Background worker that flushes events to the server.

    Runs in a daemon thread and periodically sends batched events.
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
                # Wait for flush trigger or timeout
                self._flush_event.wait(
                    timeout=self._config.batch_timeout_ms / 1000.0
                )
                self._flush_event.clear()

                # Drain batches until the queue is empty to avoid idle gaps.
                while True:
                    events = self._queue.get_batch(
                        max_items=self._config.batch_size,
                        timeout_ms=100,  # Short timeout when draining
                    )

                    if not events:
                        break

                    self._send_batch(events)

                    if self._queue.is_empty():
                        break

            except Exception as e:
                logger.exception(f"Error in flush worker: {e}")
                self._error_count += 1
                time.sleep(1)  # Back off on errors

        # Final drain on shutdown
        self._drain_remaining()
        logger.debug("Flush worker stopped")

    def _drain_remaining(self) -> None:
        """Drain and send all remaining events on shutdown."""
        events = self._queue.drain()
        if events:
            logger.debug(f"Draining {len(events)} remaining events")
            self._send_batch(events)

    def _send_batch(self, events: list[Event]) -> None:
        """Send a batch of events to the server.

        Args:
            events: List of events to send
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
        batch = {
            "run_id": events[0].run_id,  # All events should be same run
            "metrics": metrics,
            "params": params,
            "tags": tags,
            "timestamp": time.time(),
        }

        # Send with retries
        retries = 0
        delay = self._config.retry_delay_ms / 1000.0

        while retries <= self._config.max_retries:
            try:
                self._transport.send_batch(batch)
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
