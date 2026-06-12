---
name: java-backend-development
description: Build and review Java backend services. Use for Spring Boot, JVM tuning, REST APIs, persistence, concurrency, testing, packaging, and production reliability.
---

# Java Backend Development

## Purpose

Support Java service development with production-oriented defaults: clear APIs, safe persistence, observable behavior, and maintainable tests.

## Workflow

1. Identify Java version, framework, build tool, and runtime target.
2. Follow project conventions before introducing new libraries or patterns.
3. Validate API contracts, DTO mapping, persistence boundaries, and transaction behavior.
4. Treat concurrency, caching, and async execution as shared-state risks.
5. Add focused tests for controller/service/repository behavior based on blast radius.

## Checklist

- Spring configuration, bean lifecycle, profiles, and property binding.
- Transaction boundaries, isolation, lazy loading, and N+1 queries.
- Validation, error mapping, idempotency, and retries.
- Thread pools, CompletableFuture, virtual threads, and blocking calls.
- JVM memory, GC, startup time, and container limits.
- JUnit, Mockito, Testcontainers, integration tests.

## Output

Return:

- Implementation summary.
- Risk and compatibility notes.
- Test commands.
- Operational considerations.
