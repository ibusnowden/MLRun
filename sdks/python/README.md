# MLRun Python SDK

Async, non-blocking ML experiment tracking SDK for Python.

## Installation

```bash
pip install mlrun
```

## Quick Start

```python
import mlrun

# Initialize a run (works offline if server unavailable)
run = mlrun.init(
    project="my-project",
    name="training-run-1",
    tags={"model": "resnet50", "dataset": "imagenet"},
)

# Log hyperparameters
run.log_params({
    "learning_rate": 0.001,
    "batch_size": 32,
    "optimizer": "adam",
})

# Training loop - logging is non-blocking!
for step in range(1000):
    loss, accuracy = train_step()
    run.log({"loss": loss, "accuracy": accuracy}, step=step)

# Finish (flushes all pending data)
run.finish()
```

### Using Context Manager

```python
import mlrun

with mlrun.init(project="my-project") as run:
    run.log_params({"lr": 0.001})

    for step in range(1000):
        run.log({"loss": loss}, step=step)

    # Automatically finished on exit
```

## Features

### Non-Blocking Logging

All `log()` calls are non-blocking. Events are queued in memory and flushed in the background, ensuring your training loop runs at full speed.

```python
# This won't slow down your training!
for step in range(100000):
    loss = train_step()  # Your expensive computation
    run.log({"loss": loss}, step=step)  # < 1μs overhead
```

### Adaptive Batching

Events are batched intelligently before being sent:

- **Size trigger**: Flush when batch reaches max items (default: 1000)
- **Bytes trigger**: Flush when batch reaches max bytes (default: 1MB)
- **Time trigger**: Flush after max age (default: 1 second)

Configure via environment variables:
```bash
export MLRUN_BATCH_SIZE=500
export MLRUN_BATCH_MAX_BYTES=500000
export MLRUN_BATCH_TIMEOUT_MS=2000
```

### Metric Coalescing

When logging the same metric multiple times at the same step, only the latest value is sent (configurable):

```python
# Only the last value (0.3) is sent for step 0
run.log({"loss": 0.5}, step=0)
run.log({"loss": 0.4}, step=0)
run.log({"loss": 0.3}, step=0)
```

Disable with:
```bash
export MLRUN_COALESCE_METRICS=false
```

### Offline Mode & Disk Spool

If the server is unavailable, events are automatically spooled to disk and synced when the connection is restored:

```python
# Works even if server is down!
run = mlrun.init(project="my-project")
print(run.is_offline)  # True if server unavailable

# Events are saved to ~/.mlrun/spool/
for step in range(1000):
    run.log({"loss": loss}, step=step)

# When server comes back online, data syncs automatically
```

Configure spool settings:
```bash
export MLRUN_SPOOL_ENABLED=true
export MLRUN_SPOOL_DIR=~/.mlrun/spool
export MLRUN_SPOOL_MAX_SIZE=100000000  # 100MB
```

### Compression

Large batches are automatically compressed with gzip:

```bash
export MLRUN_COMPRESSION=true
export MLRUN_COMPRESSION_LEVEL=6  # 1-9
export MLRUN_COMPRESSION_MIN_BYTES=1000  # Only compress if > 1KB
```

## API Reference

### `mlrun.init()`

Initialize a new run.

```python
run = mlrun.init(
    project="my-project",       # Required: project name
    name="experiment-1",        # Optional: run name (auto-generated if not provided)
    tags={"key": "value"},      # Optional: initial tags
    config={"lr": 0.001},       # Optional: initial config (logged as params)
)
```

### `run.log()`

Log metrics (non-blocking).

```python
run.log(
    {"loss": 0.5, "accuracy": 0.8},  # Metrics dict
    step=100,                         # Optional: step number
    timestamp=time.time(),            # Optional: custom timestamp
)
```

### `run.log_params()`

Log hyperparameters (non-blocking).

```python
run.log_params({
    "learning_rate": 0.001,
    "batch_size": 32,
    "model": "resnet50",
})
```

### `run.log_tags()`

Log or update tags (non-blocking).

```python
run.log_tags({
    "status": "running",
    "gpu": "A100",
})
```

### `run.finish()`

Finish the run and flush all pending data.

```python
run.finish(status="finished")  # or "failed", "killed"
```

## Examples

### Simple Training Loop

```python
import mlrun

run = mlrun.init(project="demo")
run.log_params({"lr": 0.001, "epochs": 10})

for epoch in range(10):
    for batch in dataloader:
        loss = train_step(batch)
        run.log({"train/loss": loss})

    val_loss = validate()
    run.log({"val/loss": val_loss}, step=epoch)

run.finish()
```

### PyTorch Integration

See [examples/pytorch_mnist.py](examples/pytorch_mnist.py) for a complete example.

```python
import mlrun
import torch

with mlrun.init(project="mnist", tags={"framework": "pytorch"}) as run:
    run.log_params({"lr": 0.01, "epochs": 10})

    for epoch in range(10):
        for batch_idx, (data, target) in enumerate(train_loader):
            loss = train_step(data, target)
            run.log({"train/loss": loss.item()}, step=epoch * len(train_loader) + batch_idx)

        val_loss, val_acc = validate()
        run.log({"val/loss": val_loss, "val/accuracy": val_acc}, step=epoch)
```

### HuggingFace Transformers

See [examples/huggingface_text_classification.py](examples/huggingface_text_classification.py) for a complete example.

```python
import mlrun
from transformers import Trainer, TrainerCallback

class MLRunCallback(TrainerCallback):
    def __init__(self, run):
        self.run = run

    def on_log(self, args, state, control, logs=None, **kwargs):
        if logs:
            self.run.log(logs, step=state.global_step)

with mlrun.init(project="nlp", tags={"framework": "transformers"}) as run:
    callback = MLRunCallback(run)
    trainer = Trainer(..., callbacks=[callback])
    trainer.train()
```

## Configuration

All settings can be configured via environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MLRUN_SERVER_URL` | `http://localhost:3001` | Server URL |
| `MLRUN_API_KEY` | None | API key for authentication |
| `MLRUN_BATCH_SIZE` | `1000` | Max events per batch |
| `MLRUN_BATCH_MAX_BYTES` | `1000000` | Max batch size in bytes |
| `MLRUN_BATCH_TIMEOUT_MS` | `1000` | Max time before flush (ms) |
| `MLRUN_COALESCE_METRICS` | `true` | Merge same metric at same step |
| `MLRUN_DEDUPE_PARAMS` | `true` | Keep only last value for params |
| `MLRUN_COMPRESSION` | `true` | Enable gzip compression |
| `MLRUN_SPOOL_ENABLED` | `true` | Enable disk spooling |
| `MLRUN_SPOOL_DIR` | `~/.mlrun/spool` | Spool directory |
| `MLRUN_OFFLINE` | `false` | Force offline mode |
| `MLRUN_DEBUG` | `false` | Enable debug logging |

## Development

```bash
# Clone the repository
git clone https://github.com/your-org/mlrun.git
cd mlrun/sdks/python

# Create virtual environment
python -m venv .venv
source .venv/bin/activate

# Install in development mode
pip install -e ".[dev]"

# Run tests
pytest tests/ -v

# Run examples
python examples/simple_training.py
python examples/pytorch_mnist.py
```

## License

MIT License - see [LICENSE](../../LICENSE) for details.
