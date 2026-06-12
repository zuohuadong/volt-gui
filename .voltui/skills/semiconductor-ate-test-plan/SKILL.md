---
name: semiconductor-ate-test-plan
description: Create and review semiconductor ATE test plans for wafer sort, final test, characterization, guardbands, coverage, and production release readiness. Use for test strategy, coverage matrix, limit definition, test time reduction, multisite planning, and release checklists.
---

# Semiconductor ATE Test Plan

## Purpose

Help test engineering teams produce practical ATE test plans that connect product requirements, datasheet limits, characterization data, production constraints, and quality gates.

## Required Context

Ask for missing context before making hard recommendations:

- Product type and process node.
- Wafer sort, final test, system-level test, or characterization stage.
- Tester platform and handler/prober constraints.
- Datasheet limits, spec tables, and guardband policy.
- Known failure modes, DFT coverage, and reliability requirements.
- Target test time, multisite count, and cost constraints.

## Workflow

1. Identify product requirements and critical parameters.
2. Build a coverage matrix: DC, AC, functional, scan/DFT, memory/BIST, analog/RF/mixed-signal, thermal, power, leakage, and ESD-related screens where applicable.
3. Define test conditions: voltage, frequency, temperature, trim states, modes, pattern sets, and setup dependencies.
4. Propose limits and guardbands, separating datasheet limits, production limits, characterization limits, and engineering debug limits.
5. Call out risks: over-screening, under-screening, correlation gaps, test escape risk, yield loss, unstable measurements, and long test time.
6. Produce a release checklist for engineering validation, correlation, GRR, Cpk/Ppk, test time, multisite, and production monitoring.

## Output

Return:

- Test objective summary.
- Coverage matrix.
- Proposed test flow.
- Limit and guardband notes.
- Characterization and correlation plan.
- Production release checklist.
- Open questions and risks.

## Boundaries

Do not fabricate device specifications. Mark assumptions clearly. Do not claim automotive, medical, or safety compliance without user-provided standards and evidence.
