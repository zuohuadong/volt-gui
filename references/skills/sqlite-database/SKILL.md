---
name: sqlite-database
description: Use when building, reviewing, or maintaining SQLite-backed persistence for local-first apps, desktop apps, CLI tools, prototypes, tests, embedded databases, or small single-user deployments.
---

# SQLite Database

Use SQLite when persistence should be local, embedded, simple to run, and easy to
test without a separate database service.

## Pair With

- `database-profile-selector` when choosing SQLite.
- `stack-profile-selector` for app/runtime decisions.
- `electron-desktop`, `tauri-desktop`, `mobile-app`, or `bun-cli-cross-platform`
  when the database lives inside a desktop/mobile/CLI app.

## Good Fit

- Single-user desktop apps, local tools, CLIs, prototypes, fixtures, and tests.
- Small self-contained services where operational simplicity matters more than
  horizontal write scaling.
- Local-first workflows with clear sync/export/import boundaries.

## Poor Fit

- Multi-instance server deployments with frequent concurrent writes.
- Multi-tenant production SaaS with strong operational, backup, and access-control
  requirements.
- Edge runtimes where local filesystem persistence is unavailable.

## Contract Checklist

```yaml
database_profile:
  target: "sqlite"
  decision_source: "user | docs | detected | project-overlay | recommended-fallback | blocked"
  evidence: []
  data_scope: "local-single-user"
  consistency: "local-file"
  access_pattern: "embedded"
  migration_strategy: ""
  backup_restore: ""
  required_skills:
    - "database-profile-selector"
    - "sqlite-database"
  verification:
    schema_check: ""
    migration_check: ""
    integration_test: ""
    runtime_smoke: ""
  non_goals:
    - "do not migrate database unless explicitly requested"
```

## Defaults

- Keep schema migrations deterministic and versioned when data must survive upgrades.
- Keep database paths explicit and platform-appropriate.
- Treat backup/export/import as a product requirement for user-owned local data.
- Avoid introducing an ORM unless the repository already uses one or schema
  complexity justifies it.

## Verification

- Migration dry run on a clean database and an existing fixture when available.
- Integration test for read/write paths.
- Runtime smoke for packaged desktop/mobile/CLI paths when applicable.

## Block Instead of Defaulting

Block when sync, multi-user access, backup/restore, encryption-at-rest, or
deployment filesystem behavior is unclear.
