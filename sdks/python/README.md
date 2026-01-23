# MLRun Python SDK

Async, non-blocking ML experiment tracking SDK.

## Installation

```bash
pip install mlrun
```

## Quick Start

```python
import mlrun

# Initialize a run
run = mlrun.init(project="my-project", name="training-run-1")

# Log metrics (async, batched automatically)
for step in range(1000):
    run.log({"loss": loss, "accuracy": acc}, step=step)

# Log artifacts
run.log_artifact("model.pt", type="model")

# Finish
run.finish()
```

## Features

- **Async-first**: Non-blocking logging with < 1% training overhead target
- **Adaptive batching**: Configurable by size and time
- **Offline spool**: Disk-backed queue for network resilience
- **Compression**: gzip/zstd support for efficient uploads

## Development

```bash
# Install in development mode
pip install -e ".[dev]"

# Run tests
pytest
```
