---
name: code-review
description: Review code changes for bugs, regressions, missing tests, security issues, maintainability, and production risks. Use for pull requests, diffs, commits, or release review.
---

# Code Review

## Purpose

Find issues that matter before code reaches production. Prioritize correctness, security, data integrity, and user-visible regressions over style preferences.

## Workflow

1. Understand the intended change, touched files, and runtime surface.
2. Inspect tests, migrations, config, dependencies, and deployment implications.
3. Look for behavior changes, edge cases, concurrency issues, and missing validation.
4. Order findings by severity and cite concrete files or functions.
5. If no issues are found, state remaining test gaps or assumptions.

## Output

Return:

- Findings first, ordered by severity.
- Open questions.
- Test gaps.
- Short summary only after findings.

## Boundaries

Do not request broad refactors unless they block correctness or maintainability for the current change.
