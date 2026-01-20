<<<<<<< HEAD
fn main() {
    println!("track-api");
=======
use axum::{routing::get, Router};
use std::net::SocketAddr;
use tracing::info;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

async fn health() -> &'static str {
    "ok"
}

async fn root() -> &'static str {
    "MLRun API v0.1.0"
}

#[tokio::main]
async fn main() {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(tracing_subscriber::fmt::layer())
        .with(tracing_subscriber::EnvFilter::from_default_env())
        .init();

    // Build router
    let app = Router::new()
        .route("/", get(root))
        .route("/health", get(health));

    // Start server
    let addr = SocketAddr::from(([0, 0, 0, 0], 3001));
    info!("Starting MLRun API on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
>>>>>>> de683b6 (feat(core-001): complete monorepo scaffold)
}
