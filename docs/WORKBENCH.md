# Desktop Workbench Contract

This document defines the next desktop GUI contract for VoltUI. It is the
upstream product and engineering target for the Svelte workbench rewrite; forks
can theme or brand it, but the interaction model should stay generic.

## Goals

- Keep the Go/Wails kernel, providers, tools, permissions, checkpoints, MCP,
  skills, memory, and session model as the source of truth.
- Replace the current chat-first React shell with a Svelte 5 workbench that
  treats chat as one surface inside a project operating console.
- Make **Work** and **Code** top-level activity modes explicit, without changing
  the existing run modes (`Ask`, `Auto`, `YOLO`, `Plan`, `Goal`).
- Use a headless Svelte admin/workbench layer, compatible with `svadmin`, for
  resource management surfaces such as providers, models, skills, MCP servers,
  permissions, tasks, memory, and audit-style logs.
- Preserve the current Wails distribution profile: lightweight desktop runtime,
  local-first execution, no Electron/Node server requirement, and relative asset
  builds that work under the `wails://` scheme.

## Non-goals

- Do not migrate the desktop runtime from Wails to Electron.
- Do not move the agent kernel from Go to a Node server.
- Do not make a fork-specific brand, market, or deployment decision in upstream
  UI code.
- Do not make the desktop GUI a pure CRUD admin application. Admin/resource
  primitives accelerate settings and operations surfaces; the main experience
  remains an agent workbench.

## Activity Modes

Activity modes describe the user task domain. They are orthogonal to run modes.

| Activity mode | Purpose | Primary surfaces |
| --- | --- | --- |
| `work` | General agent work, research, writing, planning, office-style tasks, and task coordination. | Work dashboard, chat, goals, tasks, memory, MCP resources, command palette. |
| `code` | Coding-agent work inside a repository or workspace. | Project tree, file references, changed files, diffs, checkpoints, shell/tool trace, context panel, approvals. |

Run modes keep their current meaning:

| Run mode | Meaning |
| --- | --- |
| `Ask` | Prompt before fallback writer approvals. |
| `Auto` | Auto-allow fallback approvals; explicit `ask` and `deny` rules still apply. |
| `YOLO` | Skip ordinary tool approval prompts; hard denies, user questions, and plan approvals still wait. |
| `Plan` | Keep the next work read-only until the plan is approved or Plan is turned off. |
| `Goal` | Continue pursuing a saved objective until complete, blocked, or cleared. |

The UI must not collapse activity mode and run mode into one control. A user
should be able to run `code + Plan`, `code + Ask`, `work + Goal`, or
`work + Auto` without ambiguity.

## Workbench Layout

The desktop workbench is organized around stable regions:

- **App chrome**: native-feeling title area, project/session tabs, command
  palette entry, and compact status.
- **Primary sidebar**: activity switcher, workspaces/projects, sessions/topics,
  tasks/goals, and settings entry.
- **Main stage**: current conversation, work dashboard, or focused artifact.
- **Composer**: message input, attachments, `@` references, slash commands,
  model/effort/run-mode controls, and activity-mode context.
- **Right dock**: context, files, changed files, plan, approvals, tool trace, and
  resource inspectors.
- **Resource surfaces**: settings and admin-style screens backed by typed
  resources rather than one-off forms.

The first screen should be a useful workbench, not a marketing or onboarding
page. Empty states can guide the user, but must also expose real actions.

## svadmin-Compatible Layer

VoltUI should use Svelte resource primitives for admin-like surfaces. The layer
must be compatible with `svadmin` concepts but must not leak admin assumptions
into agent-specific components.

Recommended resource names:

- `providers`
- `models`
- `mcpServers`
- `skills`
- `permissions`
- `workspaces`
- `sessions`
- `topics`
- `tasks`
- `memory`
- `checkpoints`
- `updates`

Recommended provider boundary:

```ts
interface WorkbenchDataProvider {
  list(resource: string, params: ListParams): Promise<ListResult>;
  getOne(resource: string, id: string): Promise<ResourceRecord>;
  create(resource: string, data: unknown): Promise<ResourceRecord>;
  update(resource: string, id: string, data: unknown): Promise<ResourceRecord>;
  delete(resource: string, id: string): Promise<void>;
}
```

For the Wails desktop, this provider should wrap the existing Go bindings in
`desktop/frontend/src/lib/bridge.ts` (or its Svelte replacement). It must keep
Wails as the only desktop IPC boundary.

## Required First-Phase Feature Parity

The first usable Svelte workbench must support:

- Wails boot and dev-browser mock paths.
- Tab/session listing, switching, closing, and new topic creation.
- Sending a user turn and receiving streamed events.
- Rendering assistant text, reasoning, usage, tool calls, approvals, and ask
  questions.
- Composer text input, slash commands, `@` file/workspace references,
  attachments, and cancel.
- Model and effort switching.
- Explicit Work/Code activity mode switching.
- Existing run modes: Ask/Auto/YOLO, Plan, and Goal entry points.
- Settings/resource screens for providers, models, MCP servers, skills, and
  permissions.
- Code-mode right dock: context, files, changed files, diffs, and checkpoints.
- Work-mode dashboard: tasks/goals, recent sessions, memory, and resource
  shortcuts.

Features can land in slices, but the rewrite is not complete until all items are
usable and verified.

## Migration Plan

1. **Contract and parity map**: maintain this document and a checked feature
   matrix while the rewrite is in progress. The matrix lives in
   [`WORKBENCH_FEATURE_MATRIX.md`](./WORKBENCH_FEATURE_MATRIX.md).
2. **Svelte shell in parallel**: create a Svelte 5 + Vite desktop frontend in a
   separate directory or branch until it can replace `desktop/frontend`.
3. **Bridge adapter**: expose Wails bindings through typed Svelte services and a
   svadmin-compatible data provider.
4. **Core loop**: implement tabs, event stream, transcript, composer,
   approvals/questions, and model controls.
5. **Activity modes**: add Work/Code mode switching with distinct dashboard and
   code-workspace surfaces.
6. **Resource surfaces**: migrate settings and operations panels to typed
   resources.
7. ~~**Replace React shell**: switch Wails build commands to the Svelte frontend~~ (done)
   only after parity gates pass.
8. ~~**Remove obsolete React code**: remove React dependencies and dead components~~ (done)
   in the final replacement PR.

## Verification Gates

Every implementation slice must choose the smallest real gate that covers the
changed surface. The final replacement must pass:

- Frontend typecheck (`svelte-check` or the project check command).
- Frontend production build.
- Wails desktop build for at least the primary development platform.
- Browser or Wails runtime smoke that proves the UI is not blank.
- Event-stream smoke: submit a turn and render streamed text/tool events.
- Approval smoke: display an approval request and answer it.
- Work/Code smoke: switch activity mode and preserve the selected run mode.
- Resource smoke: list and update at least one resource through the data
  provider.
- `git diff --check`.

If a broad test is blocked by unrelated repository state, record the exact
blocker and run a targeted gate that covers the changed files.
