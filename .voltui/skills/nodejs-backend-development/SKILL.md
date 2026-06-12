---
name: nodejs-backend-development
description: Build and review Node.js backend services. Use for Express/Fastify/NestJS APIs, async behavior, package management, streams, workers, observability, and production hardening.
---

# Node.js Backend Development

## Purpose

Support Node.js service development with attention to async correctness, event loop health, dependency risk, and production behavior.

## Workflow

1. Identify runtime version, package manager, module format, and framework.
2. Trace request lifecycle, async boundaries, validation, and error handling.
3. Avoid blocking the event loop in request paths.
4. Prefer typed contracts when TypeScript is available.
5. Add focused unit/integration tests and run lint/typecheck where present.

## Checklist

- Unhandled promise rejections and lost async errors.
- Input validation, auth checks, rate limits, and file upload limits.
- Streams, backpressure, body size, and timeout behavior.
- Worker threads or queues for CPU-heavy tasks.
- Dependency lockfiles, scripts, and supply-chain risk.
- Logs, metrics, traces, health checks, and graceful shutdown.

## Output

Return:

- Behavior summary.
- Security and reliability risks.
- Commands run.
- Follow-up operational tasks.
