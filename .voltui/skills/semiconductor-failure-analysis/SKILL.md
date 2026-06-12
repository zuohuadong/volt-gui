---
name: semiconductor-failure-analysis
description: Structure semiconductor failure analysis from test symptoms, bin signatures, lab measurements, curve traces, scan/DFT evidence, and reliability data. Use for FA plans, root cause hypotheses, and debug report drafting.
---

# Semiconductor Failure Analysis

## Purpose

Turn scattered test symptoms and lab observations into a structured FA plan and debug report.

## Required Inputs

- Failure symptom, bin/test name, measured value, expected limit, and reproducibility.
- Failing population: lot, wafer, die location, site, package, temperature, voltage, and aging/reliability condition.
- Available evidence: ATE logs, wafer maps, curve traces, scan fail data, microscopy, X-ray, SEM/FIB, EMMI/OBIRCH, or bench measurements.

## Workflow

1. Summarize observed symptoms and affected population.
2. Classify failure type: functional, parametric, leakage, timing, memory, analog/RF, package, process, ESD/EOS, reliability, or test-induced.
3. Build hypotheses with supporting and contradicting evidence.
4. Recommend next measurements or destructive analysis only when non-destructive evidence is insufficient.
5. Separate containment actions from root-cause analysis.
6. Draft report sections suitable for engineering review.

## Output

Return:

- Symptom summary.
- Population and signature analysis.
- Hypothesis table.
- Recommended FA flow.
- Containment recommendations.
- Report draft or slide outline.

## Boundaries

Do not assert physical root cause without evidence. Clearly label confidence levels.
