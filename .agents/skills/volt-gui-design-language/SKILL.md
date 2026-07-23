---
name: volt-gui-design-language
description: Define, implement, and review the Volt GUI desktop design language and user experience. Use for any Volt GUI Svelte/Wails UI work involving visual styling, layout, navigation, Work/Code workbenches, composer interactions, settings, dialogs, lists, empty/loading/error states, responsive behavior, or design-system decisions.
---

# Volt GUI Design Language

Build a calm, dense, trustworthy desktop workbench for durable agent work. Preserve Volt GUI's own product identity while intentionally moving its interaction density and panel discipline closer to verified Codex Desktop behavior.

## Resolve design authority

Apply evidence in this order:

1. Follow the user's current request and the repository's product contracts.
2. Read the root `DESIGN.md`; treat its prose and semantic tokens as the visual authority.
3. If `E:\workspace\aoristlawer` or an equivalent mounted checkout is available, inspect its real desktop source before changing UI structure.
4. Inspect current Volt GUI source, tests, and screenshots; preserve working information architecture and behavior.
5. Prefer the local build-5591 reverse evidence named in [references/reference-evidence.md](references/reference-evidence.md) over public reconstructions. Use public reconstructions only as secondary UX dictionaries, never as runtime truth.

Read [references/reference-evidence.md](references/reference-evidence.md) when choosing or refreshing reference material.

## Run the workflow

1. Classify the target surface as shell/navigation, Work, Code, conversation/composer, settings/governance, modal, or status/state feedback.
2. Read the matching sections of [references/visual-language.md](references/visual-language.md) and [references/ux-patterns.md](references/ux-patterns.md).
3. State the user job, primary action, secondary actions, visible state, recovery path, and keyboard path before editing.
4. Reuse existing Svelte components and `@svadmin/ui` semantic tokens. Add a component only when it owns a coherent interaction boundary.
5. Keep Work and Code structurally distinct while sharing shell, navigation, composer, status, and feedback primitives.
6. Implement the smallest coherent slice. Do not add another global override layer at the end of `App.svelte`.
7. Verify the rendered result on desktop and mobile, then inspect the current diff.

For Svelte files, load `svelte-code-writer` and `svelte-core-bestpractices`. For visible acceptance, load `ui-aesthetic-review`.

## Keep the Volt identity while approaching Codex

- Use a matte operational canvas dominated by neutral surfaces and graphite controls. Reserve Volt green for constructive status and sparse focus emphasis.
- Prefer borders, spacing, and state contrast over decorative shadows.
- Keep desktop density compact: 42px primary toolbar, 40px pane toolbar, 36px Review rows, 32-36px controls, 12-14px body text, and 6-12px structural radii.
- Make actions look operational rather than promotional. Avoid hero-sized headings, decorative gradients, glow, glassmorphism, and floating card stacks.
- Use color for meaning. Accent means current/selected/actionable; green/red/amber mean status, not decoration.
- Keep icons quiet and consistent. Use Lucide icons already present in the project; do not mix icon families.
- Use motion to explain panel, tab, and state transitions. Keep it 120-200ms and respect reduced motion.
- Treat 624/625px as the Review container transition: above it actions may retain labels; at and below it controls compact or stack without hiding state.
- Render secondary text at roughly 65% foreground contrast, with path/hash/ticket metadata in the existing mono stack.

## Preserve the Volt experience

- Keep the current workspace, project, task/thread, model, permission mode, and running state visible at the point of action.
- Prefer progressive disclosure: simple defaults, explicit menus for advanced controls, and side/bottom panels for inspection.
- Treat the composer as the command cockpit. Attachments, references, model, permission, status, submit/cancel, and errors belong around it.
- Never block the whole workspace with an unexplained spinner. Show the pending dependency, a timeout/retry path, and a safe fallback where possible.
- Keep destructive or high-risk actions explicit, local, and reversible when the backend supports it.
- Patch mutation only blocks the conflicting Review path; source tabs, panes, dialogs, drafts, and unrelated local interaction stay responsive. Commit/Push/Create PR share a separate workflow gate.
- Terminal UI must expose attach-pending input, coalesce resize to the latest dimensions, and cap reconnect snapshot tails at 16,000 characters; do not invent PTY success in a renderer-only preview.
- CodeSurface write UI must match `fileHandle + documentGeneration + ticket`, preserve drafts on conflict, and leave workspace/mtime/disk authority in the Go desktop backend.
- Use inline approval and recovery cards for turn-level decisions; use modals for configuration or destructive confirmation.
- Preserve keyboard reachability, visible focus, stable dimensions, and no horizontal scrolling.
- Make empty states task-oriented: explain why the surface is empty and offer one next action.

## Manage legacy styling

- Treat `--aorist-*`, `--law-*`, and comments naming Accio as legacy compatibility evidence, not new design vocabulary.
- Do not introduce new uses of those names. Prefer `@svadmin/ui` tokens and the semantic values defined in `DESIGN.md`.
- Do not append broad selector lists to override unrelated components. Move styles toward the owning component or a small shared primitive.
- Do not copy OpenAI fonts, logos, copy, illustrations, or source code. Reuse interaction ideas and information architecture only.

## Verify UI work

Run the narrowest meaningful checks, then broaden when shared shell or components changed:

```bash
npx @sveltejs/mcp svelte-autofixer desktop/frontend/src/<changed>.svelte --svelte-version 5
cd desktop/frontend && npm run check
cd desktop/frontend && npm run build
git diff --check
```

For user-visible changes, capture at least one desktop and one mobile screenshot and confirm:

- no text overlap, clipping, or horizontal scroll;
- primary flow is clickable and keyboard reachable;
- loading, empty, error, disabled, active, and success states remain distinguishable;
- Work/Code mode and permission/run mode are not conflated;
- the result follows `DESIGN.md` without raw-value drift.

## Deliver design decisions

When proposing a new pattern, report:

- user job and surface;
- reference evidence used;
- adopted Volt rule;
- deliberate differences from references;
- affected components and states;
- verification plan.
