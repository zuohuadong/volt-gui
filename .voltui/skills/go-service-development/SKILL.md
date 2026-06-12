---
name: go-service-development
description: Build and review Go services, CLIs, and infrastructure tools. Use for HTTP/gRPC APIs, concurrency, context cancellation, database access, observability, and deployment.
---

# Go Service Development

## Purpose

Help engineers write idiomatic, reliable Go with explicit error handling, predictable concurrency, and simple operational behavior.

## Workflow

1. Inspect module layout, Go version, dependencies, and existing package boundaries.
2. Keep APIs small and explicit; avoid framework-heavy abstractions unless already used.
3. Propagate `context.Context` through IO and request-scoped work.
4. Handle errors with enough context for operators and callers.
5. Add table-driven tests or integration tests where behavior crosses boundaries.

## Checklist

- Goroutine lifetime, channel ownership, leaks, and cancellation.
- HTTP timeouts, request size limits, and graceful shutdown.
- Database pooling, transactions, migrations, and query cancellation.
- JSON validation, zero values, pointer semantics, and time handling.
- Race detector, benchmarks, pprof, and structured logs.

## Output

Return:

- Code path summary.
- Concurrency and error-handling risks.
- Verification commands.
- Deployment notes.
