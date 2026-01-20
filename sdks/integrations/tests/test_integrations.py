"""Unit tests for MLRun integrations."""

import pytest

from mlrun_integrations import (
    MLRunCallback,
    MLRunHydraCallback,
    MLRunLogger,
    MLRunOptunaCallback,
)


class TestMLRunLogger:
    """Tests for PyTorch Lightning integration."""

    @pytest.mark.unit
    def test_logger_initialization(self) -> None:
        """Test MLRunLogger can be initialized."""
        logger = MLRunLogger(project="test-project")
        assert logger is not None

    @pytest.mark.unit
    def test_logger_has_required_methods(self) -> None:
        """Test MLRunLogger has required Lightning logger methods."""
        logger = MLRunLogger(project="test-project")
        assert hasattr(logger, "log_metrics")
        assert hasattr(logger, "log_hyperparams")


class TestMLRunCallback:
    """Tests for HuggingFace Transformers integration."""

    @pytest.mark.unit
    def test_callback_initialization(self) -> None:
        """Test MLRunCallback can be initialized."""
        callback = MLRunCallback(project="test-project")
        assert callback is not None


class TestMLRunOptunaCallback:
    """Tests for Optuna integration."""

    @pytest.mark.unit
    def test_optuna_callback_initialization(self) -> None:
        """Test MLRunOptunaCallback can be initialized."""
        callback = MLRunOptunaCallback(project="test-project")
        assert callback is not None


class TestMLRunHydraCallback:
    """Tests for Hydra integration."""

    @pytest.mark.unit
    def test_hydra_callback_initialization(self) -> None:
        """Test MLRunHydraCallback can be initialized."""
        callback = MLRunHydraCallback(project="test-project")
        assert callback is not None
