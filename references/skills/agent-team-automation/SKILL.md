---
name: agent-team-automation
description: Use when creating, editing, reviewing, or operating agent-team task automation, including Task Ledger, Task Contract, Codex scheduled tasks, executor/reviewer/health/smoke flows, blocked/follow-up rules, and project-level mailbox/progress coordination.
---

# Agent Team Automation

Use this skill for changes to `tasks.md`, `progress.md`, `.mailbox/`, `.agents/workflows/task-automation.md`, `.agents/workflows/pr-review-merge.md`, `.agents/workflows/automation-health-check.md`, `.agents/workflows/automation-smoke.md`, and `templates/automations/*`.

## Core Model

- Global `agent-team-config` stores rules, templates, skills, and provider adapter conventions.
- Each project owns its Task Ledger, progress log, mailbox, and optional local state.
- The project Task Ledger is the execution source; a global dashboard may only aggregate.
- A Task Contract is required before automated execution.

## State Flow

Use only these task states unless a project explicitly extends them:

- `ready`: eligible to claim
- `running`: claimed by one executor
- `review`: PR/MR or equivalent change request exists
- `blocked`: cannot safely continue
- `done`: completed and verified

Executors handle one task at a time and reread `tasks.md` plus `.mailbox/` after every completion or block. Reviewers only process `review` tasks.

## Delegation Gate（默认启动子代理）

**有任务时默认启动子代理执行，主进程（Orchestrator）负责审查和裁决。**

### 调度命令

```bash
agent-team subagent dispatch <role> "<prompt>" [--model <model>] [--runtime <codex|claude>] [--mailbox <file>]
agent-team subagent list    # 查看可用角色
agent-team subagent status  # 检查运行时可用性
```

### 默认模型映射

- Orchestrator / Arbiter: `gpt-5.5` — 仅用于任务拆解、风险分类、最终裁决、高风险审查和分歧仲裁
- Executor: `gpt-5.3-codex` — 实现、测试、修复、本地验证和提交准备 (sandbox: workspace-write)
- Explorer / Critic / Verifier: `gpt-5.3-codex` — 只有安全/数据/生产/不可逆决策或 reviewer 分歧时升级到 `gpt-5.5`

### 标准执行流程

1. Orchestrator 读取任务 → 形成 Task Contract
2. `agent-team subagent dispatch explorer "..."` → 代码探索和根因分析
3. `agent-team subagent dispatch executor "..."` → 实现代码
4. `agent-team subagent dispatch verifier "..."` → 独立完成验证
5. Orchestrator 审查所有子代理输出 → 裁决 PASS/FAIL

### 可跳过子代理的情况

- 单文件、低风险、目标和验收标准清楚的局部修复 → 仍需 Verifier
- 纯文档/格式化/简单命令 → 记录 `safe_skip_reason`
- 涉及 secrets、破坏性操作或用户明确要求当前会话处理 → 记录原因

### 子代理请求契约

每个 dispatch 必须包含：

- role: `executor` / `explorer` / `critic` / `verifier`
- exact scope: 要回答的问题或负责的实现切片
- read/write ownership: 只读，或允许修改的文件/目录
- allowed files or directories: 明确边界，避免并行写冲突
- verification command: 需要运行或复核的命令
- output schema: 至少包含 `verdict`、`evidence`、`blocking_findings`、`non_blocking_risks`、`recommended_next_action`
- mailbox persistence requirement

Do not run parallel writers unless file ownership is explicitly disjoint. Record either subagent evidence or a safe skip reason.

## Contract Gate

Before execution, make sure the Task Contract states:

- goal and non-goals
- acceptance criteria
- expected files/modules
- required skills and code conventions
- verification plan
- stack profile, decision source, evidence, and non-goals when a task creates,
  expands, or materially depends on a technical stack
- fullstack profile when a task depends on SvelteKit/Nuxt, SSR/SSG, server
  routes, route-level data loading, adapter targets, or separated frontend/API
  ownership
- database profile, migration strategy, backup/restore, and runtime access
  evidence when a task creates, changes, or depends on persistence
- deployment profile, target evidence, secrets strategy, verification, and
  rollback when a task creates, changes, or depends on hosting/deployment
- risk and rollback
- provider/source links
- parent/source/reason for follow-up tasks

If any of these are missing and cannot be inferred safely, mark or keep the task `blocked`.

`automation doctor` may warn about missing subagent evidence only when a canonical machine-readable task state such as `.agents/state/tasks.json` exists and can be parsed. Without that state, report that enforcement was skipped instead of inferring from Markdown table text.

## Review Failure Rule

- If the same PR/MR can still be fixed, return it to the original author/branch.
- If the PR/MR direction is wrong, mark the task `blocked` and update the contract.
- If the problem was already merged, create a follow-up task with `parent`, `source`, and `reason`.
- Do not create detached repair tasks.

## Smoke

Use `agent-team automation smoke` to validate the framework without touching production projects. Smoke should remain local, no-op, and clean up its sandbox by default.
