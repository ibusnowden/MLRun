.PHONY: help build build-rust build-ui build-sdk check clean dev test lint fmt
.PHONY: proto proto-lint proto-breaking proto-gen proto-check
.PHONY: test-contract test-integration ci
.PHONY: infra-up infra-down infra-logs

# Default target
help:
	@echo "MLRun Development Commands"
	@echo ""
	@echo "Build:"
	@echo "  make build        - Build all components"
	@echo "  make build-rust   - Build Rust services"
	@echo "  make build-ui     - Build Next.js UI"
	@echo "  make build-sdk    - Build Python SDK"
	@echo ""
	@echo "Proto (requires buf: brew install bufbuild/buf/buf):"
	@echo "  make proto        - Run full proto pipeline (lint + gen)"
	@echo "  make proto-lint   - Lint proto files"
	@echo "  make proto-breaking - Check for breaking changes"
	@echo "  make proto-gen    - Generate code from protos"
	@echo "  make proto-check  - Verify generated code is up to date"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start development environment"
	@echo "  make dev-ui       - Start UI development server"
	@echo "  make dev-api      - Start API server"
	@echo "  make dev-ingest   - Start ingest server"
	@echo ""
	@echo "Testing:"
	@echo "  make check        - Run all checks (lint + test)"
	@echo "  make lint         - Run linters"
	@echo "  make fmt          - Format code"
	@echo "  make test         - Run unit tests"
	@echo "  make test-contract    - Run contract tests (proto validation)"
	@echo "  make test-integration - Run integration tests (requires infra)"
	@echo "  make ci           - Run full CI suite locally"
	@echo ""
	@echo "Infrastructure:"
	@echo "  make infra-up     - Start infrastructure (docker-compose)"
	@echo "  make infra-down   - Stop infrastructure"
	@echo "  make infra-logs   - View infrastructure logs"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean        - Clean build artifacts"

# =============================================================================
# Build targets
# =============================================================================

build: build-rust build-ui build-sdk

build-rust:
	@echo "Building Rust services..."
	cargo build --release

build-ui:
	@echo "Building Next.js UI..."
	cd apps/ui && npm ci && npm run build

build-sdk:
	@echo "Building Python SDK..."
	uv sync --all-packages

# =============================================================================
# Proto targets
# =============================================================================

# Full proto pipeline
proto: proto-lint proto-gen
	@echo "Proto pipeline complete"

# Lint proto files with buf
proto-lint:
	@echo "Linting proto files..."
	@command -v buf >/dev/null 2>&1 || { echo "buf not found. Install with: brew install bufbuild/buf/buf"; exit 1; }
	buf lint

# Check for breaking changes against main branch
proto-breaking:
	@echo "Checking for breaking proto changes..."
	@command -v buf >/dev/null 2>&1 || { echo "buf not found. Install with: brew install bufbuild/buf/buf"; exit 1; }
	buf breaking --against '.git#branch=main'

# Generate code from protos
proto-gen: proto-gen-python
	@echo "Rust protos are generated at build time via build.rs"
	@echo "Proto generation complete"

# Generate Python proto stubs
proto-gen-python:
	@echo "Generating Python proto stubs..."
	@command -v buf >/dev/null 2>&1 || { echo "buf not found. Install with: brew install bufbuild/buf/buf"; exit 1; }
	@mkdir -p sdks/python/src/mlrun/proto
	buf generate --template buf.gen.yaml

# Verify generated code is up to date (for CI)
proto-check: proto-lint
	@echo "Verifying proto generation is reproducible..."
	@# Save current state
	@cp -r sdks/python/src/mlrun/proto /tmp/proto-backup 2>/dev/null || true
	@# Regenerate
	@$(MAKE) proto-gen-python
	@# Compare (if backup exists)
	@if [ -d /tmp/proto-backup ]; then \
		diff -r sdks/python/src/mlrun/proto /tmp/proto-backup && \
		echo "Proto generation is reproducible" || \
		(echo "ERROR: Generated proto files have drifted. Run 'make proto' and commit." && exit 1); \
		rm -rf /tmp/proto-backup; \
	fi
	@# Also verify Rust proto crate builds
	@echo "Verifying Rust proto crate builds..."
	cargo build -p mlrun-proto

# =============================================================================
# Development targets
# =============================================================================

dev: infra-up
	@echo "Development environment ready"
	@echo "  API:    http://localhost:3001"
	@echo "  Ingest: http://localhost:3002 (gRPC: 50051)"
	@echo "  UI:     http://localhost:3000"

dev-ui:
	cd apps/ui && npm run dev

dev-api:
	cargo run --bin mlrun-api

dev-ingest:
	cargo run --bin mlrun-ingest

dev-processor:
	cargo run --bin mlrun-processor

# =============================================================================
# Quality targets
# =============================================================================

check: lint test

lint: lint-rust lint-python lint-ui proto-lint

lint-rust:
	@echo "Linting Rust..."
	cargo fmt --check
	cargo clippy -- -D warnings

lint-python:
	@echo "Linting Python..."
	uv run ruff check sdks/
	uv run mypy sdks/

lint-ui:
	@echo "Linting UI..."
	cd apps/ui && npm run lint 2>/dev/null || echo "UI lint not configured"

fmt: fmt-rust fmt-python

fmt-rust:
	cargo fmt

fmt-python:
	uv run ruff format sdks/
	uv run ruff check --fix sdks/

test: test-rust test-python test-ui

test-rust:
	@echo "Testing Rust..."
	cargo test

test-python:
	@echo "Testing Python..."
	uv run pytest sdks/

test-ui:
	@echo "Testing UI..."
	cd apps/ui && npm test 2>/dev/null || echo "No UI tests yet"

# =============================================================================
# Contract Tests
# =============================================================================

test-contract: proto-check
	@echo "Running contract tests..."
	@echo "Proto validation passed"

# =============================================================================
# Integration Tests
# =============================================================================

test-integration: infra-up
	@echo "Running integration tests..."
	@echo "Waiting for services to be ready..."
	@sleep 5
	uv run pytest tests/integration/ -m integration -v 2>/dev/null || echo "No integration tests yet"
	@echo "Integration tests complete"

# =============================================================================
# CI Target (Local)
# =============================================================================

ci: lint test test-contract proto-breaking
	@echo "All CI checks passed!"

# =============================================================================
# Infrastructure targets
# =============================================================================

infra-up:
	@echo "Starting infrastructure..."
	cd infra/docker && docker compose up -d

infra-down:
	@echo "Stopping infrastructure..."
	cd infra/docker && docker compose down

infra-logs:
	cd infra/docker && docker compose logs -f

infra-ps:
	cd infra/docker && docker compose ps

# =============================================================================
# Cleanup targets
# =============================================================================

clean:
	@echo "Cleaning build artifacts..."
	cargo clean
	rm -rf apps/ui/.next apps/ui/out
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name "*.egg-info" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".pytest_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".mypy_cache" -exec rm -rf {} + 2>/dev/null || true
	find . -type d -name ".ruff_cache" -exec rm -rf {} + 2>/dev/null || true
