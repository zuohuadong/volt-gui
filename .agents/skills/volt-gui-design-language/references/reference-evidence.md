# Reference evidence and reliability

## Current authority

The repository's own `DESIGN.md`, product docs, Svelte source, and verified screenshots are the immediate implementation authority.

The project overlay names `E:\workspace\aoristlawer` as the first structural UI reference. On the current macOS workspace, no `aoristlawer` checkout was found under `/Volumes/Data/workspace`, mounted volumes, Spotlight, or the connected GitHub account. Recheck before future visual-parity claims. When it becomes available, inspect:

- `apps/desktop/src/index.css`
- `layouts/DashboardLayout.tsx`
- `pages/*.tsx`
- `components/ui/*.tsx`
- related business components and running page structure

## Volt GUI evidence

Read these files before broad UI work:

- `DESIGN.md`
- `docs/PRODUCT_REQUIREMENTS.md`
- `docs/WORKBENCH.md`
- `docs/WORKBENCH_FEATURE_MATRIX.md`
- `desktop/frontend/src/App.svelte`
- `desktop/frontend/src/app.css`
- `desktop/frontend/src/components/UnifiedSidebar.svelte`
- `desktop/frontend/src/components/Composer.svelte`
- `desktop/frontend/src/components/CodeDashboard.svelte`

Use the latest passing screenshots under `output/playwright/` when they exist. Screenshots are evidence of a historical build, so verify the current source before claiming they are current.

## Codex Desktop reconstruction sources

### `stvlynn/codex-app`

- Snapshot inspected: commit `3366151a08c23b30fb63a66cdb3b0ea6faf7b7e3`.
- Strength: source-like TypeScript organization, project structure, settings/navigation examples, and a more runnable engineering workspace.
- Limitation: many modules remain typed boundary facades with `any` exports or opaque implementations. It is not the original OpenAI source tree.
- Use it for engineering boundaries, naming hypotheses, and reusable interaction structure.

Repository: <https://github.com/stvlynn/codex-app>

### `JimLiu/decode-codex`

- Snapshot inspected: commit `6fd43d66ccad32c9c1ab83b9704e0bbbbf2d4c7b`.
- Strength: broad component taxonomy covering app shell, panels, composer, command menu, settings, onboarding, browser, diff, approvals, and state feedback.
- Limitation: AI-assisted semantic reconstruction. Some files contain empty functions, simplified placeholders, follow-up notes, or inferred behavior.
- Use it as a UX pattern dictionary and import-graph map, then verify important behavior against the extracted bundle or current app.

Repository: <https://github.com/JimLiu/decode-codex>

### Extracted bundle evidence

The official desktop package is Electron and ships `app.asar`. Public mirrors expose compiled/minified `.vite/build` and `webview/assets` output, usually without source maps. This is closer to runtime truth than semantically restored TSX, but less readable.

Example: <https://github.com/am-will/codex-app/tree/main/desktop/recovered/app-asar-extracted>

## Legal and product boundary

- Do not copy or redistribute extracted/restored source.
- Do not copy OpenAI logos, product copy, proprietary fonts, illustrations, or branded motion.
- Do not present inferred reconstruction behavior as official fact.
- Extract interaction principles, layout relationships, state models, and usability lessons; implement them independently in Svelte/Wails.
