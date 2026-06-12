---
name: rust-development
description: Build and review Rust applications, libraries, CLIs, and systems code. Use for ownership, lifetimes, async, error handling, unsafe review, performance, and FFI.
---

# Rust Development

## Purpose

Support Rust engineering with attention to correctness, API design, safe concurrency, and explicit unsafe boundaries.

## Workflow

1. Identify toolchain, edition, crate layout, and target platform.
2. Keep public APIs small and errors meaningful.
3. Prefer safe abstractions; isolate and document `unsafe`.
4. Check ownership and lifetime complexity against actual requirements.
5. Verify with `cargo test`, `cargo clippy`, `cargo fmt`, and benchmarks where useful.

## Checklist

- `Result` and error context.
- Trait bounds, generics, and public API stability.
- Async runtime boundaries and blocking calls.
- Send/Sync, Arc/Mutex/RwLock usage, and deadlocks.
- FFI, unsafe invariants, alignment, and aliasing.
- Feature flags and dependency surface.

## Output

Return:

- API and ownership summary.
- Safety and concurrency risks.
- Verification commands.
- Compatibility notes.
