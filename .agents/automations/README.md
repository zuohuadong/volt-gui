# Automation Runbook

## 推荐架构

1. **Task Contract**：每个任务先标准化为契约，再进入自动化队列
2. **Provider Adapter**：GitHub、CNB、GitLab 和本地 `tasks.md` 只负责映射任务来源，不参与核心决策
3. **Skill & Convention Gate**：领取前识别相关 skill、项目代码规范、测试约定和提交规范
4. **Scheduler**：默认只创建 1 个常规可见定时任务，使用 `gpt-5.3-codex` 每 20 分钟或小时级扫描并处理低/中风险流程；它不是最终仲裁者
5. **High-Risk Reviewer / Arbiter**：只创建 1 个高风险审查/仲裁定时任务，使用 `gpt-5.5` 每小时处理 `needs_model: gpt-5.5` / `review_class: review-high`、生产/安全/数据/不可逆决策和 reviewer 分歧
6. **内部流程**：执行器、低风险审查、健康检查和 smoke 都作为 Orchestrator 内部流程，不再推荐创建独立可见 automation
7. **工作方式**：每个任务单独分支或 worktree，避免相互污染
8. **分层原则**：全局只存规则、模板、skills 和 adapter 规范，项目级 ledger 才是执行源；空队列只输出 `NOOP`，不展开无任务对话

## Provider 检查

- GitHub：使用 `gh` 检查登录状态、仓库访问、Actions 可见性和 review PR 状态
- CNB：检查 git 远端访问和 `.cnb.yml` 可见性；如果设置 `CNB_TOKEN` 或 `CNB_API_TOKEN`，还会检查 API 里的 pull 和 commit status 状态
- GitLab：检查 git 远端访问；深度 MR/CI 检查需要 `glab`
- Provider 检查只补充诊断，不替代项目级 Task Ledger

## 手动创建任务

- 人工可以直接写入 `tasks.md`
- 如果项目已经有 GitHub 或 CNB 工作流，优先用 AI 帮你创建对应平台的任务对象
- 任务必须先转换成 Task Contract，否则不要进入自动执行队列
- 任务必须声明相关 skill 和代码规范；不确定时先让 Agent 在仓库内搜索并补齐

## 领取规则

- 串行循环处理任务，直到项目级 Task Ledger 没有 eligible `ready` 任务
- 同一时间只领取并持有一个任务；每完成或阻塞一个任务后，重新读取 ledger 和 mailbox
- 已有未合并的同主题 PR/MR 时，先审查现有 PR/MR，不要重复创建
- 出现高风险变更时，暂停自动合并，改为人工确认
- 高风险或复杂审查使用 `needs_model: gpt-5.5` / `review_class: review-high` 升级给 High-Risk Reviewer
- 中/高风险、多 subsystem、架构/API/数据/安全/生产或自审任务必须走 Delegation Gate；子智能体请求必须包含 role、scope、ownership、allowed files、verification command、output schema 和 mailbox persistence
- 并行写入必须有明确 disjoint ownership；常规 sidecar 默认 `gpt-5.3-codex`，只有高风险/仲裁场景升级 `gpt-5.5` 并写 `escalation_reason`
- 审查不合格优先退回原 PR/MR 修复
- 只有原 PR/MR 无法继续，或者问题已经合并进入主线，才创建 follow-up 修复任务
- follow-up 修复任务必须包含 parent / source / reason

## 记录规则

- 更新 `progress.md`
- 通过 `.mailbox/` 发送状态变化
- 使用 `agent-team automation sync-state .` 从 `tasks.md` 同步 `.agents/state/tasks.json`；`agent-team automation claim <task_id> . --owner <owner> --branch <branch>` 会带锁推进 `ready -> running` 并同步状态
- 使用 `agent-team automation prune-mailbox . --max-bytes 131072` 清理过大的 `done` / `archived` mailbox 消息；pending/alert 消息必须保留
- 如果启用 `.agents/state/tasks.json`，同步记录 subagent evidence 或 safe skip reason；doctor 仅在该机器可读状态存在时执行缺失证据 warning
- 中/高风险、长程、多子代理或可恢复任务可写 `.agents/state/runs/<run_id>.json`，按 `.agents/state/run-records.schema.json` 记录 run_id、task_id、子代理隔离、验证命令、证据引用和中断恢复状态
- 子代理默认上下文隔离，只通过 Task Contract、`.mailbox/`、run record 或命名 artifact 传递证据；子代理中断时先记录恢复动作，再继续执行
- 非显而易见决策写入 commit trailer

## Skill Loading

- 默认渐进加载：先用 `references/skills/INDEX.md` 或已安装 skill 元数据判断命中，再读取完整 `SKILL.md` 和必要引用。
- 用户或 Task Contract 显式指定 `/skill-name` 时，视为本轮激活该 skill；仍需遵守项目规则、禁用列表和安全边界。
- 外部 `.skill` 归档或第三方 skill 只能作为显式选择，至少保留 `name`、`description`，推荐记录 `version`、`author`、`compatibility`；不要把外部仓库作为运行时 live dependency。

## Memory Adapter

- 默认记忆 provider 是 `local-file`，读写 `.agents/state/project-memory.json`，不需要外部服务或密钥。
- `mem0` / OpenMemory 作为现成 Agent Memory 方案只允许显式 opt-in：设置 `AGENT_TEAM_MEMORY_PROVIDER=mem0` 或 `openmemory`，并在 Task Contract 的 `memory_profile` 中记录证据、scope、secrets 策略和验证计划。
- 任务开始前可运行 `agent-team memory recall "<query>" --token-budget 1200`，只把命中摘要注入 prompt。
- 任务完成后可运行 `agent-team memory save decisions "<compact decision>"` 保存稳定决策。
- 不要把 `progress.md`、`tasks.md` 或 `.mailbox/` 整文件写入 memory；这些文件仍是任务事实源。
- 追加记忆前先按 `dedupe_policy` 去重；重复事实更新 source/last_seen，不重复堆积。
- 任何外部 provider 都不能绕过 token budget，也不能成为默认依赖。

## Goal Forge Integration

- `agent-team deploy .` 会创建 `.agents/goal-forge/README.md`、`.agents/goal-forge/goal-forge.config.json` 和 `.agents/goal-forge/runs/`。
- 默认从项目上级目录寻找 `../goal-forge` source checkout；也可设置 `GOAL_FORGE_PATH` 或 `GOAL_FORGE_HOME` 指向 checkout。Goal Forge 当前不是全局 CLI，不要假设存在 `goal-forge` 命令。
- 设计文档、架构/API/数据模型、迁移方案或高风险计划本身是交付物时，可运行 `agent-team goal-forge init . "<goal>"` 创建质证 run；需要实际执行时再运行 `agent-team goal-forge run . <runDir>`。
- agent-team 仍以 `tasks.md`、`progress.md`、`.mailbox/` 和 Task Contract 为执行源；Goal Forge run/ledger 只作为设计质证证据，在 Task Contract 的 `goal_forge.run_dir` / `goal_forge.ledger_paths` 中引用。
- `agent-team automation status|doctor .` 会检查 Goal Forge checkout、项目配置和依赖状态；找不到 checkout 是 warning，不阻塞普通实现任务。

## 任务契约模板

deploy 会生成 `.agents/automations/task-contract.md`，用于把不同平台的任务统一到同一结构。

## Codex 定时任务参考

deploy 会生成 `.agents/automations/codex-automations.md`，记录当前推荐的 Codex 定时任务、中文 prompt、模型、频率和覆盖工作区，方便提交到 GitHub 后供其他项目参考。

`templates/automations/recipes/codex-self-update-automations.md` 提供针对单一仓库（dogfooding 场景）的可粘贴 automation 配方，含覆盖工作区、Scheduler/Arbiter prompt 和创建后验证步骤，适合先在一个项目上跑通 loop engineering 闭环再推广。

## Sandbox Smoke

```bash
agent-team automation smoke
agent-team automation skills-smoke
agent-team automation release-check
```

- 默认创建临时沙盒，完成后自动清理
- 使用 `agent-team automation smoke ./tmp-smoke --keep` 可保留沙盒排查
- `skills-smoke` 验证 `references/skills/*/SKILL.md` 已同步到 Codex skill 目录
- `release-check` 验证 skill 同步、`setup.ts` 打包、deploy、Task Ledger、mailbox、分支、no-op 提交、review/done 状态和 `git diff --check`
- 不访问 GitHub / CNB / GitLab，不创建真实 PR/MR，不污染生产仓库
