# Project Task Ledger

> 项目级任务账本模板。它是当前项目的执行任务源；全局 dashboard 只能聚合状态，不应替代项目 ledger。

## 推荐状态

- `ready`：可领取
- `running`：已领取
- `review`：已提 PR，等待审查
- `blocked`：被外部条件阻塞
- `invalid`：内容不完整或无法执行
- `done`：已完成
- `archived`：已归档，不再进入自动化队列

## 任务格式

```md
| task_id | provider | repo | source_url | title | priority | risk | status | owner | model | needs_model | review_class | branch | change_request_url |
|---------|----------|------|------------|-------|----------|------|--------|-------|-------|-------------|--------------|--------|--------------------|
| 001 | local | owner/repo | - | 修复登录回调 | high | low | ready | AI | gpt-5.3-codex | - | - | feat/login-fix | - |
```

## 单条任务建议包含

- Provider 和原始任务链接
- 目标
- 非目标
- 验收标准
- 相关 skill 和代码规范
- 影响范围
- 风险和回滚
- 验证计划
- 参考链接 / issue / PR / MR
- parent task / 原任务引用
- source / 原 PR/MR 引用
- reason / 为什么派生这个任务

## 自动化规则

1. 执行器串行循环处理 eligible `ready` 任务，直到任务列表没有可执行任务
2. 领取前必须先形成 Task Contract
3. 领取前必须识别相关 skill、项目代码规范和测试约定
4. 同一时间只领取并持有一个任务；每完成或阻塞一个任务后，重新读取 ledger 和 mailbox
5. 领取后先建分支或 worktree，再改代码
6. 完成后必须附带测试结果和 PR/MR 链接
7. 审查器只处理 `review` 任务对应的 PR/MR，并按 Task Contract 逐条审查
8. 审查不合格优先退回原 PR/MR，只有原 PR/MR 无法继续或问题已合并才创建 follow-up 修复任务
9. 高风险审查使用 `needs_model: gpt-5.5` 或 `review_class: review-high` 交给 High-Risk Reviewer
10. 中/高风险、跨 subsystem、架构/API/数据/安全/生产、或自审任务必须通过 Delegation Gate；子智能体请求需写明 role、scope、ownership、allowed files、verification command、output schema 和 mailbox persistence
11. `automation doctor` 只有在 `.agents/state/tasks.json` 存在且可解析时，才对缺失 subagent evidence 做 warning；不要仅从 Markdown 表格强推断

## 当前任务

| task_id | provider | repo | source_url | title | priority | risk | status | owner | model | needs_model | review_class | branch | change_request_url |
|---------|----------|------|------------|-------|----------|------|--------|-------|-------|-------------|--------------|--------|--------------------|
| VOLTGUI-001 | local | aizhuliren/volt-gui | - | 初始化 agent-team 通用规则与项目 skill 索引 | high | low | done | codex | gpt-5-codex | - | - | main | - |

### VOLTGUI-001 Task Contract

- 目标：导入通用 agent-team 工作流、角色 prompts、Task Ledger、progress、mailbox、references/skills，并为 Volt GUI 记录项目专属验证约定。
- 非目标：不修改业务代码、不更换 Go/Wails/Astro 技术栈、不改发布分支策略、不提交 secrets 或本地运行态。
- 验收标准：规则文件可版本化；`references/skills/INDEX.md` 可用；`.agents/AGENTS.local.md` 明确 Go CLI/TUI、Wails desktop、Astro site 的验证命令；基础 smoke/diff/test 验证通过或记录阻塞原因。
- 相关 skill：`agent-team-automation`、`provider-adapter`、`stack-profile-selector`、`typescript`；Go/Wails 按仓库现有规范执行。
- 代码规范：遵循现有 Go module 边界，Go 文件使用 `gofmt`，前端站点使用 `site/package-lock.json` 与 npm。
- 风险：agent-team deploy 默认 `.gitignore` 过宽，可能导致规则文件无法提交；已收紧为只忽略 `.agents/state/` 运行态和 mailbox 消息。
- 回滚方案：移除新增 `.agents/`、`.mailbox/`、规则入口文件、`references/skills/`、`progress.md`、`tasks.md`，并还原 `.gitignore`。
- 验证计划：`agent-team automation smoke .`、`agent-team automation diff-check`、`go test ./...`、`cd desktop && go test ./...`、`cd site && npm ci && npm run build`。
