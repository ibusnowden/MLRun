"""
MLRun Python SDK - async, non-blocking ML experiment tracking.

Example usage:
    import mlrun

    run = mlrun.init(project="my-project", name="training-run-1")

    for step in range(1000):
        run.log({"loss": loss, "accuracy": acc}, step=step)

    run.log_artifact("model.pt", type="model")
    run.finish()
"""

__version__ = "0.1.0"
__all__ = ["init", "Run", "__version__"]


class Run:
    """Represents an experiment run."""

    def __init__(self, project: str, name: str | None = None) -> None:
        self.project = project
        self.name = name
        self._finished = False

    def log(self, data: dict, step: int | None = None) -> None:
        """Log metrics (async, batched automatically)."""
        # TODO: Implement async batching
        pass

    def log_params(self, params: dict) -> None:
        """Log hyperparameters."""
        # TODO: Implement
        pass

    def log_artifact(self, path: str, type: str = "file") -> None:
        """Log an artifact file."""
        # TODO: Implement artifact upload
        pass

    def finish(self) -> None:
        """Finish the run and flush all pending data."""
        self._finished = True


def init(project: str, name: str | None = None) -> Run:
    """Initialize a new run.

    Args:
        project: Project name
        name: Optional run name (auto-generated if not provided)

    Returns:
        A Run instance for logging metrics and artifacts
    """
    return Run(project=project, name=name)
