"""Unit tests for MLRun Python SDK client."""

import pytest

from mlrun import Run, init


class TestRun:
    """Tests for the Run class."""

    @pytest.mark.unit
    def test_run_initialization(self) -> None:
        """Test Run can be initialized with project and name."""
        run = Run(project="test-project", name="test-run")
        assert run.project == "test-project"
        assert run.name == "test-run"

    @pytest.mark.unit
    def test_run_log_accepts_dict(self) -> None:
        """Test log method accepts a dictionary of metrics."""
        run = Run(project="test-project", name="test-run")
        # Should not raise
        run.log({"loss": 0.5, "accuracy": 0.9}, step=1)

    @pytest.mark.unit
    def test_run_log_artifact_placeholder(self) -> None:
        """Test log_artifact method exists and is callable."""
        run = Run(project="test-project", name="test-run")
        # Should not raise (placeholder implementation)
        run.log_artifact("model.pt", type="model")


class TestInit:
    """Tests for the init function."""

    @pytest.mark.unit
    def test_init_returns_run(self) -> None:
        """Test init returns a Run instance."""
        run = init(project="my-project")
        assert isinstance(run, Run)
        assert run.project == "my-project"

    @pytest.mark.unit
    def test_init_with_name(self) -> None:
        """Test init with custom run name."""
        run = init(project="my-project", name="my-run")
        assert run.name == "my-run"
