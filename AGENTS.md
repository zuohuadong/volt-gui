# Agent Configuration Template

> Auto-deployed by [agent-team-config](https://github.com/zuohuadong/agent-team-config) and mirrored to compatible agent entry files.
> This file is overwritten by `agent-team deploy`. Put project-specific additions in `.agents/AGENTS.local.md`; deploy merges them into the overlay block below.

## Language

- Reply to the user in Simplified Chinese.
- Use Chinese for important code comments or code explanations added during a fix when it fits the surrounding codebase.
- Keep user-facing status concise. Avoid dumping large raw logs or files into chat.

## Operating Loop

- Start with repo truth: inspect `git status` and targeted files. If `.agents/state/coordination.json` exists, use `agent-team context . --task <id>` / coordination DB status for the active task, recent events, and pending mailbox queue; only fall back to `tasks.md`, `progress.md`, and `.mailbox/` in legacy projects that have not been upgraded.
- Read only the slices needed for the task. Prefer `rg`, `sed`, focused file ranges, and `agent-team memory recall "<query>" --token-budget <n>` over full-file dumps.
- Keep the live context under budget: if `agent-team automation doctor .` reports coordination context warnings, run the suggested archive/prune command before broad exploration.
- Make small, scoped edits that follow the existing framework, naming, tests, and directory layout.
- Verify with the narrowest meaningful test first, then broaden when the change touches shared CLI behavior, templates, automation, data, security, deployment, or user-facing workflows.
- Explain material design, deletion, migration, or rollback decisions with a concise rationale. Do not expose raw chain-of-thought.

## Required Context

- In coordination DB v2 projects, `.agents/state/coordination.db` is the execution and coordination source. Use bounded DB queries through `agent-team context`, `agent-team automation status`, and task-specific evidence references; do not read historical logs wholesale.
- In legacy projects only, `progress.md`, `.mailbox/`, and `tasks.md` remain the fallback coordination files. Read only the active task row/contract, newest relevant progress entries, and pending/conflicting mailbox frontmatter; archive old history before broad work.
- `.agents/state/` contains machine-readable state, run records, and archives.
- `.agents/workflows/` and `.agents/prompts/` hold detailed procedures. Load only the workflow or role prompt needed by the current assignment.

## Delegation Gate

- For implementation, fix, test, deploy, refactor, PR/MR, or automation work, make a Delegation Decision before editing.
- Use the full `explorer -> executor -> verifier -> orchestrator` flow for medium/high risk work, multi-file or multi-subsystem changes, architecture/API/data/state/migration/security/permission/billing/production changes, unclear root cause, unfamiliar code, UI/E2E behavior, external fact checking, or review of the orchestrator's own completion claim.
- Low-risk, single-file work with clear acceptance criteria may be implemented by the main process directly after recording the safe skip reason and running local verification. Add an independent verifier when the result is broad, user-visible, unfamiliar, or explicitly requested.
- Pure explanation, read-only review, simple shell queries, formatting-only edits, and documentation-only tasks may skip subagents; record `safe_skip_reason`.
- Subagent requests must state role, exact scope, read/write ownership, allowed files/directories, context isolation, handoff artifacts, `verification_command` / verification commands, output schema, and mailbox persistence.
- If a subagent is interrupted, times out, or returns incomplete output, record `interruption_recovery` before continuing.

## Task Contract

Before execution, the Task Contract should state:

- goal and non-goals
- acceptance criteria
- expected files/modules
- required skills and code conventions
- verification plan
- risk and rollback
- provider/source links when applicable
- parent/source/reason for follow-up tasks

Use a minimal contract for low-risk local work. Require full Stack/Fullstack/Database/Deployment profiles only when the task creates, changes, or materially depends on those choices.

## Skills

- Load project prompts, workflows, `references/skills/`, project `AGENTS.md`, or installed `~/.codex/skills/agent-team/` skills only when the task needs them.
- Use `stack-profile-selector` for stack boundary decisions, `deployment-target-selector` for hosting, and `database-profile-selector` for persistence.
- Then load concrete skills such as `elysiajs`, `nestjs-backend`, `hono-backend`, `svelte-code-writer`, `svelte-core-bestpractices`, `vue-frontend`, `alpine-frontend`, `sveltekit-fullstack`, `nuxt-fullstack`, `sqlite-database`, `cloudflare-d1-database`, `postgres-database`, `electron-desktop`, `tauri-desktop`, `mobile-app`, `mpx-development-guides`, `supacloud-platform`, `svadmin-admin-ui`, `edgeone-deploy`, or `cloudflare-edge-hosting` as evidence requires.

## Automation Rules

- Executors handle one eligible `ready` task at a time, then reread the current execution source and mailbox queue (coordination DB in v2 projects, legacy files otherwise).
- Reviewers handle `review` tasks only.
- Health checks watch stuck tasks, auth/CI visibility, and queue drift.
- Failed review should return to the original PR/MR when possible. Create a follow-up only when the source cannot continue or the issue was already merged; include `parent`, `source`, and `reason`.
- Do not silently shrink scope. If the work exceeds the request, stop and state the tradeoff.

## Safety

- Never hardcode secrets in code, logs, templates, or durable memory.
- Never run destructive git or filesystem commands unless the user clearly asked for them.
- Do not use `git push -f`.
- Do not auto-commit, push, publish, deploy, or write to production unless the user explicitly requested that action.
- Generated code, comments, and commit messages must not mention AI authorship.
- Commit messages, when requested, must follow Conventional Commits.

<!-- AGENT:OVERLAY:START -->
# Volt GUI Project Overlay

## UI Reference Policy

- Volt GUI 的所有 UI 设计、视觉调整、布局重构、交互补齐、组件状态和信息架构调整，必须先参考 `E:\workspace\aoristlawer` 项目的真实源码与运行结构。
- 首选参考路径包括 `E:\workspace\aoristlawer\apps\desktop\src\index.css`、`layouts\DashboardLayout.tsx`、`pages\*.tsx`、`components\ui\*.tsx` 和相关业务组件。
- 不要只做颜色或表层风格模仿。应优先对齐 aoristlawer 的页面结构、侧栏/顶栏节奏、卡片密度、按钮层级、标签页样式、弹窗结构、列表行信息组织和空状态方式。
- 只有当 Volt GUI 的既有技术栈、Svelte/Wails 约束或当前业务目标明确不适配时，才允许偏离；偏离时需要在回复中说明原因。
- 除非用户明确指定其他参考对象，后续不要再优先使用 Accio、通用模板、截图臆测或新的外部设计系统作为 Volt GUI UI 的第一参考。

本仓库是 Go CLI/TUI + Wails desktop + Astro docs 的混合项目。执行任务时优先保持现有技术栈和目录边界，不引入新的前端或桌面框架。

## Stack Profile

- Root module: Go CLI/TUI, `go.mod`, entrypoints in `cmd/`, reusable code in `internal/`.
- Desktop module: Wails v2 nested module in `desktop/`, with independent `desktop/go.mod` and `desktop/frontend/`.
- Site: Astro documentation site in `site/`, using npm and Node 22 in CI.
- Release: GitHub Actions currently targets `main-v2`; CNB 镜像仓库同步时不要改动该分支策略，除非任务明确要求。

## Required Skills

- 默认先读 `references/skills/INDEX.md`。
- Go/CLI/TUI 任务按仓库现有 Go 代码规范执行：`gofmt`、`go vet`、`go test` 是基础门禁。
- Desktop/Wails 任务需要同时关注 `desktop/go.mod`、嵌入的 `desktop/frontend/dist`、平台差异和 CGO/WebKit 依赖。
- Site/Astro 任务需要加载 `typescript`；如涉及部署，再加载 `deployment-target-selector`。
- 涉及 agent-team 自动化、Task Ledger、mailbox、provider adapter 时加载 `agent-team-automation` 和 `provider-adapter`。

## Verification Profile

按改动范围选择最小但真实的验证命令：

- Root Go: `gofmt -w <changed-go-files>`，`go vet ./...`，`go test ./...`
- Desktop Go: `cd desktop && go test ./...`
- Desktop module hygiene: `cd desktop && go mod tidy && git diff --quiet -- go.mod go.sum`
- Site: `cd site && npm ci && npm run build`
- Agent-team config: `agent-team automation smoke .`，`agent-team automation diff-check`
- Skills sync: `node scripts/check-skills-sync.mjs`

跨模块修改完成前必须运行 `git diff --check`。

## Non-goals By Default

- 不默认迁移 Wails、Astro、Go module 结构或 CI 分支策略。
- 不把本地 secrets、用户配置、`.agents/state/` 运行态、mailbox 消息文件提交进仓库。
- 不把桌面平台专属依赖强加到 CLI 构建路径。
<!-- AGENT:OVERLAY:END -->
