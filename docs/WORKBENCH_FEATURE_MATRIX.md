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
| Navigation | App chrome and tabs | work, code | partial | List, switch, and close are wired through the Svelte bridge/mock; reorder and create still required. |
| Navigation | Sidebar workspaces/projects | work, code | partial | Session tabs render and preserve active selection; project tree/topic management still required. |
| Activity | Work/Code switcher | work, code | usable | Svelte shell switches activity mode independently from run mode. |
| Run modes | Ask/Auto/YOLO controls | work, code | partial | Svelte shell preserves run-mode state and maps YOLO to `SetModeForTab`; permission-mode wiring still needs real runtime smoke. |
| Run modes | Plan control | work, code | partial | Svelte shell maps Plan to `SetModeForTab("plan")` and renders plan/tool approval shelves; real plan handoff still needs Wails smoke. |
| Run modes | Goal entry points | work, code | planned | Start, view, continue, clear goal. |
| Chat loop | Submit user turn | work, code | partial | Composer submits through `SubmitDisplayToTab`; browser mock smoke passes, real Wails stream smoke still required. |
| Chat loop | Stream text/reasoning/events | work, code | partial | `agent:event` reducer renders text, reasoning, usage, and tool events; history hydration still required. |
| Chat loop | Cancel running turn | work, code | partial | Composer calls `CancelTab` while running; draft restore still required. |
| Transcript | Assistant/user messages | work, code | usable | Browser smoke renders user and assistant turns in the Svelte transcript. |
| Transcript | Markdown, code, math | work, code | planned | Markdown, fenced code, GFM, KaTeX smoke. |
| Transcript | Tool calls and subcalls | work, code | partial | Tool dispatch/result cards render; nested sub-agent call grouping still required. |
| Transcript | Approvals and ask questions | work, code | partial | Browser smoke completes approve/deny and answer-question flows; real Wails approval smoke still required. |
| Composer | Slash commands | work, code | partial | Command list and filtering render from `Commands`; slash-arg application and submit semantics still required. |
| Composer | `@` file/workspace references | code | partial | File search/list, insertion, and preview are wired through `SearchFileRefs`/`ReadFile`; directory descent and attachments still required. |
| Composer | Attachments and dropped files | work, code | planned | Paste/drop image/file and submit attachment text. |
| Composer | Model and effort switching | work, code | partial | Model and effort selectors list and set per tab through bridge/mock; real Wails smoke still required. |
| Work dashboard | Tasks/goals overview | work | partial | Work dashboard shell exposes active topic and resource-backed shortcuts; task/goal data provider still required. |
| Work dashboard | Recent sessions | work | partial | Session context is visible; full history/resume flow still required. |
| Work dashboard | Memory shortcuts | work | partial | Memory resource counts render through the data provider; view/add/forget flows still required. |
| Code dock | Context panel | code | partial | Token usage and read files render from `ContextPanel`; checkpoint and full context controls still required. |
| Code dock | File tree and preview | code | partial | `@` search can preview files through `ReadFile`; full tree/reveal/open flows still required. |
| Code dock | Changed files and diffs | code | partial | `WorkspaceChanges` renders changed files; diff viewer still required. |
| Code dock | Checkpoints and rewind | code | planned | List checkpoints and rewind by scope. |
| Resources | Providers and models | work, code | partial | svadmin-compatible provider/resource panel can list provider/model counts through Wails/mock bridge; update/key flows remain. |
| Resources | MCP servers | work, code | partial | MCP server resource count is exposed in the resource panel; add/update/enable/reconnect/remove still required. |
| Resources | Skills | work, code | partial | Skill resource count is exposed in the resource panel; enable/disable/refresh still required. |
| Resources | Permissions and sandbox | code | partial | Permission resource count is exposed in the resource panel; rule/sandbox editors still required. |
| Resources | Appearance, language, desktop prefs | work, code | planned | Persist settings through Go bindings. |
| Updates | Update banner/check/apply | work, code | planned | Check, manual download path, apply when supported. |
| Accessibility | Keyboard navigation | work, code | planned | Tab order and primary shortcuts work. |
| Accessibility | Text overflow/responsive layout | work, code | planned | Desktop and narrow viewport screenshots. |
| Packaging | Production build | work, code | partial | `desktop/frontend-svelte pnpm build` passes after component split; Wails build integration remains. |

The React desktop shell can only be removed after every row is at least `usable`
and all first-phase rows in [`WORKBENCH.md`](./WORKBENCH.md#required-first-phase-feature-parity)
are `complete`.
