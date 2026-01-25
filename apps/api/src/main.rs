//! MLRun API Server
//!
//! This is the monolith API server that handles:
//! - HTTP REST API for queries and SDK HTTP transport
//! - gRPC API for high-throughput SDK ingestion
//!
//! Architecture: Single binary serving both protocols on different ports.

mod auth;
mod services;
mod storage;

use std::net::SocketAddr;
use std::sync::Arc;

use axum::{
    extract::State,
    http::StatusCode,
    middleware,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use tonic::transport::Server as TonicServer;
use tracing::{info, warn};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use mlrun_proto::mlrun::v1::ingest_service_server::IngestServiceServer;
use services::{
    compute_payload_hash, ingest::InMemoryStore, IdempotencyResult, IdempotencyStore,
    IngestServiceImpl, MetricPayload, ParamPayload, TagPayload,
};
use auth::{ApiKeyStore, auth_middleware};

/// Application state shared across handlers.
#[derive(Clone)]
pub struct AppState {
    store: Arc<InMemoryStore>,
    key_store: Arc<ApiKeyStore>,
    idempotency_store: Arc<IdempotencyStore>,
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
    /// SDK-provided batch identifier for idempotency
    batch_id: Option<String>,
    /// Sequence number for ordering (optional)
    seq: Option<i64>,
    metrics: Vec<MetricData>,
    params: Vec<ParamData>,
    tags: Vec<TagData>,
    #[allow(dead_code)]
    timestamp: Option<f64>,
    #[allow(dead_code)]
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
    /// Whether this was a duplicate batch
    duplicate: bool,
    /// Warnings about the batch (e.g., out of order)
    #[serde(skip_serializing_if = "Vec::is_empty")]
    warnings: Vec<String>,
}

/// Ingest a batch of events via HTTP (for SDK HTTP transport).
async fn http_ingest_batch(
    State(state): State<AppState>,
    Json(req): Json<IngestBatchHttpRequest>,
) -> Result<Json<IngestBatchHttpResponse>, (StatusCode, String)> {
    // Generate batch_id if not provided
    let batch_id = req.batch_id.unwrap_or_else(|| uuid::Uuid::now_v7().to_string());
    let seq = req.seq.unwrap_or(0);

    // Convert request data for hashing
    let metric_payloads: Vec<MetricPayload> = req.metrics.iter()
        .map(|m| MetricPayload {
            name: m.name.clone(),
            value: m.value,
            step: m.step,
        })
        .collect();

    let param_payloads: Vec<ParamPayload> = req.params.iter()
        .map(|p| ParamPayload {
            name: p.name.clone(),
            value: p.value.clone(),
        })
        .collect();

    let tag_payloads: Vec<TagPayload> = req.tags.iter()
        .map(|t| TagPayload {
            key: t.key.clone(),
            value: t.value.clone(),
        })
        .collect();

    // Compute payload hash for idempotency
    let payload_hash = compute_payload_hash(&metric_payloads, &param_payloads, &tag_payloads);

    // Check and record for idempotency
    let metric_count = req.metrics.len();
    let param_count = req.params.len();
    let tag_count = req.tags.len();

    // Get project_id from run (read lock first)
    let project_id = {
        let runs = state.store.runs.read().await;
        let run = runs.get(&req.run_id).ok_or_else(|| {
            (
                StatusCode::NOT_FOUND,
                format!("Run not found: {}", req.run_id),
            )
        })?;
        run.project_id.clone()
    };

    let idempotency_result = state.idempotency_store.check_and_record(
        &project_id,
        &req.run_id,
        &batch_id,
        seq,
        &payload_hash,
        metric_count as i32,
        param_count as i32,
        tag_count as i32,
    ).await;

    // Handle idempotency results
    let mut warnings = Vec::new();

    match &idempotency_result {
        IdempotencyResult::Duplicate => {
            // Duplicate batch - return success without processing
            return Ok(Json(IngestBatchHttpResponse {
                status: "ok".to_string(),
                accepted: 0,
                duplicate: true,
                warnings: vec![],
            }));
        }
        IdempotencyResult::Conflict { expected_hash, actual_hash } => {
            // Conflicting batch - error
            return Err((
                StatusCode::CONFLICT,
                format!(
                    "Batch {} conflicts with existing batch (expected hash {}, got {})",
                    batch_id, expected_hash, actual_hash
                ),
            ));
        }
        IdempotencyResult::OutOfOrder { expected_seq, actual_seq } => {
            warnings.push(format!(
                "Batch received out of order (expected seq >= {}, got {})",
                expected_seq, actual_seq
            ));
        }
        IdempotencyResult::New => {
            // New batch - proceed normally
        }
    }

    // Now process the batch
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
        batch_id = %batch_id,
        seq = seq,
        metrics = metric_count,
        params = param_count,
        tags = tag_count,
        "HTTP: Ingested batch"
    );

    Ok(Json(IngestBatchHttpResponse {
        status: "ok".to_string(),
        accepted: total as i64,
        duplicate: false,
        warnings,
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
// Query API Handlers
// =============================================================================

/// Query parameters for listing runs.
#[derive(Debug, Default, Deserialize)]
struct ListRunsQuery {
    /// Filter by project ID
    project: Option<String>,
    /// Filter by run status
    status: Option<String>,
    /// Maximum number of runs to return
    limit: Option<usize>,
    /// Number of runs to skip
    offset: Option<usize>,
}

/// A run in the response.
#[derive(Debug, Serialize)]
struct RunResponse {
    run_id: String,
    project_id: String,
    name: Option<String>,
    status: String,
    metrics_count: u64,
    params_count: u64,
    tags: std::collections::HashMap<String, String>,
    created_at: String,
    updated_at: String,
    duration_seconds: Option<f64>,
}

/// Response for listing runs.
#[derive(Debug, Serialize)]
struct ListRunsResponse {
    runs: Vec<RunResponse>,
    total: usize,
    limit: usize,
    offset: usize,
}

/// List runs with optional filtering.
async fn http_list_runs(
    State(state): State<AppState>,
    axum::extract::Query(query): axum::extract::Query<ListRunsQuery>,
) -> Result<Json<ListRunsResponse>, (StatusCode, String)> {
    let runs = state.store.runs.read().await;

    let limit = query.limit.unwrap_or(100).min(1000);
    let offset = query.offset.unwrap_or(0);

    // Filter runs
    let mut filtered_runs: Vec<_> = runs
        .values()
        .filter(|run| {
            // Filter by project
            if let Some(ref project) = query.project {
                if &run.project_id != project {
                    return false;
                }
            }

            // Filter by status
            if let Some(ref status) = query.status {
                let run_status = match run.status {
                    mlrun_proto::mlrun::v1::RunStatus::Running => "running",
                    mlrun_proto::mlrun::v1::RunStatus::Finished => "finished",
                    mlrun_proto::mlrun::v1::RunStatus::Failed => "failed",
                    mlrun_proto::mlrun::v1::RunStatus::Killed => "killed",
                    _ => "pending",
                };
                if run_status != status {
                    return false;
                }
            }

            true
        })
        .collect();

    // Sort by created_at descending (newest first)
    filtered_runs.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    let total = filtered_runs.len();

    // Apply pagination
    let page_runs: Vec<_> = filtered_runs
        .into_iter()
        .skip(offset)
        .take(limit)
        .map(|run| {
            let duration = run
                .updated_at
                .duration_since(run.created_at)
                .ok()
                .map(|d| d.as_secs_f64());

            RunResponse {
                run_id: run.run_id.clone(),
                project_id: run.project_id.clone(),
                name: run.name.clone(),
                status: match run.status {
                    mlrun_proto::mlrun::v1::RunStatus::Running => "running".to_string(),
                    mlrun_proto::mlrun::v1::RunStatus::Finished => "finished".to_string(),
                    mlrun_proto::mlrun::v1::RunStatus::Failed => "failed".to_string(),
                    mlrun_proto::mlrun::v1::RunStatus::Killed => "killed".to_string(),
                    _ => "pending".to_string(),
                },
                metrics_count: run.metrics_count,
                params_count: run.params_count,
                tags: run.tags.clone(),
                created_at: format!("{:?}", run.created_at),
                updated_at: format!("{:?}", run.updated_at),
                duration_seconds: duration,
            }
        })
        .collect();

    Ok(Json(ListRunsResponse {
        runs: page_runs,
        total,
        limit,
        offset,
    }))
}

/// Detailed run response including metrics summary.
#[derive(Debug, Serialize)]
struct RunDetailResponse {
    run_id: String,
    project_id: String,
    name: Option<String>,
    status: String,
    metrics_count: u64,
    params_count: u64,
    tags: std::collections::HashMap<String, String>,
    created_at: String,
    updated_at: String,
    duration_seconds: Option<f64>,
    // Additional detail fields
    metrics_summary: Vec<MetricSummaryResponse>,
}

#[derive(Debug, Serialize)]
struct MetricSummaryResponse {
    name: String,
    last_value: f64,
    last_step: i64,
}

/// Get run detail by ID.
async fn http_get_run(
    State(state): State<AppState>,
    axum::extract::Path(run_id): axum::extract::Path<String>,
) -> Result<Json<RunDetailResponse>, (StatusCode, String)> {
    let runs = state.store.runs.read().await;

    let run = runs.get(&run_id).ok_or_else(|| {
        (StatusCode::NOT_FOUND, format!("Run not found: {}", run_id))
    })?;

    let duration = run
        .updated_at
        .duration_since(run.created_at)
        .ok()
        .map(|d| d.as_secs_f64());

    // TODO: Get actual metrics summary from ClickHouse
    // For now, return empty list (metrics are tracked in-memory as count only)
    let metrics_summary = vec![];

    Ok(Json(RunDetailResponse {
        run_id: run.run_id.clone(),
        project_id: run.project_id.clone(),
        name: run.name.clone(),
        status: match run.status {
            mlrun_proto::mlrun::v1::RunStatus::Running => "running".to_string(),
            mlrun_proto::mlrun::v1::RunStatus::Finished => "finished".to_string(),
            mlrun_proto::mlrun::v1::RunStatus::Failed => "failed".to_string(),
            mlrun_proto::mlrun::v1::RunStatus::Killed => "killed".to_string(),
            _ => "pending".to_string(),
        },
        metrics_count: run.metrics_count,
        params_count: run.params_count,
        tags: run.tags.clone(),
        created_at: format!("{:?}", run.created_at),
        updated_at: format!("{:?}", run.updated_at),
        duration_seconds: duration,
        metrics_summary,
    }))
}

// =============================================================================
// Server Setup
// =============================================================================

fn build_http_router(state: AppState) -> Router {
    // Routes that require authentication
    let protected_routes = Router::new()
        // SDK HTTP transport endpoints (ingestion)
        .route("/api/v1/runs", post(http_init_run))
        .route("/api/v1/ingest/batch", post(http_ingest_batch))
        .route("/api/v1/runs/{run_id}/finish", post(http_finish_run))
        // Query API endpoints
        .route("/api/v1/runs", get(http_list_runs))
        .route("/api/v1/runs/{run_id}", get(http_get_run))
        .layer(middleware::from_fn_with_state(
            state.key_store.clone(),
            auth_middleware,
        ));

    // Public routes (no auth required)
    let public_routes = Router::new()
        .route("/", get(root))
        .route("/health", get(health));

    // Combine routes
    Router::new()
        .merge(public_routes)
        .merge(protected_routes)
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

    // Initialize API key store
    let key_store = Arc::new(ApiKeyStore::new());
    key_store.init_from_env().await;

    // Initialize idempotency store
    let idempotency_store = Arc::new(IdempotencyStore::new());

    // Create shared state
    let store = Arc::new(InMemoryStore::new());
    let app_state = AppState {
        store: store.clone(),
        key_store: key_store.clone(),
        idempotency_store,
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
        // Use dev mode for tests (auth disabled)
        let key_store = Arc::new(ApiKeyStore::new_dev_mode());
        let idempotency_store = Arc::new(IdempotencyStore::new());
        let state = AppState { store, key_store, idempotency_store };
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
