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

- coordination DB v2 项目通过 `agent-team context` / DB-backed task state 更新任务；legacy 项目的人工作业才直接写入 `tasks.md`
- 如果项目已经有 GitHub 或 CNB 工作流，优先用 AI 帮你创建对应平台的任务对象
- 任务必须先转换成 Task Contract，否则不要进入自动执行队列
- 任务必须声明相关 skill 和代码规范；不确定时先让 Agent 在仓库内搜索并补齐

## 领取规则

- 串行循环处理任务，直到项目级 Task Ledger 没有 eligible `ready` 任务
- 同一时间只领取并持有一个任务；每完成或阻塞一个任务后，重新读取 ledger 和 mailbox
- 已有未合并的同主题 PR/MR 时，先审查现有 PR/MR，不要重复创建
- 出现高风险变更时，暂停自动合并，改为人工确认
- 高风险或复杂审查使用 `needs_model: gpt-5.5` / `review_class: review-high` 升级给 High-Risk Reviewer
- 中/高风险、多 subsystem、架构/API/数据/安全/生产或自审任务必须走 Delegation Gate；子智能体请求必须包含 role、scope、ownership、allowed files、`verification_command` / verification commands、output schema 和 mailbox persistence
- 并行写入必须有明确 disjoint ownership；常规 sidecar 默认 `gpt-5.3-codex`，只有高风险/仲裁场景升级 `gpt-5.5` 并写 `escalation_reason`
- 审查不合格优先退回原 PR/MR 修复
- 只有原 PR/MR 无法继续，或者问题已经合并进入主线，才创建 follow-up 修复任务
- follow-up 修复任务必须包含 parent / source / reason

## 记录规则

- coordination DB v2 项目把当前任务事件、mailbox 队列和 run refs 写入 `.agents/state/coordination.db`；默认用 `agent-team context . --task <id>` 读取有界上下文。
- legacy 项目更新 `progress.md` 时只写当前任务的 concise 事实；旧历史通过 `agent-team automation archive-progress . --keep-recent 50` 归档，不保留在默认上下文里。
- legacy 项目通过 `.mailbox/` 发送状态变化，并使用 `agent-team automation sync-state .` 从 `tasks.md` 同步 `.agents/state/tasks.json`；`agent-team automation claim <task_id> . --owner <owner> --branch <branch>` 会带锁推进 `ready -> running` 并同步状态
- 使用 `agent-team automation loop-strategy . --task <id> --domain auto` 先判断该任务应走 fanout、goal、micro-loop、macro-loop 还是 human-loop；只有机器验收或交付 QC 这类 `goal` / `micro-loop` 任务才适合自动评审闭环
- 使用 `agent-team automation loop-trigger . --task <id> --source manual|schedule|doctor|mailbox|ci|metrics --event-key <key>` 记录触发信号；`manual` / `schedule` 是主动触发，只有显式 `--execute` 才能生成 review-loop 计划；`doctor` / `mailbox` / `ci` / `metrics` 是被动触发，只入队/记录，不能直接自动开 agent loop
- 使用 `agent-team automation review-loop . --task <id> --domain delivery --panels contract,tests,runtime --max-rounds 3` 生成有界计划；coordination DB v2 项目写入 `review_loops` 表，legacy 项目才生成 `.agents/state/review-loops/<task>.json`。该命令不自动启动模型，panel 执行仍走 `agent-team subagent dispatch`
- `review-loop` 最多 6 个 panel、5 轮；agent score 只是代理指标，不是 CTR/CVR、付费、留存或生产真相。需求发现、营销获客和商业方向必须接真实世界数据或人工裁决，不能用 agent judge 自嗨
- 使用 `agent-team automation archive-ledger .` 归档 `done` / `archived` task rows 和 contracts，避免 inactive 历史反复进入当前上下文
- 使用 `agent-team automation prune-mailbox . --max-bytes 131072 --archive-status done,archived,error --keep-recent 5` 清理或归档过大的 `done` / `archived` / reviewed-error mailbox 消息；先运行 `review-mailbox-errors --all` 登记已审阅的 error 后才能归档 error 文件；仍被 Task Contract 或 `.agents/state/tasks.json` 引用的 evidence mailbox 会被保留，pending/alert 消息必须保留
- `agent-team automation status|doctor .` 在 coordination DB v2 项目读取 DB 状态，在 legacy 项目检查 `tasks.md`、`progress.md` 和 mailbox 聚合体积；出现 coordination context warning 时先按建议 archive/prune 或升级到 coordination DB v2，再做宽范围 agent 工作
- 如果启用 `.agents/state/tasks.json`，同步记录 subagent evidence 或 safe skip reason；doctor 仅在该机器可读状态存在时执行缺失证据 warning，并会检查被引用的 `.mailbox/*.md` evidence 文件是否仍存在
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
- 不要把 legacy `progress.md`、`tasks.md` 或 `.mailbox/` 整文件写入 memory；coordination DB v2 项目以 `.agents/state/coordination.db` 为任务事实源，memory 只做可重建检索索引。
- 追加记忆前先按 `dedupe_policy` 去重；重复事实更新 source/last_seen，不重复堆积。
- 任何外部 provider 都不能绕过 token budget，也不能成为默认依赖。

## Subagent Context Budget

- `agent-team subagent dispatch` 默认会压缩 role prompt；verifier/explorer/critic 的长 task prompt 还会压成 `Orchestrator Evidence Capsule`，只保留 scope、allow-list 验证命令、验收标准和证据路径。
- `verification_command:` / `verification_commands:`、`--verification-command "<cmd>"`、旧式 `allowed command exactly once:` / `allowed command:` 都会被规范化为 sidecar 的完整命令 allow-list；显式 `--verification-command` 会由 orchestrator 在派发前执行一次并把 exit/stdout/stderr 作为 `Orchestrator Verification Evidence` 注入 verifier prompt；不要把完整 `progress.md`、完整 `.mailbox/` 历史或长日志粘进 verifier prompt。
- 用 `AGENT_TEAM_SIDECAR_TASK_PROMPT_TOKEN_BUDGET` 调整 read-only sidecar task capsule 预算；只有少数需要完整上下文的人工派发才使用 `--no-token-budget`。

## Goal Forge Integration

- `agent-team deploy .` 会创建 `.agents/goal-forge/README.md`、`.agents/goal-forge/goal-forge.config.json` 和 `.agents/goal-forge/runs/`。
- Goal Forge runtime 发现顺序：`GOAL_FORGE_BIN`、PATH 中的 `goalforge` / `goal-forge`、`npx -y @goalforge/cli@latest`、最后是 `../goal-forge` / `GOAL_FORGE_PATH` / `GOAL_FORGE_HOME` source checkout。
- 设计文档、架构/API/数据模型、迁移方案或高风险计划本身是交付物时，可运行 `agent-team goal-forge init . "<goal>"` 创建质证 run；需要实际执行时再运行 `agent-team goal-forge run . <runDir>`。
- coordination DB v2 项目以 `.agents/state/coordination.db` 为执行源；legacy 项目才以 `tasks.md`、`progress.md`、`.mailbox/` 和 Task Contract 为执行源。Goal Forge run/ledger 只作为设计质证证据，在 Task Contract 的 `goal_forge.run_dir` / `goal_forge.ledger_paths` 中引用。
- `agent-team automation status|doctor .` 会检查 Goal Forge runtime、项目配置和可选 checkout fallback；找不到 checkout 不阻塞二进制/package-first 运行。

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
