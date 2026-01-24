"""Simple training loop example with MLRun SDK.

This example demonstrates the basic usage of MLRun for logging
metrics during a training loop. The logging is non-blocking,
so it won't slow down your training.

Usage:
    python simple_training.py

Note: This example works even without a server running (offline mode).
"""

import math
import random
import time

import mlrun


def simulate_training_step(step: int) -> tuple[float, float]:
    """Simulate a training step returning loss and accuracy.

    In a real training loop, this would be your actual forward/backward pass.
    """
    # Simulate decreasing loss and increasing accuracy
    base_loss = 2.0 * math.exp(-step / 500) + 0.1
    loss = base_loss + random.uniform(-0.05, 0.05)

    base_acc = 1.0 - math.exp(-step / 300)
    accuracy = min(base_acc + random.uniform(-0.02, 0.02), 1.0)

    # Simulate some compute time
    time.sleep(0.001)

    return loss, accuracy


def main() -> None:
    """Run a simulated training loop with MLRun logging."""
    print("Starting training with MLRun...")

    # Initialize a run
    run = mlrun.init(
        project="example-project",
        name="simple-training",
        tags={"framework": "pytorch", "task": "classification"},
        config={"learning_rate": 0.001, "batch_size": 32, "epochs": 10},
    )

    print(f"Run ID: {run.run_id}")
    print(f"Offline mode: {run.is_offline}")

    # Log hyperparameters
    run.log_params(
        {
            "optimizer": "adam",
            "scheduler": "cosine",
            "weight_decay": 1e-4,
        }
    )

    # Training loop
    num_steps = 1000
    print(f"\nTraining for {num_steps} steps...")

    start_time = time.perf_counter()
    for step in range(num_steps):
        # Simulate training
        loss, accuracy = simulate_training_step(step)

        # Log metrics (non-blocking!)
        run.log({"loss": loss, "accuracy": accuracy}, step=step)

        # Print progress
        if step % 100 == 0:
            print(f"  Step {step}: loss={loss:.4f}, accuracy={accuracy:.4f}")

    elapsed = time.perf_counter() - start_time
    print(f"\nTraining completed in {elapsed:.2f}s")

    # Log final summary
    run.log_params({"final_loss": loss, "final_accuracy": accuracy})
    run.log_tags({"status": "completed"})

    # Finish the run (flushes all pending data)
    run.finish()

    print("Run finished!")


if __name__ == "__main__":
    main()
