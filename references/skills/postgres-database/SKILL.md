---
name: postgres-database
description: Use when building, reviewing, or maintaining PostgreSQL-backed persistence, including schema migrations, transactional multi-user services, JSONB, extensions, LISTEN/NOTIFY, queues, Supabase/SupaCloud-style platforms, or production data operations.
---

# PostgreSQL Database

Use PostgreSQL when the project needs production-grade relational persistence,
multi-user concurrency, transactions, extensions, or platform integration such
as SupaCloud/Supabase-style services.

## Pair With

- `database-profile-selector` when choosing Postgres.
- `deployment-target-selector` when provider, network, region, or secrets affect access.
- `supacloud-platform` when the project uses SupaCloud.
- Backend/fullstack skills for the application layer that accesses the database.

## Good Fit

- Multi-user web services, SaaS apps, admin systems, and production APIs.
- Strong relational integrity, transactions, concurrent writes, JSONB, full-text
  search, extensions, LISTEN/NOTIFY, queues, reporting, or auditability.
- Auth/storage/platform stacks that already standardize on Postgres.

## Poor Fit

- Pure static sites or apps with no persistence.
- Tiny local-only tools where SQLite is enough.
- Edge-only runtimes without an HTTP/database proxy, platform connector, or TCP
  access plan.

## Contract Checklist

```yaml
database_profile:
  target: "postgres"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  data_scope: "multi-user | enterprise | unknown"
  consistency: "transactional"
  access_pattern: "server-only | direct-tcp | http-api | unknown"
  migration_strategy: ""
  backup_restore: ""
  required_skills:
    - "database-profile-selector"
    - "postgres-database"
  verification:
    schema_check: ""
    migration_check: ""
    integration_test: ""
    runtime_smoke: ""
  non_goals:
    - "do not migrate database unless explicitly requested"
```

## Defaults

- Preserve existing migration tooling and schema conventions.
- Keep secrets out of source control and logs.
- Treat indexes, constraints, migrations, rollback, backup/restore, and seed data
  as part of the implementation, not afterthoughts.
- Prefer direct Postgres features when the project already relies on them.

## Verification

- Migration dry run or project migration check.
- Integration tests against the configured test database when available.
- Runtime smoke for changed queries, transactions, auth policies, jobs, and
  notification/queue behavior.
- Backup/restore or rollback notes for production data changes.

## Block Instead of Defaulting

Block when provider/network access, migrations, credentials, data residency,
tenant boundaries, backup/restore, or destructive data-change risk is unclear.
