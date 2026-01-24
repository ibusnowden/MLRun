//! MLRun API Server
//!
//! This is the monolith API server that handles:
//! - HTTP REST API for queries and SDK HTTP transport
//! - gRPC API for high-throughput SDK ingestion
//!
//! Architecture: Single binary serving both protocols on different ports.

mod services;
mod storage;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tonic::transport::Server as TonicServer;
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use mlrun_proto::mlrun::v1::ingest_service_server::IngestServiceServer;
use services::{ingest::InMemoryStore, IngestServiceImpl};

/// Application state shared across handlers.
#[derive(Clone)]
pub struct AppState {
    store: Arc<InMemoryStore>,
}

// =============================================================================
// HTTP Handlers
// =============================================================================

async fn health() -> &'static str {
    "ok"
}

async fn root() -> &'static str {
    "MLRun API v0.1.0"
}

/// Request to initialize a run via HTTP.
#[derive(Debug, Deserialize)]
struct InitRunHttpRequest {
    project: String,
    name: Option<String>,
    run_id: Option<String>,
    tags: Option<std::collections::HashMap<String, String>>,
    config: Option<std::collections::HashMap<String, serde_json::Value>>,
}

/// Response from init run.
#[derive(Debug, Serialize)]
struct InitRunHttpResponse {
    run_id: String,
    offline: bool,
}

/// Initialize a run via HTTP (for SDK HTTP transport).
async fn http_init_run(
    State(state): State<AppState>,
    Json(req): Json<InitRunHttpRequest>,
) -> Result<Json<InitRunHttpResponse>, (StatusCode, String)> {
    let run_id = req.run_id.unwrap_or_else(|| uuid::Uuid::now_v7().to_string());

    let mut runs = state.store.runs.write().await;

    // Check if exists (idempotent)
    if runs.contains_key(&run_id) {
        return Ok(Json(InitRunHttpResponse {
            run_id,
            offline: false,
        }));
    }

    // Create new run
    let now = std::time::SystemTime::now();
    let run_state = services::ingest::RunState {
        run_id: run_id.clone(),
        project_id: req.project.clone(),
        name: req.name.clone(),
        status: mlrun_proto::mlrun::v1::RunStatus::Running,
        created_at: now,
        updated_at: now,
        metrics_count: 0,
        params_count: 0,
        tags: req.tags.unwrap_or_default(),
    };

    runs.insert(run_id.clone(), run_state);
    info!(run_id = %run_id, project = %req.project, "HTTP: Initialized run");

    Ok(Json(InitRunHttpResponse {
        run_id,
        offline: false,
    }))
}

/// Request to ingest a batch via HTTP.
#[derive(Debug, Deserialize)]
struct IngestBatchHttpRequest {
    run_id: String,
    metrics: Vec<MetricData>,
    params: Vec<ParamData>,
    tags: Vec<TagData>,
    timestamp: Option<f64>,
    stats: Option<BatchStats>,
}

#[derive(Debug, Deserialize)]
struct MetricData {
    name: String,
    value: f64,
    step: i64,
    timestamp: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct ParamData {
    name: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct TagData {
    key: String,
    value: String,
}

#[derive(Debug, Deserialize)]
struct BatchStats {
    metric_count: Option<i64>,
    param_count: Option<i64>,
    tag_count: Option<i64>,
    coalesced_count: Option<i64>,
}

#[derive(Debug, Serialize)]
struct IngestBatchHttpResponse {
    status: String,
    accepted: i64,
}

/// Ingest a batch of events via HTTP (for SDK HTTP transport).
async fn http_ingest_batch(
    State(state): State<AppState>,
    Json(req): Json<IngestBatchHttpRequest>,
) -> Result<Json<IngestBatchHttpResponse>, (StatusCode, String)> {
    let mut runs = state.store.runs.write().await;

    let run = runs.get_mut(&req.run_id).ok_or_else(|| {
        (
            StatusCode::NOT_FOUND,
            format!("Run not found: {}", req.run_id),
        )
    })?;

    if run.status != mlrun_proto::mlrun::v1::RunStatus::Running {
        return Err((
            StatusCode::PRECONDITION_FAILED,
            format!("Run {} is not running", req.run_id),
        ));
    }

    let metric_count = req.metrics.len();
    let param_count = req.params.len();
    let tag_count = req.tags.len();

    run.metrics_count += metric_count as u64;
    run.params_count += param_count as u64;

    // Update tags
    for tag in &req.tags {
        run.tags.insert(tag.key.clone(), tag.value.clone());
    }

    run.updated_at = std::time::SystemTime::now();

    let total = metric_count + param_count + tag_count;

    tracing::debug!(
        run_id = %req.run_id,
        metrics = metric_count,
        params = param_count,
        tags = tag_count,
        "HTTP: Ingested batch"
    );

    Ok(Json(IngestBatchHttpResponse {
        status: "ok".to_string(),
        accepted: total as i64,
    }))
}

/// Request to finish a run via HTTP.
#[derive(Debug, Deserialize)]
struct FinishRunHttpRequest {
    status: String,
}

#[derive(Debug, Serialize)]
struct FinishRunHttpResponse {
    status: String,
}

/// Finish a run via HTTP.
async fn http_finish_run(
    State(state): State<AppState>,
    axum::extract::Path(run_id): axum::extract::Path<String>,
    Json(req): Json<FinishRunHttpRequest>,
) -> Result<Json<FinishRunHttpResponse>, (StatusCode, String)> {
    let mut runs = state.store.runs.write().await;

    let run = runs.get_mut(&run_id).ok_or_else(|| {
        (StatusCode::NOT_FOUND, format!("Run not found: {}", run_id))
    })?;

    run.status = match req.status.as_str() {
        "finished" => mlrun_proto::mlrun::v1::RunStatus::Finished,
        "failed" => mlrun_proto::mlrun::v1::RunStatus::Failed,
        "killed" => mlrun_proto::mlrun::v1::RunStatus::Killed,
        _ => mlrun_proto::mlrun::v1::RunStatus::Finished,
    };
    run.updated_at = std::time::SystemTime::now();

    info!(run_id = %run_id, status = %req.status, "HTTP: Finished run");

    Ok(Json(FinishRunHttpResponse {
        status: "ok".to_string(),
    }))
}

// =============================================================================
// Server Setup
// =============================================================================

fn build_http_router(state: AppState) -> Router {
    Router::new()
        // Health and info
        .route("/", get(root))
        .route("/health", get(health))
        // SDK HTTP transport endpoints
        .route("/api/v1/runs", post(http_init_run))
        .route("/api/v1/ingest/batch", post(http_ingest_batch))
        .route("/api/v1/runs/{run_id}/finish", post(http_finish_run))
        .with_state(state)
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "mlrun_api=debug,tower_http=debug".into()),
        )
        .init();

    // Create shared state
    let store = Arc::new(InMemoryStore::new());
    let app_state = AppState {
        store: store.clone(),
    };

    // HTTP server address
    let http_addr = SocketAddr::from(([0, 0, 0, 0], 3001));

    // gRPC server address
    let grpc_addr = SocketAddr::from(([0, 0, 0, 0], 50051));

    // Build HTTP router
    let http_app = build_http_router(app_state);

    // Build gRPC service
    let ingest_service = IngestServiceImpl::new(store);
    let grpc_service = IngestServiceServer::new(ingest_service);

    info!("Starting MLRun API server");
    info!("  HTTP: http://{}", http_addr);
    info!("  gRPC: grpc://{}", grpc_addr);

    // Spawn gRPC server
    let grpc_handle = tokio::spawn(async move {
        if let Err(e) = TonicServer::builder()
            .add_service(grpc_service)
            .serve(grpc_addr)
            .await
        {
            warn!("gRPC server error: {}", e);
        }
    });

    // Start HTTP server (main thread)
    let http_listener = tokio::net::TcpListener::bind(http_addr).await.unwrap();
    let http_handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(http_listener, http_app).await {
            warn!("HTTP server error: {}", e);
        }
    });

    // Wait for both servers
    tokio::select! {
        _ = grpc_handle => info!("gRPC server stopped"),
        _ = http_handle => info!("HTTP server stopped"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use tower::ServiceExt;

    fn test_app() -> Router {
        let store = Arc::new(InMemoryStore::new());
        let state = AppState { store };
        build_http_router(state)
    }

    #[tokio::test]
    async fn test_root_endpoint() {
        let app = test_app();
        let response = app
            .oneshot(Request::builder().uri("/").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_health_endpoint() {
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .uri("/health")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_init_run_http() {
        let app = test_app();
        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/v1/runs")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        r#"{"project": "test-project", "name": "test-run"}"#,
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }
}
