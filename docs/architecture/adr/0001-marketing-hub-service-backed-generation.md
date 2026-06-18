# ADR 0001: Add Marketing Module with Service-Backed Generation

## Status

Proposed

## Context

The planned marketing capability must be added as a new module inside the existing Volt GUI workbench and must generate PPT decks, business posters, and marketing videos. These workflows require large binary assets, long-running jobs, external AI/render providers, retries, audit trails, and human approval. The current Volt GUI project is a Go CLI/TUI plus Wails desktop workbench with a lean core and a plugin/config-driven architecture.

Replacing the existing Work or Code surfaces with a marketing-specific product would break the current workbench contract. Embedding heavy generation and rendering directly inside the desktop app would also couple the local UI to provider-specific runtimes, large media dependencies, and long-running operational concerns. Both outcomes conflict with the existing product and engineering direction.

## Decision

Add Marketing as an incremental module in the existing Volt GUI workbench, backed by service-side generation capabilities exposed through stable APIs and tool/plugin contracts.

Volt GUI should keep the existing Work and Code modes intact. The new module should reuse existing workbench regions: primary sidebar navigation, main stage, composer, right dock, typed resource surfaces, and tool/plugin registration. Service-side components should own campaign persistence, object storage, job orchestration, generation workers, provider adapters, policy checks, review state, and export package creation.

## Consequences

### Positive

- Keeps the existing Go/Wails core lean and aligned with current project boundaries.
- Adds marketing workflows without replacing current Work/Code behavior or user navigation.
- Allows long-running PPT, image, and video jobs to be retried, observed, and scaled independently.
- Avoids shipping large media/render dependencies with the desktop app.
- Makes provider routing, cost accounting, and audit trails centralized.
- Supports future web/admin surfaces without duplicating generation logic.

### Negative

- Requires backend infrastructure, queueing, object storage, and deployment operations.
- Offline-only generation is not a first-class MVP capability.
- Desktop UX must handle remote job latency and partial failures clearly.
- The navigation model needs product validation: Marketing can begin as a Work resource section before becoming a top-level activity mode.

## Rejected Alternatives

- Replacing existing Work/Code flows with a marketing-first shell: would violate the workbench contract and disrupt current users.
- Desktop-only generation: simpler for a prototype, but unsuitable for video generation, cost tracking, shared approvals, and team collaboration.
- One monolithic worker for all formats: faster to start, but PPT, poster, and video have different latency, dependency, and scaling profiles.
- Direct provider calls from the frontend: exposes credentials and makes audit, retry, and policy enforcement unreliable.

## Implementation Notes

- Add typed marketing resources such as `campaigns`, `brandKits`, `marketingTemplates`, `marketingAssets`, `generationJobs`, `reviews`, and `exports`.
- Use REST for campaign, asset, job, review, and export resources.
- Require idempotency keys on generation job creation.
- Store normalized artifact manifests so provider-specific outputs can be regenerated or migrated.
- Keep final export blocked until policy checks and human approval pass.



