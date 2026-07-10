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
| VOLTGUI-004 | local | aizhuliren/xgic/anyong-agent | - | 迁移桌面自动发布为 CNB Windows-only | high | medium | done | codex | gpt-5-codex | - | - | main | - |
| VOLTGUI-003 | local | aizhuliren/xgic/voltui | - | 远端重写后重新提交通用和私有行业 skills | high | low | done | codex | gpt-5-codex | - | - | main | - |
| VOLTGUI-001 | local | aizhuliren/volt-gui | - | 初始化 agent-team 通用规则与项目 skill 索引 | high | low | done | codex | gpt-5-codex | - | - | main | - |
| VOLTGUI-004 | local | aizhuliren/volt-gui | user-request | 通用 OIDC 员工登录与桌面端 auth gate | high | medium | done | codex | gpt-5.3-codex | - | review-medium | codex/feat-oidc-auth | https://cnb.cool/aizhuliren/volt-gui/-/compare/main...codex/feat-oidc-auth |
| VOLTGUI-005 | local | aizhuliren/volt-gui | review-merge | Workbench 产品插件框架（通用 upstream 插件层） | high | medium | done | codex | gpt-5.3-codex | - | review-medium | codex/product-plugin-framework | https://cnb.cool/aizhuliren/volt-gui/-/pull/6 |
| ANYONG-SYNC-20260710 | local | aizhuliren/xgic/anyong-agent | user-request | 合并 GitHub upstream/main 更新并保留暗涌 fork 覆盖 | high | medium | done | codex | gpt-5.3-codex | - | review-medium | main | - |
| ANYONG-RELEASE-20260710 | local | aizhuliren/xgic/anyong-agent | user-request | 构建并发布合并 computer-use MCP 与 Bun runtime 的新版 | high | high | done | codex | gpt-5.3-codex | gpt-5.5 | review-high | main | https://cnb.cool/aizhuliren/xgic/anyong-agent/-/releases/download/desktop-v0.8.0/latest.json |
| ANYONG-SYNC-20260710-2 | local | aizhuliren/xgic/anyong-agent | user-request | 重新合并 fresh GitHub upstream/main 更新 | high | medium | done | codex | gpt-5.3-codex | - | review-medium | main | - |
| ANYONG-RELEASE-20260710-3 | local | aizhuliren/xgic/anyong-agent | user-request | 提交推送并发布 Windows Bun staging 修复版 | high | high | done | codex | gpt-5.3-codex | gpt-5.5 | review-high | main | https://cnb.cool/aizhuliren/xgic/anyong-agent/-/releases/download/desktop-v0.8.1/latest.json |

### ANYONG-RELEASE-20260710-3 Task Contract

- 目标：提交当前协调记录，创建 `fix(desktop):` 发布触发提交，推送本地 `main`（含 merge `a3c92dc5`）到 CNB origin，构建并发布 Windows amd64 修复版。
- 非目标：不改产品代码、不创建 `feat:` minor 版本、不发布 macOS/Linux/CLI、不修改仓库可见性、不强推或覆盖既有 tag。
- 验收标准：fresh origin 最新桌面 tag 为 `desktop-v0.8.0`；HEAD `fix:` 计算为 `desktop-v0.8.1`；远端 main 与本地 HEAD 一致；CNB pipeline-1/2 成功；tag/Release 存在；资产为 Anyong installer/zip/latest.json；manifest 的版本、canonical installer URL、size、SHA-256 与 Release 资产一致；真实 zip 包含 Bun/N-API/MCP 资源。
- 协作模式：`pipeline`，explorer 审计版本与触发提交，生产 commit/push 由 orchestrator 主进程执行，独立 verifier 复核候选和 live Release。
- 相关 skill：`agent-team-delegation-gate`、`cnb-ci-cd`、`xigu-ai-ops`、`anyong-brand-config`；沿用 resync explorer/executor/verifier 证据。
- 风险：high，涉及远端 main、自动 tag/Release、私有资产和 Windows 安装包；空 `fix:` 触发提交必须位于 push 的最终 HEAD，否则不会发布。
- 回滚：push 前停止；构建失败时用普通 `fix:` follow-up 修复并产生下一 patch tag，不强推、不重写 tag；错误 Release 通过 CNB 管理撤回。
- 验证计划：commit scope/diff 检查；fresh origin refs/tags；本地 staging/Go/manifest 门禁；独立候选 verifier；push 后 CNB status API、git refs、Release API、latest.json 与真实 zip 下载验证。

### ANYONG-SYNC-20260710-2 Task Contract

- 目标：在已发布 `desktop-v0.8.0` 的 `main` 上重新 fresh fetch 并合并 GitHub `upstream/main`，保留 Anyong 品牌/CNB/manifest/Bun/N-API 打包覆盖。
- 非目标：不推送、不触发新发版、不改仓库可见性、不丢弃下游发布修复、不运行会 `add -A`/force push 的旧同步脚本。
- 验收标准：fresh upstream 头成为本地 `main` 祖先；无未解决冲突；`.cnb.yml` Anyong/CNB canonical URL、`desktop/cmd/sign` env URL 支持、`scripts/desktop-build.sh` Anyong prefix/OEM/portable fallback 与 computer-use Bun/N-API 打包均保留；按实际变更运行测试并由独立 verifier PASS。
- 协作模式：`pipeline`，explorer 审计 upstream delta/冲突面，executor 完成 merge union，verifier 独立复核，orchestrator 最终裁决。
- 相关 skill：`agent-team-delegation-gate`、`xigu-ai-ops`、`anyong-brand-config`、`cnb-ci-cd`；遵循现有 Go/Wails/CNB 验证约定。
- 风险：upstream 可能包含 release-please 版本提交并再次改动 `desktop-build.sh`、sign/updater/NSIS；错误选择 ours/theirs 会破坏 Anyong 发布链或 bundled computer-use runtime。
- 回滚：合并提交前可 `git merge --abort` 并恢复精确 stash；合并提交后仅用普通 revert 回滚本次 merge，不强推、不覆盖 tag。
- 验证计划：fresh fetch、merge-tree 冲突预演、`git diff --check`、root/desktop/release tools/frontend 按变更范围测试、品牌/URL/Bun/N-API 关键字审计、独立 verifier。

### ANYONG-RELEASE-20260710 Task Contract

- 目标：将已合并的 upstream computer-use MCP + Bun runtime 与 Anyong 产物命名覆盖形成可发布提交，推送 `main` 触发 CNB Windows amd64 自动发版，并以 CNB 实际构建、tag、Release 和资产为最终证据。
- 非目标：不改 Go/Wails 技术栈、不把 Bun 用作主程序构建工具、不重写或替换 N-API addon、不发布 macOS/Linux/CLI、不暴露或提交凭据。
- 验收标准：明确 Bun 的真实职责；fresh origin tag 基线与版本计算一致；本地发布门禁通过；发布提交使用 `feat:` 触发版本；CNB 构建成功并创建新的 `desktop-v*` tag；Release 至少包含 `Anyong-windows-amd64-installer.exe`、`Anyong-windows-amd64.zip`、`latest.json`，manifest 指向 Anyong installer；远端 `main` 与本地发布提交一致。
- 协作模式：`pipeline`。explorer 审计版本/打包/runtime，生产 push/tag/release 由 orchestrator 主进程执行（避免把凭据和不可逆外部写入委派），独立 verifier 复核本地发布候选与 live CNB 结果。
- 相关 skill：`agent-team-delegation-gate`、`agent-team-diagnose`、`agent-team-tdd`、`cnb-ci-cd`、`xigu-ai-ops`、`anyong-brand-config`；遵循项目 Go/Wails/CNB Verification Profile。
- 风险：high，涉及远端 `main`、自动 tag、Windows 安装包、OEM sidecar 与原生 `.node` addon；Bun/MCP 资源会显著增大安装包；CNB token、npm 网络或原生目标不匹配会阻断发布。
- 回滚：发布前可停止 push；push 后若构建失败，以新的 `fix:` 提交修复并产生 patch 版本，不强推、不覆盖既有 tag；错误 Release 通过 CNB 平台撤回，代码用普通 revert 提交回滚。
- 验证计划：YAML/shell/Node 语法；Windows 目标 MCP/Bun staging 实测并核对 `.node`/`bun.exe`；修复并锁定语义 provider family 的既有失败测试；Go root/desktop/release tools 测试；前端 release build/check；独立 verifier；push 后持续检查 CNB build、tag、Release 资产与 `latest.json`。

### ANYONG-SYNC-20260710 Task Contract

- 目标：fresh fetch `git@github.com:zuohuadong/volt-gui.git` 的 `upstream/main`，将真实增量合并到当前 `main`，保留暗涌配置化品牌、CNB 发布覆盖和现有未提交工作区改动。
- 非目标：不推送、不部署、不触发发布、不把上游通用源码改成硬编码暗涌品牌、不丢弃或擅自提交现有未提交改动。
- 验收标准：`main` 包含 fresh `upstream/main`；无未解决冲突；合并前已有的 `.cnb.yml`、`desktop/cmd/sign/main_test.go`、`scripts/desktop-build.sh` 改动仍存在；品牌仍通过配置实现；`.upstream-sync-marker` 与 fresh upstream 头一致；针对实际改动运行真实验证并通过或明确记录阻塞。
- 协作模式：`pipeline`，explorer 先审计上游增量与冲突面，主进程执行合并，独立 verifier 复核结果，orchestrator 最终裁决。
- 相关 skill：`agent-team-delegation-gate`、`xigu-ai-ops`、`anyong-brand-config`；遵循项目 Go/Wails/Astro 目录边界和 Verification Profile。
- 预计影响：Git 历史、`.upstream-sync-marker`、上游实际变更文件；协调记录位于 `tasks.md` / `progress.md`，不提交 `.agents/state/` 或 mailbox 运行态。
- 风险：上游与 fork 品牌/CNB/发布文件冲突；当前工作区有未提交改动；上游可能包含跨 Go、desktop/frontend、site 的变化。
- 回滚：合并提交产生前可 `git merge --abort` 并恢复自动暂存；产生后如需回退仅针对本次 merge commit 使用非破坏性 revert，现有未提交改动保持独立。
- 验证计划：`git diff --check`；按上游变更范围运行 root/desktop/frontend/site 的最小真实门禁；检查冲突标记、品牌硬编码漂移、marker 和 ahead/behind；由独立 verifier 给出 PASS/FAIL/PARTIAL。

### VOLTGUI-004 Task Contract

- 目标：将桌面自动发布链路从“CNB 打 tag + GitHub Actions 构建”迁移为 CNB 直接构建并上传 Windows amd64 桌面安装包。
- 非目标：不发布 macOS/Linux 产物、不恢复 CLI/npm 发布、不引入 GitHub tag 同步、不提交 secrets、不实际触发远端发布。
- 验收标准：`.cnb.yml` 在 `feat:/fix:` 提交时计算 `desktop-v*` 版本，安装 Windows 交叉构建依赖，运行 `scripts/desktop-build.sh windows/amd64`，签名并生成 CNB 下载地址 manifest，上传 CNB Release 资产；macOS/Linux 目标仅注释保留；旧 GitHub desktop release workflow 移除。
- 相关 skill：`cnb-ci-cd`、`cicd-release-management`、`typescript`；Desktop/Wails 按项目本地覆盖规则执行。
- 代码规范：遵循现有 Wails nested module 和发布脚本结构；发布工具不输出 secrets；manifest URL 通过环境变量注入，保留 GitHub fallback 兼容测试。
- 风险：CNB Release 上传 API 若字段漂移会导致资产上传失败；Windows 安装器是交叉编译产物，需要远端 CNB 首次运行验证；macOS/Linux 暂不发布可能影响非 Windows 用户更新提示。
- 回滚方案：还原 `.cnb.yml`、`.github/workflows/release-desktop.yml`、`desktop/cmd/sign`、`desktop/updater*`、`desktop/frontend/src/lib/bridge.ts`、`scripts/desktop-build.sh`、相关文档与 skill 说明。
- 验证计划：`go test ./cmd/cnbrelease ./cmd/sign ./internal/update`、`go test . -run TestEvaluate`、`go run ./cmd/cnbrelease --dry-run ...`、`.cnb.yml` YAML 解析、`git diff --check`。

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

- 目标：在最新 `origin/main` 基础上重新同步通用 `references/skills/` 与 XGIC 私有 `.voltui/skills/`，新增共享/私有 manifest 和 `scripts/check-skills-sync.mjs`，补回行业深度优化建议。
- 非目标：不修改 VoltUI 技能运行时代码、不引入客户原始数据、不写入 secrets、不部署、不调整 CI 分支策略。
- 验收标准：通用 skills manifest 与 `references/skills/*/SKILL.md` 一致；私有 manifest 与 29 个 `.voltui/skills/*/SKILL.md` 一致；`references/private-skills/INDEX.md` 与 `DEEP_OPTIMIZATION.md` 存在；项目 overlay 优先加载私有技能。
- 相关 skill：`skill-creator`、`agent-team-automation`、`semiconductor-ate-test-plan`、`semiconductor-test-program-review`、`semiconductor-yield-spc`、`semiconductor-failure-analysis`。
- 风险：远端 `main` 曾 forced update，必须基于最新 `origin/main` 重新提交，避免推回旧历史；`.voltui/*` 默认忽略，需显式放行 `.voltui/skills/**`。
- 回滚方案：删除 `.voltui/skills/`、`references/private-skills/`、`references/skills/agent-team-skills-manifest.json`、`references/skills/SYNC.md`、`scripts/check-skills-sync.mjs`，还原 `.agents/AGENTS.local.md`、`.gitignore`、`tasks.md`、`progress.md`。
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
