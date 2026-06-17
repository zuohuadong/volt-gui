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
| VOLTGUI-003 | local | aizhuliren/volt-gui | - | 远端重写后重新提交通用 skills 与同步校验 | high | low | done | codex | gpt-5-codex | - | - | main | - |
| VOLTGUI-001 | local | aizhuliren/volt-gui | - | 初始化 agent-team 通用规则与项目 skill 索引 | high | low | done | codex | gpt-5-codex | - | - | main | - |
| VOLTGUI-004 | local | aizhuliren/volt-gui | user-request | 通用 OIDC 员工登录与桌面端 auth gate | high | medium | done | codex | gpt-5.3-codex | - | review-medium | codex/feat-oidc-auth | https://cnb.cool/aizhuliren/volt-gui/-/compare/main...codex/feat-oidc-auth |
| VOLTGUI-005 | local | aizhuliren/volt-gui | review-merge | Workbench 产品插件框架（通用 upstream 插件层） | high | medium | done | codex | gpt-5.3-codex | - | review-medium | codex/product-plugin-framework | https://cnb.cool/aizhuliren/volt-gui/-/pull/6 |

### VOLTGUI-004 Task Contract

- 目标：在 Wails desktop 中实现通用 OIDC Authorization Code + PKCE 登录能力；当配置存在 `[auth] provider = "oidc"` 且本地无有效 token 时，优先显示员工登录 overlay；登录成功后保存 token 和用户 claims，并将用户维度带入启动 telemetry。
- 非目标：不实现 SupAuth 专用逻辑、不引入新的桌面或前端框架、不改变无 `[auth]` 配置时的 API Key onboarding 行为、不实现服务端模型代理策略、不把 token 或 secrets 写入 `voltui.toml`/日志/PR 描述。
- 验收标准：`internal/config.Config` 支持 `[auth]` 配置和默认值；desktop 提供 `NeedsAuth`、`StartOIDCLogin`、`CurrentUser`、`Logout` 绑定；OIDC 使用 issuer discovery、PKCE S256、state 和 nonce 校验、loopback one-shot callback server、0600 auth token file；frontend 在 auth gate 时显示 OIDC login overlay，并在成功后再检查 onboarding；startup ping 包含可选 `userId`/`userName`/`email`。
- 相关 skill：`agent-team-automation`、`provider-adapter`、`typescript`；遵循 `.agents/AGENTS.local.md` 的 Wails desktop 与 frontend verification profile。
- 代码规范：Go 代码使用 `gofmt`；TypeScript 避免 `any`，桥接类型与 dev mock 同步；不提交本地 secrets、`.agents/state/` 或 runtime token 文件。
- 影响范围：`internal/config/`、`desktop/`、`desktop/frontend/src/`、`desktop/frontend/wailsjs/`（如需更新绑定）、`progress.md`/`tasks.md`。
- 风险：OIDC 回调和 token 持久化涉及安全边界；必须限制 loopback、校验 state/nonce、避免落盘 id_token 原文；新增依赖可能受 Go toolchain/download 环境影响。
- 回滚方案：移除新增 OIDC 文件、回退 config/auth 字段、前端 overlay/bridge 改动和 telemetry user fields，恢复 `go.mod/go.sum` 与 frontend 绑定文件。
- 验证计划：`gofmt`；OIDC 单元测试；`GOTOOLCHAIN=local go test` 相关 Go 包；`cd desktop/frontend && pnpm build`；`git diff --check`。全量 `go test ./...` 若仍受既有 `reasonix/internal` 漂移阻断，需在 PR 说明中列为既有残余风险。

### VOLTGUI-005 Task Contract (review-merge)

- 目标：审查并合并 CNB PR #6 `codex/product-plugin-framework`，新增通用 Workbench 产品插件框架（配置合约 + workspace-local job/step/artifact store + Wails 绑定 + Svelte bridge/types/resourceProvider + 插件开发文档）。
- 非目标：不在 XGIC 私有层承载插件机制、不引入 MCP/HTTP/local provider 之外的新 provider 类型、不改既有 `[[plugins]]` MCP 语义、不部署。
- 验收标准：`[workbench]` 配置按 id 合并 user/project；`internal/workbench.Store` 实现 CreateJob/UpdateStep/ApproveStep/AddArtifact/ArtifactDir，原子写 0600、ID 清洗防路径穿越；Wails 绑定 `WorkbenchPlugins/WorkbenchProviders/ListJobs/CreateJob/GetJob/UpdateStep/ApproveStep/AddArtifact/ArtifactDir`；**Provider 向前端只暴露 headerKeys/envKeys（键名），绝不暴露 headers/env 值**；render.go 与既有 plugins/mcp 渲染一致（headers/env 建议 `${VAR}`）；TS 类型与 Go model 对齐。
- 相关 skill：`agent-team-automation`、`provider-adapter`、`typescript`；遵循 `.agents/AGENTS.local.md` Go/Wails/frontend Verification Profile。
- 风险：medium，跨多 subsystem（internal/config + internal/workbench + desktop + frontend）；安全边界为 provider secrets 不泄露到前端，已逐条验证。
- 回滚方案：回退 CNB main 至 `08e8019`（合并前头），删除新增 workbench 文件与配置字段。
- 审查与验证证据（独立审查由主线程执行等价验证）：`gofmt -l` 干净；`GOTOOLCHAIN=local go vet ./internal/config/... ./internal/workbench/...` EXIT 0；`go test ./internal/workbench/...` PASS；`go test ./internal/config/... -run 'TestRender|TestWorkbench'` PASS；`cd desktop && go test . -run 'TestWorkbench|TestWailsBinding|TestWorkspace|TestCheckpoints|TestAuth|TestOIDC|TestIsLoopback|TestPostStartupPing|TestAttachDropped'` PASS（补 dist 占位，仅 macOS `-lobjc` 既有警告）；`pnpm check`（svelte-check）0 errors/0 warnings；`pnpm build`（vite）✓ 1.23s。
- 合并方式：fast-forward `08e8019..54b3588`，CNB main 现为 `54b3588`；`git diff --check` 临时 worktree 通过。

### VOLTGUI-003 Task Contract

- 目标：在最新 `origin/main` 基础上重新同步通用 `references/skills/`，新增通用 skills manifest 和 `scripts/check-skills-sync.mjs`，防止远端重写后技能资产再次漂移。
- 非目标：不引入 XGIC 私有行业 skill、不修改 VoltUI 运行时代码、不部署、不调整 CI 分支策略。
- 验收标准：`references/skills/agent-team-skills-manifest.json` 与 `references/skills/*/SKILL.md` 一致；`node scripts/check-skills-sync.mjs` 通过；项目 overlay 记录该验证命令。
- 相关 skill：`skill-creator`、`agent-team-automation`、`provider-adapter`、`stack-profile-selector`。
- 风险：远端 `main` 曾 forced update，必须基于最新 `origin/main` 重新提交，避免推回旧历史。
- 回滚方案：删除 `references/skills/agent-team-skills-manifest.json`、`references/skills/SYNC.md`、`scripts/check-skills-sync.mjs`，还原 `.agents/AGENTS.local.md`、`tasks.md`、`progress.md`。
- 验证计划：`node scripts/check-skills-sync.mjs`、`git diff --check`、`agent-team automation diff-check`、`go test ./...`、`cd desktop && go test ./...`、`cd site && npm ci && npm run build`。

### VOLTGUI-001 Task Contract

- 目标：导入通用 agent-team 工作流、角色 prompts、Task Ledger、progress、mailbox、references/skills，并为 Volt GUI 记录项目专属验证约定。
- 非目标：不修改业务代码、不更换 Go/Wails/Astro 技术栈、不改发布分支策略、不提交 secrets 或本地运行态。
- 验收标准：规则文件可版本化；`references/skills/INDEX.md` 可用；`.agents/AGENTS.local.md` 明确 Go CLI/TUI、Wails desktop、Astro site 的验证命令；基础 smoke/diff/test 验证通过或记录阻塞原因。
- 相关 skill：`agent-team-automation`、`provider-adapter`、`stack-profile-selector`、`typescript`；Go/Wails 按仓库现有规范执行。
- 代码规范：遵循现有 Go module 边界，Go 文件使用 `gofmt`，前端站点使用 `site/package-lock.json` 与 npm。
- 风险：agent-team deploy 默认 `.gitignore` 过宽，可能导致规则文件无法提交；已收紧为只忽略 `.agents/state/` 运行态和 mailbox 消息。
- 回滚方案：移除新增 `.agents/`、`.mailbox/`、规则入口文件、`references/skills/`、`progress.md`、`tasks.md`，并还原 `.gitignore`。
- 验证计划：`agent-team automation smoke .`、`agent-team automation diff-check`、`go test ./...`、`cd desktop && go test ./...`、`cd site && npm ci && npm run build`。
