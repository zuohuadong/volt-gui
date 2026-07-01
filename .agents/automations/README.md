# Automation Runbook

## 推荐架构

1. **Task Contract**：每个任务先标准化为契约，再进入自动化队列
2. **Provider Adapter**：GitHub、CNB、GitLab 和本地 `tasks.md` 只负责映射任务来源，不参与核心决策
3. **Skill & Convention Gate**：领取前识别相关 skill、项目代码规范、测试约定和提交规范
4. **AgentCard**：`agent-team agent list . --json` 输出可查询的 runtime 能力档案；`--write` 可持久化到 coordination DB 的 `agent_registry`
5. **Matter / Taste**：`matter list|show|draft|advance|review` 呈现交付现场；`taste save|recall` 沉淀验收偏好，但不能覆盖测试、事实、安全边界或用户最新指令
6. **Scheduler**：默认只创建 1 个常规可见定时任务，使用 `gpt-5.3-codex` 每 6 小时扫描并处理低/中风险流程；它不是最终仲裁者
7. **High-Risk Reviewer / Arbiter**：只创建 1 个高风险审查/仲裁定时任务，每 6 小时处理 `needs_model: gpt-5.5` / `review_class: review-high`、生产/安全/数据/不可逆决策和 reviewer 分歧；`needs_model: gpt-5.5` 是升级标记，实际运行模型走高风险候选链，并可用 `AGENT_TEAM_HIGH_RISK_MODEL`、`AGENT_TEAM_HIGH_RISK_MODELS`、`AGENT_TEAM_ARBITER_MODEL` 或项目配置覆盖
8. **内部流程**：执行器、低风险审查、健康检查和 smoke 都作为 Orchestrator 内部流程，不再推荐创建独立可见 automation
9. **工作方式**：每个任务单独分支或 worktree，避免相互污染
10. **分层原则**：全局只存规则、模板、skills 和 adapter 规范，项目级 ledger 才是执行源；空队列只输出 `NOOP`，不展开无任务对话

## Provider 检查

- GitHub：使用 `gh` 检查登录状态、仓库访问、Actions 可见性和 review PR 状态
- CNB：检查 git 远端访问和 `.cnb.yml` 可见性；如果设置 `CNB_TOKEN` 或 `CNB_API_TOKEN`，还会检查 API 里的 pull 和 commit status 状态
- GitLab：检查 git 远端访问；深度 MR/CI 检查需要 `glab`
- Provider 检查只补充诊断，不替代项目级 Task Ledger
- `agent-team provider status . --json` 输出 GitHub/CNB/GitLab/local 的统一 provider adapter 状态；`agent-team provider sync . --write` 可把 normalized snapshot 写入 `.agents/state/provider-adapter-status.json` 供 dashboard 或外部编排读取。

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
- 高风险或复杂审查使用 `needs_model: gpt-5.5` / `review_class: review-high` 升级给 High-Risk Reviewer；运行模型优先级为显式 `--model`、任务 `model`、`AGENT_TEAM_HIGH_RISK_MODEL`、`AGENT_TEAM_HIGH_RISK_MODELS`、项目配置 `high_risk_arbiter` / `high_risk_arbiter_candidates`、`AGENT_TEAM_ARBITER_MODEL` / `AGENT_TEAM_ARBITER_MODELS`、项目配置 `arbiter`、任务 `needs_model`、`gpt-5.5` 兜底；默认高风险标记不等于必须实际使用 `gpt-5.5`
- 推荐最终裁决候选链采用国产优先并保留平台原生和 GPT 兜底：`glm-5.2 -> kimi-k2.7-code -> deepseek-v4-pro -> minimax-m2.5-pro -> claude-opus-4-8 -> gpt-5-pro -> gpt-5.5 -> gemini-pro-agent`。matcher 会按模型族、版本号和 `pro/max/opus/sonnet/coder` 后缀排序，并识别 Codex/OpenAI、Claude Code、Zed 或第三方网关常见模型名前缀，包括 `openai/...`、`zed/...`、`xai/grok-*`、`mistral-*`；Gemini Pro agent 因效果较弱内置优先级最低；可用 `agent-team model init --probe` 探测可用模型，并用 `models.high_risk_arbiter_candidates`、`arbitration.high_risk_models` 或 `AGENT_TEAM_HIGH_RISK_MODELS` 配置候选链。
- 低风险执行层也走候选链，默认优先 `gpt-5.3-codex-spark -> gpt-5.3-codex -> sonnet -> gemini-3-flash-agent`；`gemini-3-flash-agent` 适合低风险、短上下文、可重试任务，不作为高风险默认。`glm` 等国产 profile 不拆低风险专用型号，默认低风险和高风险同用该国产模型；可用 `models.routine_subagent_candidates`、`models.<role>_candidates`、`AGENT_TEAM_LOW_RISK_MODELS` / `AGENT_TEAM_ROUTINE_MODELS` 覆盖。`gemini-pro-agent` 可作为高风险候选，但内置优先级最低。
- UI 设计生成和审美评审使用独立候选链，避免污染常规执行/高风险裁决。生成链默认 `gemini-3-flash-agent -> gemini-3.5-flash -> glm-5.2 -> qwen3-max -> kimi-k2.7-code -> claude-sonnet-4-6 -> gpt-5.5 -> gpt-5.3-codex`，审美评审链默认 `claude-sonnet-4-6 -> claude-opus-4-8 -> gemini-3.1-pro -> glm-5.2 -> gpt-5.5`；可用 `models.ui_design_candidates`、`models.ui_aesthetic_review_candidates`、`AGENT_TEAM_UI_DESIGN_MODELS`、`AGENT_TEAM_UI_AESTHETIC_MODELS` 覆盖。UI 任务建议多方裁决：Gemini/GLM/Qwen 生成方案，Codex/GPT 或 GLM 落地代码，Playwright 截图验证，Claude/Sonnet 按 `ui-aesthetic-review` skill 的审美 rubric 评审。
- 中/高风险、多 subsystem、架构/API/数据/安全/生产或自审任务必须走 Delegation Gate；子智能体请求必须包含 role、scope、ownership、allowed files、`verification_command` / verification commands、output schema 和 mailbox persistence
- 并行写入必须有明确 disjoint ownership；常规 sidecar 默认走低风险候选链，可通过 `subagent dispatch --model`、`automation review-loop-run --model`、`AGENT_TEAM_<ROLE>_MODEL(S)`、`AGENT_TEAM_SUBAGENT_MODEL(S)`、`AGENT_TEAM_LOW_RISK_MODELS`、`AGENT_TEAM_REVIEW_LOOP_MODEL` 或项目配置的 `subagents.<role>_model` / `models.<role>_candidates` / `models.review_loop` 覆盖；Goal Forge 深度设计/质证循环用 `--model`、`AGENT_TEAM_GOAL_FORGE_MODEL` 或 `models.goal_forge` 覆盖；Scheduler 和新建任务默认模型分别用 `models.scheduler` / `models.task_default` 覆盖；只有高风险/仲裁场景升级并写 `escalation_reason`
- 审查不合格优先退回原 PR/MR 修复
- 只有原 PR/MR 无法继续，或者问题已经合并进入主线，才创建 follow-up 修复任务
- follow-up 修复任务必须包含 parent / source / reason

## 记录规则

- coordination DB v2 项目把当前任务事件、mailbox 队列和 run refs 写入 `.agents/state/coordination.db`；默认用 `agent-team context . --task <id>` 读取有界上下文。
- legacy 项目更新 `progress.md` 时只写当前任务的 concise 事实；旧历史通过 `agent-team automation archive-progress . --keep-recent 50` 归档，不保留在默认上下文里。
- legacy 项目通过 `.mailbox/` 发送状态变化，并使用 `agent-team automation sync-state .` 从 `tasks.md` 同步 `.agents/state/tasks.json`；`agent-team automation claim <task_id> . --owner <owner> --branch <branch>` 会带锁推进 `ready -> running` 并同步状态
- 使用 `agent-team automation loop-strategy . --task <id> --domain auto` 先判断该任务应走 fanout、goal、micro-loop、macro-loop 还是 human-loop；只有机器验收或交付 QC 这类 `goal` / `micro-loop` 任务才适合自动评审闭环
- `loop-strategy` 同时给出 `parallelism` 建议：delivery/goal 默认 `read-only-fanout`，可并行 explorer/critic/verifier；fixed-list fanout 只有 Task Contract 为每个 executor 填写互斥 `allowed_files` 后才允许 `disjoint-writers`；marketing/demand/business 默认 `human-gated`，不得从指标或 agent score 直接启动写入型 agent
- 使用 `agent-team automation loop-trigger . --task <id> --source manual|schedule|doctor|mailbox|ci|metrics --event-key <key>` 记录触发信号；`manual` / `schedule` 是主动触发，只有显式 `--execute` 才能生成 review-loop 计划；`doctor` / `mailbox` / `ci` / `metrics` 是被动触发，只入队/记录，不能直接自动开 agent loop
- 使用 `agent-team automation review-loop . --task <id> --domain delivery --panels contract,tests,runtime --max-rounds 3` 生成有界计划；coordination DB v2 项目写入 `review_loops` 表，legacy 项目才生成 `.agents/state/review-loops/<task>.json`。该命令不自动启动模型，panel 执行仍走 `agent-team subagent dispatch`
- `review-loop-run` 会在 `parallelism.mode=read-only-fanout` 时并发运行同一轮只读 panel，以缩短审查墙钟时间；run record 和 mailbox 仍按 panel 单独记录，写入型 executor 不随 review-loop 自动并发
- 使用 `agent-team automation loop-health . --json` 做闭环体检：汇总 runtime timeout/error mailbox、review-loop/Goal Forge run evidence 和 context snapshot 膨胀风险，并列出 runtime-health、trace-eval、context-hygiene、TCB sidecar、human approval、macro product signal、Taste、skill evolution 等受控入口。
- `review-loop` / `evaluator-optimizer` 最多 6 个 panel、5 轮；agent score 只是代理指标，不是 CTR/CVR、付费、留存或生产真相。需求发现、营销获客和商业方向必须用 `agent-team automation product-signal` 记录真实世界数据或人工裁决；生产、secret、破坏性 git、迁移和发布必须走 `agent-team approval request|approve|reject`；同类失败出现 2-3 次时用 `agent-team automation skill-evolution --write` 生成 Matter 草案，不能自动改 skill/runbook
- 使用 `agent-team automation archive-ledger .` 归档 `done` / `archived` task rows 和 contracts，避免 inactive 历史反复进入当前上下文
- 使用 `agent-team automation prune-mailbox . --max-bytes 131072 --archive-status done,archived,error --keep-recent 5` 清理或归档过大的 `done` / `archived` / reviewed-error mailbox 消息；先运行 `review-mailbox-errors --all` 登记已审阅的 error 后才能归档 error 文件；仍被 Task Contract 或 `.agents/state/tasks.json` 引用的 evidence mailbox 会被保留，pending/alert 消息必须保留
- `agent-team automation status|doctor .` 在 coordination DB v2 项目读取 DB 状态，在 legacy 项目检查 `tasks.md`、`progress.md` 和 mailbox 聚合体积；出现 coordination context warning 时先按建议 archive/prune 或升级到 coordination DB v2，再做宽范围 agent 工作
- 如果启用 `.agents/state/tasks.json`，同步记录 subagent evidence 或 accepted safe skip reason；doctor 仅在该机器可读状态存在时执行缺失证据 warning，并会检查被引用的 `.mailbox/*.md` evidence 文件是否仍存在。行动型任务默认启用 agent-team delegation，不需要每次向用户请求子代理授权；宿主工具策略、`create_thread` / parallel-agent 限制、或用户未明确要求并行代理不是 accepted safe skip reason，应记录为 runtime/interruption/blocker evidence
- 中/高风险、长程、多子代理或可恢复任务可写 `.agents/state/runs/<run_id>.json`，按 `.agents/state/run-records.schema.json` 记录 run_id、task_id、子代理隔离、验证命令、证据引用和中断恢复状态
- 子代理默认上下文隔离，只通过 Task Contract、`.mailbox/`、run record 或命名 artifact 传递证据；子代理中断时先记录恢复动作，再继续执行
- 非显而易见决策写入 commit trailer

## Context Pack 与 Capability Benchmark

这两类命令默认都是本地手动触发，不进入 Scheduler，也不会自动调用昂贵模型：

```bash
agent-team automation context-pack . --type bug-fix
agent-team automation context-pack . --type pr-review
agent-team automation context-pack . --type deploy-verify
agent-team automation context-pack . --type ui
agent-team automation context-pack . --type db-migration

agent-team automation capability-benchmark . --suite pilot --write
agent-team automation capability-benchmark . --suite full --write
```

- `context-pack` 输出某类任务最小应注入的 workflows、skills、Task Contract section、证据类型和 stop rules。
- `capability-benchmark --suite pilot` 生成 5 个用例，覆盖 bug fix、PR review、deploy verify、UI 和 DB migration。
- `capability-benchmark --suite full` 生成 20 个用例，用于正式比较裸模型与 `agent-team` 机制的完成率、证据质量、返工次数、耗时和 token 成本。
- `capability-benchmark` 当前只生成本地计划文件，不执行模型调用；实际运行由人工或后续受控 runner 读取计划后触发。

## Skill Loading

- 默认渐进加载：先用 `references/skills/INDEX.md` 或已安装 skill 元数据判断命中，再读取完整 `SKILL.md` 和必要引用。
- 用户或 Task Contract 显式指定 `/skill-name` 时，视为本轮激活该 skill；仍需遵守项目规则、禁用列表和安全边界。
- 外部 `.skill` 归档或第三方 skill 只能作为显式选择，至少保留 `name`、`description`，推荐记录 `version`、`author`、`compatibility`；不要把外部仓库作为运行时 live dependency。

## Browser Automation Profile

涉及页面预览、截图、UI smoke、登录态验证或 CDP 诊断时，优先用任务描述选择入口：`agent-team automation browser-profile . --task "本地页面截图预览" --json`。已经明确 intent 时仍可用 `--intent <intent>`；需要落验收证据时加 `--verify --json`，再选择具体执行工具。

- `auto` / `light-smoke`：优先 `bun-webview`，失败或能力不足时升级到 `playwright`；Bun.WebView 是 lightweight fast path，不作为唯一验收后端。
- `local-preview`：优先 Codex 内置浏览器；没有可调用内置浏览器时用 `bun-webview` 或 `playwright`。
- `ci-e2e`：优先 `playwright`，因为它适合可复现脚本、trace、截图、移动端模拟和跨浏览器。
- `authenticated`：只有需要真实 Chrome 登录态、扩展或用户 profile 时才用 `chrome-cdp`；不要把用户 Chrome 作为普通 fallback。
- `cdp-debug`：优先 `chrome-cdp`，用于 DevTools protocol、网络/性能等底层证据。
- `--task` 会输出 `task_analysis`，包含推断出的 intent、命中的关键词、置信度、推荐验证命令；显式 `--intent` 优先级高于任务描述。

默认安全边界：不需要浏览器时不用浏览器；不要读取 cookies、密码、localStorage 或 profile 数据；提交表单、上传文件、改权限或产生外部副作用前必须有明确授权。

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
- coordination DB v2 项目以 `.agents/state/coordination.db` 为执行源；legacy 项目才以 `tasks.md`、`progress.md`、`.mailbox/` 和 Task Contract 为执行源。Goal Forge run/ledger 作为设计质证证据，在 Task Contract 的 `goal_forge.run_dir` / `goal_forge.ledger_paths` 中引用；v2 项目中 strict validate 通过的 `goal-forge run` 会写入 `run_records`，供 `loop-health` 和 trace evidence 使用。
- `agent-team automation status|doctor .` 会检查 Goal Forge runtime、项目配置和可选 checkout fallback；找不到 checkout 不阻塞二进制/package-first 运行。

## 任务契约模板

deploy 会生成 `.agents/automations/task-contract.md`，用于把不同平台的任务统一到同一结构。

## Codex 定时任务参考

deploy 会生成 `.agents/automations/codex-automations.md`，记录当前推荐的 Codex 定时任务、中文 prompt、模型、频率和覆盖工作区，方便提交到 GitHub 后供其他项目参考。

`templates/automations/recipes/codex-self-update-automations.md` 提供针对单一仓库（dogfooding 场景）的可粘贴 automation 配方，含覆盖工作区、Scheduler/Arbiter prompt 和创建后验证步骤，适合先在一个项目上跑通 loop engineering 闭环再推广。

`agent-team automation codex-schedule --project <path> --write` 会生成 Scheduler 和 High-Risk Reviewer / Arbiter 两个 Codex automation 定义到 `.agents/state/codex-automations.json`。在 Codex app 环境中加 `--sync-global` 会同步真实 `~/.codex/automations/*/automation.toml` cron automation，避免全局调度仍使用旧模型或旧 prompt；不要再创建 executor/reviewer/health/smoke 四个分散的可见定时任务。

需要接入 PR/MR 级 CI 审查时，显式加 `--ci-mode comment|merge` 生成第三个 CI reviewer 定义。`comment` 只评论不合并；`merge` 也必须经过 merge-bypass、自修改、CI、身份、风险和契约门禁后才允许自动合并。详细接线见 `ci-review-mode.md`，可参考 SupaCloud 的 AI Review & Auto-Merge 机制，但不要把 provider 不可用或模型失败当作允许合并的信号。

## Global Dashboard

`agent-team dashboard status --project <path> --project <path> --json` 聚合多个项目的 provider、Task Ledger / coordination DB 状态、mailbox、Goal Forge runtime 和 smoke 信号。dashboard 只做总览和索引，不能成为执行任务源。

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
