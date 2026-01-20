<<<<<<< HEAD
# Track Integrations
=======
# MLRun Integrations

Framework integrations for MLRun.

## Supported Frameworks

- **PyTorch Lightning** - `MLRunLogger`
- **HuggingFace Transformers** - `MLRunCallback`
- **Optuna** - `MLRunOptunaCallback`
- **Hydra** - `MLRunHydraCallback`

## Installation

```bash
# Install with all integrations
pip install "mlrun-integrations[all]"

# Or install specific integrations
pip install "mlrun-integrations[lightning]"
pip install "mlrun-integrations[transformers]"
pip install "mlrun-integrations[optuna]"
pip install "mlrun-integrations[hydra]"
```

## Usage

### PyTorch Lightning

```python
from mlrun_integrations import MLRunLogger
from pytorch_lightning import Trainer

trainer = Trainer(logger=MLRunLogger(project="my-project"))
trainer.fit(model)
```

### HuggingFace Transformers

```python
from mlrun_integrations import MLRunCallback
from transformers import Trainer

trainer = Trainer(...)
trainer.add_callback(MLRunCallback(project="my-project"))
trainer.train()
```

### Optuna

```python
from mlrun_integrations import MLRunOptunaCallback
import optuna

study = optuna.create_study()
study.optimize(
    objective,
    callbacks=[MLRunOptunaCallback(project="my-project")]
)
```
>>>>>>> de683b6 (feat(core-001): complete monorepo scaffold)
