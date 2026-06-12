---
name: nestjs-backend
description: Use when building, reviewing, or maintaining NestJS backends, especially enterprise Node.js APIs, modular architecture, dependency injection, decorators, guards, pipes, interceptors, OpenAPI, microservices, or Java/Spring-like team conventions.
---

# NestJS Backend

Use NestJS when the project needs a heavier, opinionated Node.js backend
architecture similar to Java/Spring-style applications.

## Pair With

- `stack-profile-selector` when choosing NestJS as a backend decision.
- `typescript` for strict typing.
- `deployment-target-selector` when deployment target affects runtime shape.
- Database/auth/provider skills required by the project.

## Good Fit

- Enterprise APIs with many modules, teams, bounded contexts, or long-term maintenance needs.
- Projects needing dependency injection, decorators, guards, pipes, interceptors,
  exception filters, OpenAPI/Swagger, queues, WebSockets, microservices, or GraphQL.
- Teams coming from Java/Spring/Angular-style architecture.
- Existing Node.js projects that already use Express/Fastify ecosystem packages
  and benefit from a structured application framework.

## Poor Fit

- Small APIs, webhooks, edge functions, or static/fullstack apps where a small
  router is enough.
- Bun-first projects where Elysia is a better fit.
- Edge-first runtimes where Hono or platform-native handlers are simpler.
- Projects that do not want decorators/DI/module architecture.

## Contract Checklist

```yaml
backend_profile:
  framework: "nestjs"
  runtime: "node"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  architecture_weight: "heavy"
  required_capabilities: []
  required_skills:
    - "stack-profile-selector"
    - "nestjs-backend"
    - "typescript"
  verification:
    typecheck: ""
    lint: ""
    test: ""
    build: ""
    runtime_smoke: ""
  non_goals:
    - "do not migrate backend framework unless explicitly requested"
```

## Defaults

- Preserve existing Nest module/provider/controller conventions.
- Keep dependency injection boundaries explicit.
- Prefer DTOs, validation pipes, guards, interceptors, and exception filters when
  the project already uses them.
- Keep framework-specific generated structure instead of flattening into ad hoc files.
- Do not introduce NestJS only for a tiny API or webhook.

## Verification

Use the project's existing commands first. Typical checks:

- Typecheck and build.
- Unit/integration tests for controllers/providers.
- OpenAPI/Swagger generation if API contracts changed.
- Runtime smoke for changed routes, guards, auth, queues, or microservice transport.

## Block Instead of Defaulting

Block when the task implies migration from another backend framework, when
runtime target is edge/serverless but Nest compatibility is unclear, or when the
heavy architecture cost is not justified by project requirements.
