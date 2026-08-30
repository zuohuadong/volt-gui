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

本仓库已经完成到 Node 26 + Electron + 官方 DeepSeek Harness 的架构迁移。不要恢复已删除的旧运行时、renderer、服务端或自动同步链。

## Stack Profile

- Runtime: 精确锁定的官方 `@deepseek-ai/dsh`，由 Node 26 直接执行；DSH 负责会话、工具、权限、凭据、工作区和持久化。
- Desktop: `apps/desktop-electron/` 只负责窗口、安全边界、导航和官方 DSH 子进程生命周期。
- CLI/distribution: `scripts/anyong.mjs` 与 `scripts/bundle.mjs` 只封装官方 DSH 和 `profiles/anyong.yml`。
- Site: `site/` 是 Astro 文档站，使用 Node 26 与 npm 锁文件。
- Release: GitHub 只构建 Windows x64 Electron 未签名评审产物；CNB 只执行同一 Node 26 源码门禁。

## Required Skills

- 默认先读 `references/private-skills/INDEX.md`，再按需读 `references/skills/INDEX.md`。
- Electron 主进程、打包、安全或生命周期任务加载 `electron-desktop` 与 `typescript`。
- Site/Astro 任务加载 `typescript`；涉及部署时再加载 `deployment-target-selector`。
- Agent-team、Task Ledger、mailbox 或 PR 状态任务加载 `agent-team-automation` 与 `provider-adapter`。
- 暗涌产品、品牌或 CNB 任务分别加载 `volt-ops`、`anyong-brand-config`、`cnb-ci-cd`。

## Verification Profile

- Core: `pnpm test`，`pnpm run test:dsh-integration`，`pnpm run build`
- Electron: `node scripts/check-electron-runtime-boundary.mjs`，`pnpm run build:desktop`
- Migration: `node scripts/check-migration-boundary.mjs`
- Site: `cd site && npm ci && npm test`
- Workflows: `node --test scripts/ci-workflows.test.mjs`
- Skills: `node scripts/check-skills-sync.mjs`
- Final: `git diff --check`

## Architecture Boundaries

- 不新增仓库内 Harness 包、独立 renderer/preload、第二套权限/凭据/会话/持久化实现。
- 不恢复已删除的旧原生运行时、桌面桥接、账户/论坛/崩溃 Worker、旧发布链或自动外部同步。
- Electron 只能加载它管理的 DSH loopback origin；保持 `contextIsolation`、sandbox、Node integration 和浏览器权限 fail closed。
- 官方 DSH 的版本升级必须使用 npm 当前版本、精确锁定并通过集成与打包 smoke。
- 不提交 secrets、用户配置、`.agents/state/`、mailbox 或生成产物。
<!-- AGENT:OVERLAY:END -->
