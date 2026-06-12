---
name: cicd-release-management
description: Design, review, and debug CI/CD pipelines, release plans, versioning, rollback, container builds, and deployment verification.
---

# CI/CD And Release Management

## Purpose

Help teams ship reliably with repeatable builds, clear release gates, and practical rollback plans.

## Workflow

1. Inspect pipeline triggers, permissions, secrets, artifacts, and deployment targets.
2. Check build determinism, dependency caching, image tagging, and provenance.
3. Verify test stages and release gates match risk.
4. Define rollout, smoke checks, monitoring, and rollback.
5. Produce commands and checklist for operators.

## Checklist

- Least-privilege tokens and protected environments.
- Reproducible builds and pinned dependencies.
- Artifact/image signing where applicable.
- Database migration order and rollback plan.
- Post-deploy health checks and metrics.

## Output

Return:

- Pipeline risk summary.
- Recommended pipeline changes.
- Release checklist.
- Rollback steps.
