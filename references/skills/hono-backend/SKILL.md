---
name: hono-backend
description: Use when building, reviewing, or maintaining Hono APIs or middleware, especially lightweight TypeScript backends, Web Standards handlers, Cloudflare Workers/Pages, Bun, Deno, Node.js, edge functions, webhooks, or portable runtime APIs.
---

# Hono Backend

Use Hono when the project needs a lightweight, portable TypeScript API layer
that can run across edge and Node-like runtimes.

## Pair With

- `stack-profile-selector` when choosing Hono as a backend decision.
- `typescript` for strict typing.
- `deployment-target-selector` and the target platform skill, especially
  `cloudflare-edge-hosting` or `edgeone-deploy`.

## Good Fit

- Lightweight APIs, webhooks, middleware, proxy logic, and edge functions.
- Projects targeting Cloudflare Workers/Pages Functions, Bun, Deno, Node.js,
  Vercel, Netlify, Lambda, or other Web Standards-style runtimes.
- Apps that need portable Request/Response semantics and small deployment units.
- Teams that want more structure than raw handlers but less ceremony than NestJS.

## Poor Fit

- Large enterprise apps that need DI-heavy modular architecture, decorators,
  extensive microservice abstractions, or Java/Spring-like conventions.
- Projects already standardized on NestJS, Elysia, Express, or another backend.
- Stateful backends without a clear storage/bindings/database plan.

## Contract Checklist

```yaml
backend_profile:
  framework: "hono"
  runtime: "edge | node | bun | deno | unknown"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  architecture_weight: "light"
  required_capabilities: []
  required_skills:
    - "stack-profile-selector"
    - "hono-backend"
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

- Keep handlers small and route groups clear.
- Prefer Web Standard `Request`/`Response` compatible patterns.
- Keep platform bindings and environment variables typed and explicit.
- Keep middleware order obvious and tested.
- Do not use Hono as a substitute for a full enterprise architecture when the
  project actually needs heavy module boundaries.

## Verification

Use the project's existing commands first. Typical checks:

- Typecheck/build for the chosen runtime.
- Route tests with the Hono app test client or project test framework.
- Local preview/runtime smoke for Workers, Pages Functions, Bun, Node, or other target runtime.
- Binding/env/secrets verification outside source control.

## Block Instead of Defaulting

Block when the runtime target, platform bindings, stateful services, or migration
intent are unclear.
