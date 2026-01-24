//! Storage layer implementations for MLRun.
//!
//! This module provides storage backends for metrics and metadata.

pub mod clickhouse;

pub use clickhouse::{ClickHouseClient, MetricsRepository};
