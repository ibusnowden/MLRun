"""
MLRun integrations for popular ML frameworks.

Example usage:
    # PyTorch Lightning
    from mlrun_integrations import MLRunLogger
    trainer = Trainer(logger=MLRunLogger())

    # HuggingFace Transformers
    from mlrun_integrations import MLRunCallback
    trainer.add_callback(MLRunCallback())

    # Optuna
    from mlrun_integrations import MLRunOptunaCallback
    study.optimize(objective, callbacks=[MLRunOptunaCallback()])
"""

__version__ = "0.1.0"
__all__ = [
    "MLRunLogger",
    "MLRunCallback",
    "MLRunOptunaCallback",
    "MLRunHydraCallback",
    "__version__",
]


class MLRunLogger:
    """PyTorch Lightning logger integration."""

    def __init__(self, project: str = "default") -> None:
        self.project = project
        # TODO: Implement Lightning logger interface


class MLRunCallback:
    """HuggingFace Transformers callback integration."""

    def __init__(self, project: str = "default") -> None:
        self.project = project
        # TODO: Implement Transformers callback interface


class MLRunOptunaCallback:
    """Optuna optimization callback integration."""

    def __init__(self, project: str = "default") -> None:
        self.project = project
        # TODO: Implement Optuna callback interface


class MLRunHydraCallback:
    """Hydra config capture integration."""

    def __init__(self, project: str = "default") -> None:
        self.project = project
        # TODO: Implement Hydra callback interface
