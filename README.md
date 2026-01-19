# Trackstack

A high-performance, open-source ML experiment tracking platform. Built for modern AI workflows with first-class support for LLM evals, agent tracing, and scale.

## Why Trackstack?

- **Performance-first**: Sub-200ms UI queries at 10k+ runs, high-throughput ingestion with server-side downsampling
- **AI-native**: Built-in eval harness, agent/tool tracing, prompt versioning
- **Local-first**: Full Docker Compose stack, privacy-first defaults, no vendor lock-in
- **Open**: MIT licensed, OSS stack (ClickHouse + Postgres + MinIO)

## Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│  Python SDK │────▶│   Ingest    │────▶│   ClickHouse    │
│  (async +   │     │  (Rust/gRPC)│     │  (metrics/traces)│
│   spool)    │     └─────────────┘     └─────────────────┘
└─────────────┘            │
                           ▼
┌─────────────┐     ┌─────────────┐     ┌─────────────────┐
│   Next.js   │◀───▶│  API Gateway│◀───▶│    Postgres     │
│     UI      │     │  (Rust/Axum)│     │   (metadata)    │
└─────────────┘     └─────────────┘     └─────────────────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────────┐
                    │  Processor  │     │     MinIO       │
                    │  (rollups)  │     │   (artifacts)   │
                    └─────────────┘     └─────────────────┘
```

## Project Structure

```
trackstack/
├── apps/
│   ├── ui/                 # Next.js dashboard (TypeScript)
│   └── api/                # Rust API gateway (Axum)
├── services/
│   ├── ingest/             # Rust ingest service (gRPC/HTTP)
│   └── processor/          # Rollups, downsampling, cardinality guards
├── sdks/
│   ├── python/             # Python SDK (async batching + offline spool)
│   └── integrations/       # Lightning, Hydra, Optuna, HuggingFace hooks
├── infra/
│   ├── docker/             # Docker Compose for local dev
│   ├── k8s/                # Helm charts and manifests
│   └── observability/      # OpenTelemetry collector config
├── docs/                   # Documentation
├── bench/
│   ├── generators/         # Synthetic data generators
│   └── workloads/          # W1/W2/W3 benchmark definitions
└── migrations/
    ├── wandb/              # W&B export/import tools
    └── mlflow/             # MLflow adapters
```

## Tech Stack

| Component | Technology |
|-----------|------------|
| **Metrics Storage** | ClickHouse |
| **Metadata Store** | PostgreSQL |
| **Artifact Storage** | MinIO (S3-compatible) |
| **Ingest Service** | Rust + Tonic (gRPC) |
| **API Gateway** | Rust + Axum |
| **Dashboard** | Next.js + TypeScript + Tailwind |
| **Python SDK** | Python 3.10+ (async, httpx, pydantic) |
| **Observability** | OpenTelemetry |

## Quick Start

### Prerequisites

- Docker & Docker Compose
- (For development) Rust 1.85+, Node.js 22+, Python 3.10+, uv

### Run Locally

```bash
# Start the full stack
cd infra/docker
docker compose up -d

# Access the UI
open http://localhost:3000
```

### Development Setup

```bash
# Clone the repo
git clone https://github.com/your-org/trackstack.git
cd trackstack

# Python SDK development
uv sync --all-packages
source .venv/bin/activate

# Rust services
cargo check

# UI development
cd apps/ui && npm install && npm run dev
```

## Roadmap 2026

### Phase 1: MVP + Core (Q1-Q2)
- [x] M0: Project scaffolding + CI
- [ ] M1: Local-first single-user alpha
- [ ] M2: High-throughput ingest + ClickHouse schema
- [ ] M3: UI v0 (runs table, compare view, charts)
- [ ] M4: One-click Docker + basic K8s
- [ ] M5: Benchmarks W1/W2 + alpha report

### Phase 2: AI-Native Edge (Q2-Q3)
- [ ] M6: LLM Evals v0 (prompt sets, graders, comparison UI)
- [ ] M7: Agent tracing + OpenTelemetry compatibility
- [ ] M8: Integrations v1 (HF, Optuna, Lightning, Hydra)
- [ ] M9: Reliability (offline spool, retry, retention/rollups)

### Phase 3: OSS + Migration (Q3-Q4)
- [ ] M10: Migration tools (W&B, MLflow importers)
- [ ] M11: OSS release + docs + examples
- [ ] M12: Beta → v1.0 hardening

### Phase 4: Enterprise (Q4+)
- [ ] RBAC, audit logs, federation, multi-region

## Benchmarks

Trackstack targets measurable performance:

| Workload | Metric | Target |
|----------|--------|--------|
| **W1**: 10k runs | List/filter p95 | < 200ms |
| **W2**: High-freq ingest | Log → visible p95 | < 500ms |
| **W3**: Mixed (metrics + traces + evals) | Dashboard p95 | < 300ms |

## SDK Usage (Preview)

```python
import track

# Initialize a run
run = track.init(project="my-project", name="training-run-1")

# Log metrics (async, batched automatically)
for step in range(1000):
    run.log({"loss": loss, "accuracy": acc}, step=step)

# Log artifacts
run.log_artifact("model.pt", type="model")

# Finish
run.finish()
```

## Integrations (Preview)

```python
# PyTorch Lightning
from track.integrations import TrackLogger
trainer = Trainer(logger=TrackLogger())

# HuggingFace Transformers
from track.integrations import TrackCallback
trainer.add_callback(TrackCallback())

# Optuna
from track.integrations import TrackOptunaCallback
study.optimize(objective, callbacks=[TrackOptunaCallback()])
```

## Contributing

See [CONTRIBUTING.md](docs/CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.
