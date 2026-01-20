//! Build script for MLRun protobuf code generation.
//!
//! This generates Rust code from the proto files in /proto/mlrun/v1/.
//! The generated code is placed in OUT_DIR and included via `include!` macro.

use std::path::PathBuf;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    // Proto source directory
    let proto_dir = PathBuf::from("../../proto");

    // Proto files to compile
    let protos = &[
        proto_dir.join("mlrun/v1/common.proto"),
        proto_dir.join("mlrun/v1/ingest.proto"),
        proto_dir.join("mlrun/v1/query.proto"),
    ];

    // Include paths
    let includes = &[proto_dir.clone()];

    // Tell cargo to rerun if proto files change
    for proto in protos {
        println!("cargo:rerun-if-changed={}", proto.display());
    }

    // Configure tonic-build
    tonic_build::configure()
        // Generate server code
        .build_server(true)
        // Generate client code
        .build_client(true)
        // Compile protos
        .compile_protos(protos, includes)?;

    Ok(())
}
