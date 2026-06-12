# XGIC Private Skills Deep Optimization Notes

This document records optimization opportunities for the private XGIC / inspection-industry skill pack installed in `.voltui/skills/`.

## Current Baseline

- All 29 custom skills from `xgic-ai-chat/skills/custom` are installed as project skills.
- VoltUI discovers project skills from `.voltui/skills/<skill>/SKILL.md`, so these skills are available without user-level configuration.
- `references/private-skills/skills-manifest.json` is the full machine-readable inventory.
- `references/private-skills/INDEX.md` is the human routing index.
- `scripts/check-skills-sync.mjs` verifies both shared and private skill manifests.

## High-Value Improvements

1. Add risk metadata to every private skill.
   - Suggested fields: `risk: low|medium|high`, `data-scope`, `writes`, `requires-approval`.
   - High-risk examples: `security-review`, `devops-observability`, `mcp-tool-builder`, `sql-database-development`, and semiconductor debug work that may influence production disposition.

2. Split semiconductor skills into progressive references.
   - Keep `SKILL.md` concise.
   - Add optional `references/` files for ATE platforms, binning policy, wafer-map patterns, STS-8205/V93K/J750/ETS88 data conventions, FA evidence taxonomy, SPC rules, and report templates.
   - Load those references only when the user task matches the artifact type.

3. Add evidence templates for industry deliverables.
   - ATE test plan review checklist.
   - Yield excursion triage report.
   - Failure-analysis hypothesis matrix.
   - OCR/LIMS data-organization validation report.
   - Production release readiness checklist.

4. Use `runAs: subagent` selectively after runtime validation.
   - Good candidates: `code-review`, `security-review`, `semiconductor-test-program-review`, `semiconductor-yield-spc`, `semiconductor-failure-analysis`.
   - Keep implementation and small editing skills inline to avoid unnecessary context hops.

5. Add `allowed-tools` for subagent skills.
   - Read-only review skills should only receive file/search/read tools by default.
   - DevOps skills should not get write/deploy tools unless a task contract explicitly allows it.
   - Semiconductor data analysis can allow file reads and local scripts, but should not access live production data without explicit task scope.

6. Build an evaluation set.
   - Store anonymized sample prompts and expected output rubrics under a future `references/private-skills/evals/`.
   - Cover at least: ATE limit review, wafer-map excursion triage, FA report drafting, SQL migration review, PRD refinement, and RAG citation QA.
   - Score for correctness, evidence use, escalation behavior, and whether the skill avoids overclaiming.

7. Add edition-level grouping.
   - Industry default: semiconductor ATE / FA / yield-SPC / test-program-review, SQL, Python, C/C++, data reporting, QA.
   - Engineering default: Go, TypeScript, Svelte, Vue, Bun, Node.js, Java, Rust, CI/CD, DevOps, security.
   - Office default: product requirements, office workflow, RAG knowledge, prompt evaluation, data reporting.

8. Tighten trigger descriptions.
   - Descriptions should include concrete artifact names users actually provide: STS-8205, V93K, J750, ETS88, wafer sort, final test, datalog, bin map, wafer map, Cpk/Ppk, LIMS, OCR, FA report.
   - Keep descriptions short enough for the pinned skill index.

9. Add package provenance.
   - Keep source repo/path and sync date in the manifest.
   - Do not store credentials, live tokens, customer raw data, or non-redacted production env values in any skill.
