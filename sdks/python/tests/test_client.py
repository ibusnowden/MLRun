"""Tests for MLRun SDK client."""

from __future__ import annotations

import time
from unittest.mock import MagicMock, patch

import pytest

import mlrun
from mlrun.config import Config
from mlrun.queue import Event, EventQueue, EventType
from mlrun.run import Run


class TestConfig:
    """Tests for configuration."""

    @pytest.mark.unit
    def test_default_config(self) -> None:
        """Test default configuration values."""
        config = Config()
        assert config.server_url == "http://localhost:3001"
        assert config.batch_size == 1000
        assert config.batch_timeout_ms == 1000
        assert config.queue_size == 10000

    @pytest.mark.unit
    def test_config_from_env(self) -> None:
        """Test loading config from environment."""
        with patch.dict(
            "os.environ",
            {
                "MLRUN_SERVER_URL": "http://custom:8080",
                "MLRUN_BATCH_SIZE": "500",
            },
        ):
            config = Config.from_env()
            assert config.server_url == "http://custom:8080"
            assert config.batch_size == 500


class TestEventQueue:
    """Tests for the event queue."""

    @pytest.mark.unit
    def test_put_and_drain(self) -> None:
        """Test basic put and drain operations."""
        queue = EventQueue(max_size=100)

        event = Event(
            type=EventType.METRIC,
            run_id="test-run",
            data={"name": "loss", "value": 0.5},
        )

        assert queue.put(event)
        assert queue.size == 1

        events = queue.drain()
        assert len(events) == 1
        assert events[0].data["name"] == "loss"
        assert queue.is_empty()

    @pytest.mark.unit
    def test_queue_full_drops(self) -> None:
        """Test that events are dropped when queue is full."""
        queue = EventQueue(max_size=2)

        for i in range(5):
            event = Event(
                type=EventType.METRIC,
                run_id="test-run",
                data={"value": i},
            )
            queue.put(event)

        assert queue.size == 2
        assert queue.dropped_count == 3

    @pytest.mark.unit
    def test_get_batch_timeout(self) -> None:
        """Test batch retrieval with timeout."""
        queue = EventQueue()

        # Add some events
        for i in range(3):
            event = Event(
                type=EventType.METRIC,
                run_id="test-run",
                data={"value": i},
            )
            queue.put(event)

        # Get batch with short timeout
        events = queue.get_batch(max_items=10, timeout_ms=100)
        assert len(events) == 3


class TestRun:
    """Tests for the Run class."""

    @pytest.mark.unit
    @patch("mlrun.run.HttpTransport")
    def test_run_init(self, mock_transport_cls: MagicMock) -> None:
        """Test run initialization."""
        mock_transport = MagicMock()
        mock_transport.init_run.return_value = {"run_id": "test-123"}
        mock_transport_cls.return_value = mock_transport

        run = Run(project="test-project", name="test-run")

        assert run.project == "test-project"
        assert run.name == "test-run"
        assert not run.is_finished

        run.finish()

    @pytest.mark.unit
    @patch("mlrun.run.HttpTransport")
    def test_run_log_metrics(self, mock_transport_cls: MagicMock) -> None:
        """Test logging metrics."""
        mock_transport = MagicMock()
        mock_transport.init_run.return_value = {"run_id": "test-123"}
        mock_transport_cls.return_value = mock_transport

        run = Run(project="test-project")

        # Log some metrics
        run.log({"loss": 0.5, "accuracy": 0.8}, step=0)
        run.log({"loss": 0.3, "accuracy": 0.9}, step=1)

        # Events should be queued
        assert run._queue.size > 0

        run.finish()

    @pytest.mark.unit
    @patch("mlrun.run.HttpTransport")
    def test_run_context_manager(self, mock_transport_cls: MagicMock) -> None:
        """Test run as context manager."""
        mock_transport = MagicMock()
        mock_transport.init_run.return_value = {"run_id": "test-123"}
        mock_transport_cls.return_value = mock_transport

        with Run(project="test-project") as run:
            run.log({"loss": 0.5})
            assert not run.is_finished

        assert run.is_finished

    @pytest.mark.unit
    @patch("mlrun.run.HttpTransport")
    def test_run_offline_mode(self, mock_transport_cls: MagicMock) -> None:
        """Test offline mode when server is unavailable."""
        mock_transport = MagicMock()
        mock_transport.init_run.return_value = {"run_id": "offline-123", "offline": True}
        mock_transport_cls.return_value = mock_transport

        run = Run(project="test-project")

        assert run.is_offline
        run.finish()


class TestModuleAPI:
    """Tests for the module-level API."""

    @pytest.mark.unit
    @patch("mlrun.run.HttpTransport")
    def test_init_and_log(self, mock_transport_cls: MagicMock) -> None:
        """Test module-level init and log."""
        mock_transport = MagicMock()
        mock_transport.init_run.return_value = {"run_id": "test-123"}
        mock_transport_cls.return_value = mock_transport

        run = mlrun.init(project="test-project")
        assert run is not None

        # Should work via module-level API
        mlrun.log({"loss": 0.5})
        mlrun.log_params({"lr": 0.001})

        mlrun.finish()

    @pytest.mark.unit
    def test_log_without_init_raises(self) -> None:
        """Test that logging without init raises an error."""
        # Reset any active run
        mlrun._active_run = None

        with pytest.raises(RuntimeError, match="No active run"):
            mlrun.log({"loss": 0.5})


class TestNonBlocking:
    """Tests for non-blocking behavior."""

    @pytest.mark.unit
    @patch("mlrun.run.HttpTransport")
    def test_log_is_fast(self, mock_transport_cls: MagicMock) -> None:
        """Test that logging is non-blocking."""
        mock_transport = MagicMock()
        mock_transport.init_run.return_value = {"run_id": "test-123"}
        mock_transport_cls.return_value = mock_transport

        run = Run(project="test-project")

        # Log many metrics and measure time
        start = time.perf_counter()
        for i in range(1000):
            run.log({"loss": 0.5, "accuracy": 0.8, "step": i}, step=i)
        elapsed = time.perf_counter() - start

        # Should complete very quickly (queue operations only)
        # 1000 operations should take less than 100ms
        assert elapsed < 0.1, f"Logging took too long: {elapsed:.3f}s"

        run.finish()
