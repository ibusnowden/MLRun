//! `MLRun` Protocol Buffer Definitions
//!
//! This crate provides Rust types generated from `MLRun`'s protobuf definitions.
//!
//! # Modules
//!
//! - [`mlrun::v1`] - Version 1 API types and services
//!
//! # Example
//!
//! ```rust,ignore
//! use mlrun_proto::mlrun::v1::{InitRunRequest, ProjectId};
//!
//! let request = InitRunRequest {
//!     project_id: Some(ProjectId {
//!         value: "my-project".to_string(),
//!     }),
//!     ..Default::default()
//! };
//! ```

#![forbid(unsafe_code)]
#![allow(clippy::all, clippy::pedantic, clippy::nursery)] // Generated code from prost/tonic is clippy-noisy.

/// Generated protobuf types for `MLRun` v1 API.
pub mod mlrun {
    #[allow(clippy::all)]
    pub mod v1 {
        tonic::include_proto!("mlrun.v1");
    }
}

// Re-export commonly used types at crate root for convenience
pub use mlrun::v1::*;

// Re-export prost types for timestamp handling
pub use prost_types::Timestamp;
