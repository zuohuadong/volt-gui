# Codex Automations

> 这里记录推荐的 Codex 定时任务定义。默认只创建 2 个可见 automation：常规 Scheduler 和高风险 Reviewer/Arbiter。实际执行源仍然是每个项目自己的 Task Ledger / `tasks.md`。

## 覆盖工作区

```text
D:/workspace/xgic-ingest
D:/workspace/xgic-kb
D:/workspace/seagoo-ai
```

## Agent Team Scheduler

- 类型：cron
- 频率：每 20 分钟；若当前 Codex cron 只支持小时级，则每小时
- 模型：`gpt-5.3-codex`
- 推理强度：high
- 责任：扫描项目队列并按条件执行常规低/中风险调度；不是最终仲裁者

```text
针对每个配置好的工作区执行 agent-team 自动化调度。先做轻量扫描，只读取判断队列是否有动作所需的最小信息；只有命中可处理项后，才读取 `progress.md`、`.mailbox/`、`tasks.md`、`.agents/automations/task-contract.md`、`.agents/workflows/task-automation.md`、`.agents/workflows/pr-review-merge.md`、`.agents/workflows/automation-health-check.md`、`.agents/workflows/automation-smoke.md`、项目级 `AGENTS.md` / `GEMINI.md` 和相关 skills。只把项目级 Task Ledger 作为执行源。

调度规则：先做轻量扫描，只判断是否存在 ready、review、超时 blocked/running、pending mailbox、provider 异常、smoke 到期，或明显需要高风险审查的任务。若没有任何可处理项，立刻静默结束：不写 progress、不发 .mailbox、不创建 follow-up、不切模型、不打印额外动作。只有在命中可处理项时才继续进入后续流程。

存在 ready 且 risk 为 low/medium、契约完整时，按 task-automation 串行领取并执行，直到没有可执行 ready 任务。实现前必须执行 Stack/Fullstack/Database/Deployment Profile Gate 和 Delegation Gate：涉及技术栈选择、SvelteKit/Nuxt、数据库/持久化、桌面端、移动端、小程序、Mpx、托管或部署平台边界时，必须记录 profile、decision source、evidence、required skills、non-goals、verification 和 rollback；推荐栈/推荐数据库/推荐平台只用于 greenfield fallback，不覆盖现有项目，不做隐含框架、数据库或托管平台迁移。中/高风险、多 subsystem、架构/API/数据模型/状态机/迁移、安全/权限/计费/生产配置、需要外部资料核验、或需要审查自己的完成声明时，派发 explorer / critic / verifier 子智能体或留下等价独立审查证据；子智能体请求必须写明 role、exact scope、read/write ownership、allowed files/directories、verification command、output schema 和 mailbox persistence；低风险单文件修复、简单命令或格式化可跳过，但必须记录安全跳过原因。常规 sidecar 默认使用 `gpt-5.3-codex`，只有高风险、生产/安全/数据/不可逆决策或 reviewer 分歧仲裁才升级 `gpt-5.5`，并写明 `escalation_reason`。ready 任务缺少目标、验收标准、scope、skill、测试约定，或缺少必要 Stack/Fullstack/Database/Deployment Profile/evidence/verification/rollback 时，直接标记 blocked 或 invalid；内容为空、字段不完整、无法判定目标或范围时优先标 invalid，不要新建派生动作，也不要升级成 follow-up。存在 review 且 risk 为 low、CI 通过、diff 窄、契约满足时，按 pr-review-merge 审查并可合并。review medium 只在检查充分且项目规则允许时合并，否则留下 review 摘要。review high、生产/权限/认证/数据迁移/安全/大范围 diff 或回滚困难时，不要合并，标记 `needs_model: gpt-5.5` 和 `review_class: review-high`，写明 `escalation_reason`，交给 High-Risk Reviewer。provider 权限、CI 可见性、ledger/PR 状态漂移时运行 `agent-team automation doctor .` 并按 automation-health-check 处理；doctor 只有在 `.agents/state/tasks.json` 存在且可解析时才对缺失 subagent evidence 做 warning，否则只报告跳过该 enforcement。每周 smoke 到期时在 agent-team-config 工作区运行 `agent-team automation smoke`；发布前运行 `agent-team automation release-check`。不要触碰无关业务改动。
```

## Agent Team High-Risk Reviewer / Arbiter

- 类型：cron
- 频率：每小时
- 模型：`gpt-5.5`
- 推理强度：high
- 责任：只处理 `needs_model: gpt-5.5` / `review_class: review-high` 的高风险审查、最终仲裁和 reviewer 分歧裁决

```text
针对每个配置好的工作区，只扫描并处理 Task Ledger / Task Contract 中明确标记为 `needs_model: gpt-5.5` 或 `review_class: review-high` 的任务。若没有匹配到这两个标记，直接静默结束，不写 progress、不发 .mailbox、不创建 follow-up、不触碰普通 ready 队列、不输出逐项目长报告。发现高风险任务时，再读取 `progress.md`、`.mailbox/`、`tasks.md`、`.agents/automations/task-contract.md`、`.agents/workflows/pr-review-merge.md`、相关 PR/MR diff、CI/check 状态、provider 原始任务、项目规则和相关 skills。

高风险审查策略：如果没有匹配到 `needs_model: gpt-5.5` / `review_class: review-high`，直接静默结束，不写 progress、不发 .mailbox、不创建 follow-up。若匹配到的任务内容为空、字段不完整、无法判定风险范围或目标，直接标 invalid 或 blocked，不要归档成新动作，也不要扩大成普通任务。只有在 PR/MR 方向正确但实现有问题时才退回原 PR/MR 要求修复；如果 PR/MR 方向错误，标记 blocked，更新 Task Contract，必要时拆子任务并引用原任务/原 PR；如果问题已经合并进入主线，才创建 follow-up 修复任务，且必须包含 parent / source / reason。自动合并只允许在风险已降级、CI 全绿、diff 窄、回滚明确且契约逐条满足时发生。对生产、数据、权限、安全、不可逆迁移，默认只给审查结论和人工确认建议。处理 reviewer 分歧时必须引用各方证据、写明裁决理由和 accepted risks。处理完成后更新 Task Ledger 和 progress，并清除或更新 `needs_model` / `review_class`。不要处理普通 ready 任务，不要触碰无关业务改动。
```

## 内部流程参考

以下流程仍保留为 Orchestrator 内部调用规则，不建议再创建独立可见 automation：

- `task-automation`：常规 ready 任务执行
- `pr-review-merge`：低/中风险 review 审查合并
- `automation-health-check`：权限、CI 可见性、队列漂移检查
- `automation-smoke`：沙盒 no-op 冒烟测试
