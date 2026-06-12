---
name: sql-database-development
description: Design, review, and optimize SQL database schemas and queries. Use for PostgreSQL/MySQL, migrations, indexes, transactions, analytics queries, and data integrity.
---

# SQL Database Development

## Purpose

Help engineers produce database changes that are correct, observable, reversible, and safe under production traffic.

## Workflow

1. Identify database engine, version, migration tool, data volume, and write/read pattern.
2. Separate schema design, query design, migration safety, and operational rollout.
3. Use constraints to protect data integrity, not only application checks.
4. Evaluate indexes against actual query predicates and cardinality.
5. Plan rollback or forward-fix for production migrations.

## Checklist

- Primary keys, foreign keys, uniqueness, check constraints, and nullability.
- Transaction boundaries, isolation, locking, and deadlocks.
- Online migration safety, backfills, and batching.
- Query plans, indexes, partitioning, and statistics.
- Timezones, JSON fields, audit fields, and soft deletes.

## Output

Return:

- Schema/query summary.
- Data integrity risks.
- Migration plan.
- Verification SQL or commands.
