---
name: semiconductor-test-program-review
description: Review semiconductor test program logic, limits, binning, datalog output, multisite behavior, correlation hooks, and production readiness. Use for ATE program changes, release reviews, and debug of suspicious yield shifts.
---

# Semiconductor Test Program Review

## Purpose

Review ATE test program behavior for correctness, maintainability, and production risk before release.

## Review Checklist

- Test flow ordering and dependencies.
- Limit source, units, guardbands, and version control.
- Bin mapping and retest behavior.
- Datalog completeness and field naming.
- Multisite behavior and shared resource conflicts.
- Calibration, compensation, and correlation logic.
- Pattern/vector revision control.
- Skip conditions and engineering-only flags.
- Test time and timeout behavior.
- Error handling and fail-safe behavior.

## Workflow

1. Identify changed files, changed tests, changed limits, and changed binning.
2. Check whether changes affect production disposition.
3. Look for site-specific behavior and uninitialized state.
4. Verify datalog compatibility with yield/SPC pipelines.
5. Produce release risk notes and required validation runs.

## Output

Return findings ordered by severity:

- Blocking issues.
- Production risk issues.
- Maintainability issues.
- Missing validation.
- Suggested validation matrix.

## Boundaries

Do not approve release without user-provided validation evidence.
