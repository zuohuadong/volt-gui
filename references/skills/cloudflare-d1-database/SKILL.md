---
name: cloudflare-d1-database
description: Use when building, reviewing, or maintaining Cloudflare D1 persistence for Workers, Pages Functions, edge apps, Wrangler migrations, bindings, and edge-compatible relational storage.
---

# Cloudflare D1 Database

Use Cloudflare D1 when a Cloudflare Workers or Pages Functions app needs
relational persistence through Cloudflare platform bindings.

## Pair With

- `database-profile-selector` when choosing D1.
- `deployment-target-selector` and `cloudflare-edge-hosting`.
- `hono-backend`, `sveltekit-fullstack`, `nuxt-fullstack`, or the existing
  framework skill when D1 is accessed by edge handlers.

## Good Fit

- Cloudflare Workers/Pages apps needing small to moderate relational storage.
- Edge-first APIs, webhooks, lightweight apps, and previewable deployments that
  already use Wrangler and Cloudflare bindings.
- Projects that accept platform-specific D1 constraints and migration workflow.

## Poor Fit

- Non-Cloudflare runtimes.
- Heavy relational workloads, high-write workloads, or workloads requiring broad
  PostgreSQL features, extensions, LISTEN/NOTIFY, or direct TCP access.
- Apps without a clear binding, migration, environment, and backup plan.

## Contract Checklist

```yaml
database_profile:
  target: "cloudflare-d1"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  data_scope: "edge-app"
  consistency: "globally-distributed | relational | unknown"
  access_pattern: "edge-binding"
  migration_strategy: ""
  backup_restore: ""
  required_skills:
    - "database-profile-selector"
    - "cloudflare-d1-database"
    - "cloudflare-edge-hosting"
  verification:
    schema_check: ""
    migration_check: ""
    integration_test: ""
    runtime_smoke: ""
  non_goals:
    - "do not migrate database unless explicitly requested"
```

## Defaults

- Keep D1 bindings explicit in environment and framework types.
- Keep migrations in the repository and test them against local and remote
  environments when possible.
- Keep edge runtime constraints visible in the Task Contract.
- Avoid raw Node-only database clients in D1 handlers.

## Verification

- Wrangler/local migration check.
- Typecheck for bindings and runtime environment.
- Integration or route tests that exercise D1 reads/writes.
- Local preview or deployed Worker/Pages runtime smoke.

## Block Instead of Defaulting

Block when the project is not targeting Cloudflare, when bindings/account access
are missing, or when data scale/consistency/backup requirements exceed D1 fit.
