# Agent Configuration Template

> Auto-deployed by [agent-team-config](https://github.com/zuohuadong/agent-team-config).
> This file is overwritten by `agmesh deploy`. Put project-specific additions in `.agents/AGENTS.local.md`.
> Detailed rules live in `.agents/docs/AGMESH.md`; load that file only when the task needs the expanded workflow.

## Language

- Reply to the user in Simplified Chinese.
- Use Chinese for important code comments or code explanations when it fits the surrounding codebase.
- Keep status concise; do not paste large raw logs, files, base64, or screenshots into chat.

## Startup Loop

- Start with repo truth: inspect `git status` and targeted files.
- If `.agents/state/coordination.json` exists, use `agmesh context . --task <id>` or `agmesh automation status .` for bounded task, event, and mailbox context.
- Legacy projects only: read the smallest needed slices of `tasks.md`, `progress.md`, and `.mailbox/`.
- Prefer `rg`, focused `sed` ranges, `jq`, `git diff --stat`, `agmesh memory recall "<query>" --token-budget <n>`, and `agmesh automation context-pack . --type <kind>` over loading broad files.
- If `agmesh automation doctor .` reports context warnings, run the suggested archive/prune command before broad exploration.

## Task Rules

- Do not silently shrink scope. Stop and state the tradeoff if the work exceeds the request.
- Never hardcode secrets, tokens, API keys, credentials, or sensitive URLs in code, logs, templates, or durable memory.
- Do not auto-commit, push, publish, deploy, or write production state unless the user explicitly requested it.
- Verify with the narrowest meaningful test first, then broaden for shared CLI behavior, templates, automation, data, security, deployment, or user-facing workflows.

## Delegation Gate

- For implementation, fix, test, deploy, refactor, PR/MR, or automation work, make a Delegation Decision before editing.
- Resolve `orchestration.mode` as `adaptive|native|managed|panel`. Adaptive requires an explicit Task Contract/project override or the intersection of model catalog and current host/runtime evidence for `native_delegation`, `tool_call`, `long_horizon`, `structured_output`, `context_isolation`, and `runtime_recovery`; missing evidence falls back to managed.
- Native keeps one owner/writer (low risk external=0; medium risk exactly one verifier). Managed dispatches only needed lanes under budget. High risk, review-high, or explicit reviewer disagreement resolves to a bounded panel with one writer and at most three read-only reviewers; ordinary review status alone does not. Product direction, aesthetics/taste, and business choices resolve to human-loop, while high-risk or irreversible operations still take panel precedence.
- Explicit legacy `collaboration.mode` remains compatible and resolves to managed. All modes share deterministic tests/build/typecheck/diff/approval/recovery evidence gates.
- Low-risk work may be done by the current owner with deterministic verification. A native plan with external=0 is a valid resolved plan, not a `safe_skip_reason`.
- Pure explanation, read-only review, simple shell queries, formatting-only edits, and documentation-only tasks may skip the Delegation Gate with `safe_skip_reason`.
- Host tool policy is not a valid `safe_skip_reason`. When the resolved plan requires a lane and runtime can spawn it, dispatch it; otherwise record `interruption_recovery` and mark the result `blocked` or `PARTIAL`. Native low-risk external=0 is not a runtime gap.
- Post-edit evidence/review gate: behavior-affecting changes require current diff inspection and deterministic verification; medium risk may add at most one independent verifier, high risk uses panel, and human-loop waits for a human decision.
- PARTIAL terminal gate: when every remaining acceptance item depends on production authorization, real credentials, external accounts, deployment, or human permission, record `PARTIAL` with exact blockers, set the task `blocked`, and end the current task cycle. Do not auto-expand the same goal into acceptance-tool or framework work.
- Scope/continuation gate: claim freezes goal, non-goals, acceptance, risk, and orchestration. Material changes or resuming after `PARTIAL` require a follow-up Task Contract with `parent` / `source` / `reason`, or auditable human confirmation. Keep coordination status/risk, Contract execution state/scope hash, and effective orchestration consistent; default WIP is one `running` task.

## Progressive Context

- Load project prompts, workflows, `references/skills/`, installed skills, and `.agents/docs/AGMESH.md` only when the current task needs them.
- For stack, deployment, or persistence choices, first select the relevant profile skill (`stack-profile-selector`, `deployment-target-selector`, or `database-profile-selector`), then load concrete framework skills.
- Keep visual evidence path-based. Inspect images only when visual judgement is essential, summarize the observation, and continue from paths.
- If a Codex session hits context pressure, run `agmesh automation inspect-session-context <session-id|session-file>` and continue with a concise handoff summary.

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
- Site: Astro documentation site in `site/`, using npm and Node 26 in CI.
- Release: GitHub Actions currently targets `main-v2`; CNB 镜像仓库同步时不要改动该分支策略，除非任务明确要求。

## Required Skills

- 默认先读 `references/skills/INDEX.md`。
- Desktop UI、UX、布局、组件状态、响应式或信息架构任务必须加载 `.agents/skills/volt-gui-design-language/SKILL.md` 和根目录 `DESIGN.md`。
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
- 不在新 UI 中扩展 `--aorist-*`、`--law-*` 或 Accio 命名的兼容样式；新设计使用 Volt 语义和 `DESIGN.md`。
- 不把本地 secrets、用户配置、`.agents/state/` 运行态、mailbox 消息文件提交进仓库。
- 不把桌面平台专属依赖强加到 CLI 构建路径。
<!-- AGENT:OVERLAY:END -->
