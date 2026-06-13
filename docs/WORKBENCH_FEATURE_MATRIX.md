# Desktop Workbench Feature Matrix

This matrix tracks the Svelte workbench rewrite against the current desktop
React shell. It is intentionally product-facing: a feature is complete only when
the user-visible flow works and the verification evidence exists.

Status values:

- `planned`: contract exists, no implementation yet.
- `partial`: implementation exists but has missing flows or weak verification.
- `usable`: user-visible flow works, with targeted verification.
- `complete`: parity is reached, regression coverage exists, and obsolete React
  code can be removed.

| Area | Feature | Mode | Status | Evidence required |
| --- | --- | --- | --- | --- |
| Runtime | Wails boot path | work, code | partial | Svelte app and Wails-style bridge exist; Wails runtime smoke still required. |
| Runtime | Browser dev mock path | work, code | usable | `pnpm build` passes and Browser smoke confirms nonblank UI, Work/Code switch, approval, and ask flows. |
| Navigation | App chrome and tabs | work, code | usable | List, switch, close, create-global-session, and reorder are wired through Svelte bridge/mock; Browser smoke confirms new session, move up/down, and Work/Code mode separation. |
| Navigation | Sidebar workspaces/projects | work, code | usable | Svelte sidebar lists the Wails project tree, opens global/project topics, creates topics, renames projects/topics, sets project colors, reorders projects, and moves topics to trash; Browser smoke covers topic open/create/rename/color/reorder while preserving run-mode separation. |
| Activity | Work/Code switcher | work, code | usable | Svelte shell switches activity mode independently from run mode. |
| Run modes | Ask/Auto/YOLO controls | work, code | usable | Svelte shell keeps run mode orthogonal to Work/Code, maps Ask/Auto/YOLO to `SetModeForTab` plus permission fallback (`ask`/`allow`) where appropriate, shows backend/permission chips from `Settings()`, refreshes the svadmin-compatible permissions resource, and Browser smoke verifies Ask→Auto→YOLO→Ask across Work/Code without leaking activity-specific panels. |
| Run modes | Plan control | work, code | partial | Svelte shell maps Plan to `SetModeForTab("plan")` and renders plan/tool approval shelves; real plan handoff still needs Wails smoke. |
| Run modes | Goal entry points | work, code | usable | `internal/control` goal loop supports start/continue/complete/blocked/clear; desktop Wails bindings expose per-tab goal state/actions; Svelte Work dashboard can start, view, continue, and clear goals; Browser smoke confirms Goal run mode stays orthogonal to Work/Code. |
| Chat loop | Submit user turn | work, code | partial | Composer submits through `SubmitDisplayToTab`; browser mock smoke passes, real Wails stream smoke still required. |
| Chat loop | Stream text/reasoning/events | work, code | partial | `agent:event` reducer renders text, reasoning, usage, and tool events; `HistoryForTab` hydration now loads saved turns on boot/tab switch. |
| Chat loop | Cancel running turn | work, code | usable | Composer calls `CancelTab` while running, restores the submitted draft after the cancellation `turn_done`, clears pending transcript state, and Browser smoke covers button/Escape cancellation without crossing Work/Code activity boundaries. |
| Transcript | Assistant/user messages | work, code | usable | Browser smoke renders saved history plus live user and assistant turns in the Svelte transcript. |
| Transcript | Markdown, code, math | work, code | usable | Lightweight Svelte renderer covers headings, task lists, tables, links, inline code, fenced code, and KaTeX inline/block math; Browser smoke verifies `[data-katex="inline"] .katex` and `[data-katex="block"] .katex` with no console errors. |
| Transcript | Tool calls and subcalls | work, code | usable | Tool dispatch/result cards render from `agent:event`; sub-agent calls carrying `parentId` are grouped under the parent `task` card instead of duplicated at top level; Browser smoke verifies nested `read_file`/`grep` subcalls under the parent task with no console errors. |
| Transcript | Approvals and ask questions | work, code | partial | Browser smoke completes approve/deny and answer-question flows; real Wails approval smoke still required. |
| Composer | Slash commands | work, code | usable | Command list renders from `Commands`; `/command ...` argument suggestions render from `SlashArgs`, replace the active token via the returned `from` offset, and submit through `SubmitDisplayToTab`; Browser smoke covers `/mcp show` suggestion insertion, transcript submit, stream completion, and no console errors. |
| Composer | `@` file/workspace references | code | usable | File search/list, directory descent, insertion, and preview are wired through `ListDir`/`SearchFileRefs`/`ReadFile`; Browser smoke descends `@desktop/frontend-svelte/src/`, inserts `@desktop/frontend-svelte/src/App.svelte`, switches to Code, and renders the preview with no console errors. |
| Composer | Attachments and dropped files | work, code | partial | Svelte composer can paste/drop browser files, subscribe to native Wails file drops, render attachment chips/previews, and submit `@.voltui/attachments/...` refs; real Wails drop smoke and full old-composer parity still required. |
| Composer | Model and effort switching | work, code | partial | Model and effort selectors list and set per tab through bridge/mock; real Wails smoke still required. |
| Work dashboard | Tasks/goals overview | work | usable | Goal controls are wired through the controller/Wails bridge; the svadmin-compatible `tasks` resource provides task queue data and status updates; Work dashboard renders task counts/actions and Browser smoke covers task start/complete without leaking into Code mode. |
| Work dashboard | Recent sessions | work | usable | Svelte bridge/resource provider lists saved sessions through `ListSessions`, Work dashboard renders recent sessions, and `ResumeSessionForTab` rehydrates transcript history while preserving Work/Code activity boundaries; Browser smoke covers global resume and project resume. |
| Work dashboard | Memory shortcuts | work | usable | Svelte Work dashboard hydrates the Wails `Memory()` view, shows saved facts/docs and store location, quick-adds notes through `Remember(scope,note)`, forgets facts through `Forget(name)`, refreshes svadmin-compatible resource counts, and Browser smoke covers view/add/forget with no console errors. |
| Code dock | Context panel | code | usable | Svelte Code dock renders `ContextPanel` token usage, prompt/completion/reasoning/other/cache breakdown, read-file and changed-file detail tabs with filtering, preview actions, and a refresh control that rehydrates context/checkpoint/change data; Browser smoke covers read/changed filtering, refresh, preview, and Work/Code separation. |
| Code dock | File tree and preview | code | usable | Svelte Code dock loads the workspace file tree through `ListDir`, supports directory expand/collapse, previews files through `ReadFile`, and exposes open/reveal actions through existing Wails `OpenWorkspacePath`/`RevealWorkspacePath`; Browser smoke covers tree descent, preview, open/reveal notices, and Work/Code separation. |
| Code dock | Changed files and diffs | code | partial | `WorkspaceChanges` renders changed files and Svelte calls the new `WorkspaceDiff` Wails binding to render unified diff hunks with +/− counts; real Wails runtime smoke and richer staged/rename edge cases still required. |
| Code dock | Checkpoints and rewind | code | usable | `CheckpointsForTab` renders rewind points with scope-aware actions; after `Rewind` resolves the Svelte shell rehydrates tab history, context, changed files, and checkpoint state, clears stale code previews, and Browser smoke verifies the transcript and dock refresh. |
| Resources | Providers and models | work, code | usable | svadmin-compatible resource console lists providers/models through `Settings`, can save providers with key env updates, delete providers, and set default/planner models through Wails bindings; Browser smoke covers provider template/save/key and model default/planner flows. |
| Resources | MCP servers | work, code | usable | Resource console lists MCP servers through `Capabilities`, can add/update/remove/retry/toggle servers through existing Wails bindings; Browser smoke covers MCP template/add and enable flows. |
| Resources | Skills | work, code | usable | Resource console lists skills through `Capabilities`, can refresh and enable/disable skills through existing Wails bindings; Browser smoke covers skill toggle flow. |
| Resources | Permissions and sandbox | code | usable | Resource console lists permission mode/rules/sandbox through `Settings`, can set permission mode, add/remove rules, and update sandbox through existing Wails bindings; Browser smoke covers permission mode and rule flows. |
| Resources | Appearance, language, desktop prefs | work, code | usable | `desktopPrefs` svadmin-compatible resource reads `Settings()` and persists language, theme, theme style, and close behavior through `SetDesktopLanguage`, `SetDesktopAppearance`, and `SetCloseBehavior`; Browser smoke updates all four values and verifies row refresh with no console errors. |
| Updates | Update banner/check/apply | work, code | usable | Svelte `UpdateBanner` auto-checks through `CheckUpdate`, renders available/error/progress/done states, calls `ApplyUpdate` for self-update platforms and `OpenDownloadPage` for manual-download platforms, and subscribes to `updater:progress`; Browser smoke verifies available → verifying → done with no console errors. |
| Accessibility | Keyboard navigation | work, code | usable | Workbench exposes primary shortcuts for Work (`Ctrl/Meta+1`), Code (`Ctrl/Meta+2`), composer focus (`Ctrl/Meta+K`), and Escape cancel/deny/dismiss; Browser smoke verifies shortcuts, focus movement, Escape cancel, and focusable control order with no console errors. |
| Accessibility | Text overflow/responsive layout | work, code | usable | Fixed-width desktop minimums are removed; Work, Code, resource, update, transcript, and composer surfaces wrap or stack below 960px/640px; Browser smoke and screenshots cover 1280px and 390px viewports with no horizontal overflow or console errors. |
| Packaging | Production build | work, code | usable | `VOLTUI_DESKTOP_FRONTEND=svelte pnpm --dir desktop/frontend build` builds the Svelte workbench, syncs it into the Wails embed path `desktop/frontend/dist`, and the desktop Go package compiles against that embedded output; React remains the default build until first-phase parity is complete. |

The React desktop shell can only be removed after every row is at least `usable`
and all first-phase rows in [`WORKBENCH.md`](./WORKBENCH.md#required-first-phase-feature-parity)
are `complete`.
