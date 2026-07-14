---
name: volt-desktop-experience
description: "Use when designing, implementing, or reviewing Volt GUI operational task-lifecycle UX: running message queues and Steer, activity centers, result receipts, structured recovery, explainable approvals, Diff comments to fixes, automation result inboxes, or managed worktree snapshot/Handoff flows. Enforces real Wails-backed state, safe mutation preflights, Work/Code ownership, and behavioral plus visual verification; pair with the project volt-gui-design-language skill for broad visual or layout work."
---

# Volt Desktop Experience

Build a calm, compact, trustworthy desktop workbench. Reuse proven interaction structures, but express them through Volt's own object model, visual language, and local-first runtime.

## Start from durable truth

1. Read the repository `DESIGN.md` completely.
2. Read the Volt overlay in `AGENTS.md` and the relevant Svelte/Wails project rules.
3. Inspect the current component, backend binding, real state type, and tests before changing UI.
4. Inspect the designated reference project's real source when it is reachable. Extract structure and interaction logic; never infer unavailable source or copy brand assets, product copy, or implementation wholesale.

## Choose the product surface

- Keep **Work** for outcomes, projects, agents, resources, schedules, and business operations.
- Keep **Code** for repository context, files, Diff, checkpoints, verification, and isolated workspaces.
- Keep governance concerns such as permissions, trust, models, memory, and capabilities visible but separate from task posture.
- Share the shell, task context, status language, and lifecycle primitives across surfaces.

## Design state before layout

Define these states before styling:

- empty and first-run;
- ready and draft;
- running and background-running;
- queued and steered;
- waiting for approval or user input;
- failed, cancelled, paused, and recoverable;
- completed with evidence and pending review;
- narrow desktop and reduced-width layouts.

Do not hide runtime state behind toasts. Put status, consequences, and recovery at the point of action.

## Apply Volt interaction patterns

Read [task-lifecycle-patterns.md](references/task-lifecycle-patterns.md) when the task touches execution, review, automation, or workspace isolation.

Core rules:

- Treat a Thread/Task as the durable unit that owns queue, transcript, receipt, approvals, comments, checkpoints, and recovery.
- Let users enqueue, edit, remove, reorder, steer, stop, and resume without losing drafts.
- Summarize work with real plan, changes, verification, artifacts, data path, and rollback evidence.
- Explain approvals with action, target, reason, risk, detected authorization, and grant scope.
- Turn Diff comments into bounded repair prompts; keep comments open until evidence shows they were handled.
- Persist automation runs as an inbox, not only as the latest status on an automation definition.
- Restrict worktree restore and Handoff to clean, compatible targets; preflight before mutating.

## Implement within existing boundaries

- Keep Wails/Go as the source of truth for filesystem, Git, automation, and runtime state.
- Keep pure TypeScript state transitions in `desktop/frontend/src/lib/` with Vitest coverage.
- Keep Svelte components owned and focused; avoid adding more broad normalization CSS to `App.svelte`.
- Use semantic tokens and the prose intent in `DESIGN.md`; do not introduce a new design system or framework.
- Prefer compact rows for large collections and cards only for summaries, decisions, or small bounded groups.
- Pair every color state with text or an icon.
- Preserve keyboard focus, disabled reasons, cancellation, and responsive stacking.

## Verification

Run the narrowest real checks first, then broaden:

1. Add or update behavior-first unit tests for state transitions.
2. Run `svelte-autofixer` on every changed `.svelte` file and resolve actual issues.
3. Run frontend unit tests and the production build.
4. Run targeted Go tests for Wails-backed behavior, then the applicable desktop test suite.
5. Run `npx @google/design.md lint DESIGN.md` when design tokens or rationale change.
6. Inspect desktop and narrow screenshots for hierarchy, density, overflow, focus, empty states, and recovery actions.
7. Run `git diff --check` and review the current diff before declaring completion.

Report pre-existing verification failures separately from regressions introduced by the task.
