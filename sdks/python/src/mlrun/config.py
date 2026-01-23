"""MLRun SDK Configuration.

Configuration can be set via:
1. Environment variables (MLRUN_*)
2. Config file (~/.mlrun/config.toml)
3. Programmatic initialization
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class Config:
    """SDK configuration settings."""

    # Server connection
    server_url: str = "http://localhost:3001"
    api_key: str | None = None

    # Batching settings
    batch_size: int = 1000  # Max items per batch
    batch_timeout_ms: int = 1000  # Max time before flush (milliseconds)
    queue_size: int = 10000  # Max queue size before dropping

    # Retry settings
    max_retries: int = 3
    retry_delay_ms: int = 1000
    retry_backoff: float = 2.0

    # Offline mode
    offline_mode: bool = False
    spool_dir: Path = field(default_factory=lambda: Path.home() / ".mlrun" / "spool")

    # Debug
    debug: bool = False

    @classmethod
    def from_env(cls) -> Config:
        """Load configuration from environment variables."""
        return cls(
            server_url=os.getenv("MLRUN_SERVER_URL", "http://localhost:3001"),
            api_key=os.getenv("MLRUN_API_KEY"),
            batch_size=int(os.getenv("MLRUN_BATCH_SIZE", "1000")),
            batch_timeout_ms=int(os.getenv("MLRUN_BATCH_TIMEOUT_MS", "1000")),
            queue_size=int(os.getenv("MLRUN_QUEUE_SIZE", "10000")),
            max_retries=int(os.getenv("MLRUN_MAX_RETRIES", "3")),
            retry_delay_ms=int(os.getenv("MLRUN_RETRY_DELAY_MS", "1000")),
            offline_mode=os.getenv("MLRUN_OFFLINE", "").lower() in ("true", "1", "yes"),
            debug=os.getenv("MLRUN_DEBUG", "").lower() in ("true", "1", "yes"),
        )


# Global configuration instance
_config: Config | None = None


def get_config() -> Config:
    """Get the global configuration."""
    global _config
    if _config is None:
        _config = Config.from_env()
    return _config


def configure(**kwargs: Any) -> None:
    """Update global configuration.

    Args:
        **kwargs: Configuration options to update
    """
    global _config
    if _config is None:
        _config = Config.from_env()

    for key, value in kwargs.items():
        if hasattr(_config, key):
            setattr(_config, key, value)
        else:
            raise ValueError(f"Unknown configuration option: {key}")
