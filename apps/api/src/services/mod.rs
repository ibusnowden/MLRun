//! Service implementations for MLRun API.
//!
//! This module contains the gRPC and HTTP service implementations.

pub mod ingest;

pub use ingest::IngestServiceImpl;
