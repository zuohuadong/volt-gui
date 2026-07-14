# Volt Task Lifecycle Patterns

Use this reference when a UI change affects how a task starts, runs, pauses, asks for trust, produces evidence, fails, or moves between workspaces.

## Pattern matrix

| Capability | User promise | Required state | Volt treatment |
| --- | --- | --- | --- |
| Running message queue | Keep thinking while the agent works | queued, sending, paused, failed | Editable per-Thread queue with ordering, Steer, resume, and reload-safe persistence |
| Task activity center | Understand concurrent work at a glance | current run, background runs, queue, approvals, changes, checkpoints | Compact status strip plus switch/stop controls; never a decorative dashboard |
| Result receipt | Know what actually happened | goal, runtime, changes, verification, artifacts, data path, rollback | Populate only from backend/tool evidence; leave unknown sections pending |
| Structured recovery | Recover without guessing | last error, last draft, latest checkpoint, current Diff | Offer retry, restore draft, rewind, and inspect Diff with explicit preconditions |
| Explainable approval | Make a scoped trust decision | action, target, reason, risk, authorization, duration/scope | Show the decision facts before one-shot, session, persistent, or deny actions |
| Diff review to fix | Convert review into bounded execution | file, Diff line, comment, open/resolved state | Persist comments per Thread and generate a narrow repair request from open comments |
| Automation inbox | Notice unattended outcomes | run identity, result, trigger, logs, read/attention state | Store immutable run records separately from automation definitions; filter and mark read |
| Managed worktree | Isolate risky or parallel work | repo root, worktree path, HEAD, dirty state | Create detached managed worktrees under app state and expose real Git status |
| Snapshot and Handoff | Transfer work without overwriting | base HEAD, tracked patch, untracked files, clean target | Preflight same repository, matching HEAD, clean target, patch check, then apply and record artifact |

## Interaction hierarchy

1. Put the immediate task action closest to the task.
2. Put status and consequences beside that action.
3. Put advanced controls behind a compact disclosure, not a separate settings maze.
4. Put historical evidence in receipts, inboxes, or inspectors rather than transient toast messages.
5. Keep destructive or persistent trust actions visually distinct and confirmation-backed.

## Reference extraction rules

When studying Codex Desktop, aoristlawer, or another product:

- Extract navigation rhythm, panel ownership, progressive disclosure, queue semantics, review loops, and recovery behavior.
- Translate those patterns into Volt's Workspace → Project → Thread/Task → Agent Profile model.
- Preserve Volt's Work/Code split and Wails/Svelte boundaries.
- Do not copy names, logos, proprietary copy, illustrations, source layout, or hidden implementation details.
- Prefer a smaller native pattern over a broad clone when the reference conflicts with Volt's object model.

## Acceptance questions

- Can the user tell what is running, where, and why?
- Can the user add work without interrupting or losing the current task?
- Does every waiting state explain what is needed next?
- Does every failure expose at least one safe recovery path?
- Are approvals understandable without reading raw tool JSON?
- Can review comments drive a bounded fix and remain auditable?
- Are automation results durable after restart?
- Can workspace transfer refuse unsafe targets before changing files?
- Does the narrow layout preserve the same decisions and recovery paths?
