---
name: semiconductor-yield-spc
description: Analyze semiconductor yield, binning, wafer map, SPC, Cpk/Ppk, lot drift, tester correlation, and production excursion data. Use for CSV/Excel test data review, yield pareto, wafer-level patterns, and excursion triage.
---

# Semiconductor Yield And SPC Analysis

## Purpose

Help production, product, and test engineers analyze test data and identify yield drivers, drift, correlation issues, and excursion signals.

## Required Inputs

- Lot, wafer, die, site, bin, test name, value, limit, temperature, voltage, tester, handler/prober, and timestamp fields if available.
- Retest and final disposition policy.
- Known process split, product revision, test program revision, and tester fleet changes.

## Workflow

1. Validate data schema, missing fields, units, duplicates, and retest handling.
2. Compute yield by lot, wafer, site, bin, tester, temperature, and test program revision.
3. Build pareto tables for hard bins, soft bins, and failing tests.
4. Detect spatial patterns: edge, center, quadrant, row/column, site-related, and radial signatures.
5. Evaluate parametric stability: mean, sigma, Cpk/Ppk, control limits, drift, outliers, and limit proximity.
6. Compare testers/sites/program versions for correlation and systematic offsets.
7. Produce an excursion triage: likely causes, evidence, recommended containment, and follow-up experiments.

## Output

Return:

- Executive summary.
- Data quality issues.
- Yield and bin pareto.
- SPC and drift findings.
- Tester/site correlation findings.
- Suspected root cause hypotheses.
- Recommended next actions.

## Boundaries

Do not overstate root cause from correlation alone. Separate evidence-backed findings from hypotheses.
