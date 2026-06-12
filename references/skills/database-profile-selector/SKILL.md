---
name: database-profile-selector
description: Use when choosing, validating, or recording database/storage decisions, especially SQLite, Cloudflare D1, PostgreSQL, migrations, data residency, edge/runtime constraints, or Task Contract database_profile fields.
---

# Database Profile Selector

Use this skill to prevent agents from silently picking a database because a
backend exists. Database choice is a contract decision with evidence, constraints,
and verification.

## Pair With

- `stack-profile-selector` for app/backend/fullstack stack decisions.
- `deployment-target-selector` when platform, region, or runtime affects storage.
- `sqlite-database`, `cloudflare-d1-database`, or `postgres-database` after the
  target is selected.
- Backend/fullstack skills when route handlers, actions, jobs, or APIs access data.

## Decision Order

Use the first source that applies:

1. Current user instruction.
2. Existing project docs, schema files, migrations, ORM config, env vars, and
   deployment docs.
3. Existing code and package evidence.
4. Deployment/runtime constraints such as local file, edge binding, TCP access,
   managed Postgres, or self-hosted Postgres.
5. Data shape and operational needs.
6. Recommended fallback for greenfield projects with no conflicting evidence.
7. Block and ask.

## Contract Fields

```yaml
database_profile:
  target: "none | existing | sqlite | cloudflare-d1 | postgres | blocked"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  data_scope: "none | local-single-user | edge-app | multi-user | enterprise | unknown"
  consistency: "local-file | relational | transactional | globally-distributed | unknown"
  access_pattern: "embedded | server-only | edge-binding | direct-tcp | http-api | unknown"
  migration_strategy: ""
  backup_restore: ""
  required_skills: []
  verification:
    schema_check: ""
    migration_check: ""
    integration_test: ""
    runtime_smoke: ""
  non_goals:
    - "do not migrate database unless explicitly requested"
```

## Selection

- Existing database evidence wins.
- Use `none` when the project has no persistence need.
- Use SQLite for local-first, desktop, CLI, single-user, embedded, prototype, or
  testable file-backed persistence.
- Use Cloudflare D1 for Cloudflare Workers/Pages apps that need relational
  storage through platform bindings and edge-compatible deployment.
- Use PostgreSQL for multi-user production services, stronger transactional
  needs, relational integrity, JSONB, extensions, LISTEN/NOTIFY, queues, auth
  integration, analytics-style queries, or SupaCloud/Supabase-style platforms.
- Treat MySQL, Redis, MongoDB, vector DBs, and other stores as explicit or
  detected project choices; do not invent them as fallback.

## Block Conditions

Block when data ownership, multi-tenancy, backup/restore, migrations, region,
compliance, offline sync, write concurrency, provider access, secrets, or runtime
connectivity are unclear.
