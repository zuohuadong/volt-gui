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
| Runtime | Browser dev mock path | work, code | usable | `pnpm build` verifies the mock-backed Svelte shell compiles; dev smoke still required. |
| Navigation | App chrome and tabs | work, code | planned | List, switch, close, reorder, and create tabs. |
| Navigation | Sidebar workspaces/projects | work, code | planned | List workspaces/projects, open topics, preserve active selection. |
| Activity | Work/Code switcher | work, code | usable | Svelte shell switches activity mode independently from run mode. |
| Run modes | Ask/Auto/YOLO controls | work, code | partial | Svelte shell preserves run-mode state; Go approval behavior still needs wiring. |
| Run modes | Plan control | work, code | planned | Read-only plan turn and approval handoff. |
| Run modes | Goal entry points | work, code | planned | Start, view, continue, clear goal. |
| Chat loop | Submit user turn | work, code | planned | Submit text and route to active tab. |
| Chat loop | Stream text/reasoning/events | work, code | planned | Render incremental `agent:event` updates. |
| Chat loop | Cancel running turn | work, code | planned | Cancel active tab and restore draft when applicable. |
| Transcript | Assistant/user messages | work, code | planned | Render history and live messages. |
| Transcript | Markdown, code, math | work, code | planned | Markdown, fenced code, GFM, KaTeX smoke. |
| Transcript | Tool calls and subcalls | work, code | planned | Dispatch/result/progress cards render, including nested task calls. |
| Transcript | Approvals and ask questions | work, code | planned | Approve/deny and answer-question flows. |
| Composer | Slash commands | work, code | planned | Command list, filtering, submit. |
| Composer | `@` file/workspace references | code | planned | File search/list and reference insertion. |
| Composer | Attachments and dropped files | work, code | planned | Paste/drop image/file and submit attachment text. |
| Composer | Model and effort switching | work, code | planned | List models/efforts and set per tab. |
| Work dashboard | Tasks/goals overview | work | planned | List active tasks/goals and open related session. |
| Work dashboard | Recent sessions | work | planned | List global/project sessions and resume. |
| Work dashboard | Memory shortcuts | work | planned | View/add/forget memory entries. |
| Code dock | Context panel | code | planned | Token usage, read files, changed files render. |
| Code dock | File tree and preview | code | planned | List/search/read/reveal workspace files. |
| Code dock | Changed files and diffs | code | planned | Workspace changes and diff viewer render. |
| Code dock | Checkpoints and rewind | code | planned | List checkpoints and rewind by scope. |
| Resources | Providers and models | work, code | partial | svadmin-compatible provider can list models through Wails/mock bridge; update/key flows remain. |
| Resources | MCP servers | work, code | planned | List, add, update, enable, reconnect, remove. |
| Resources | Skills | work, code | planned | List roots/skills, enable/disable, refresh. |
| Resources | Permissions and sandbox | code | planned | View/update permission rules and sandbox settings. |
| Resources | Appearance, language, desktop prefs | work, code | planned | Persist settings through Go bindings. |
| Updates | Update banner/check/apply | work, code | planned | Check, manual download path, apply when supported. |
| Accessibility | Keyboard navigation | work, code | planned | Tab order and primary shortcuts work. |
| Accessibility | Text overflow/responsive layout | work, code | planned | Desktop and narrow viewport screenshots. |
| Packaging | Production build | work, code | partial | `desktop/frontend-svelte pnpm build` passes; Wails build integration remains. |

The React desktop shell can only be removed after every row is at least `usable`
and all first-phase rows in [`WORKBENCH.md`](./WORKBENCH.md#required-first-phase-feature-parity)
are `complete`.
