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
| ANYONG-VLLM-TOOLS-20260710 | local | aizhuliren/xgic/anyong-agent | user-request | 修复 9010 网关后 Qwen vLLM 自动工具调用 400 | high | high | done | codex | gpt-5.3-codex | gpt-5.5 | review-high | main | - |
| ANYONG-CHAT-OUTPUT-20260710 | local | aizhuliren/xgic/anyong-agent | user-request | 诊断暗涌桌面对话重复输出与工具调用报错 | high | medium | done | codex | gpt-5.3-codex | - | review-medium | main | - |
| ANYONG-RUNTIME-BRAND-20260710 | local | aizhuliren/xgic/anyong-agent | user-request | 修复暗涌发行版运行时仍自称 Volt/VoltUI | high | medium | done | codex | gpt-5.3-codex | - | review-medium | main | - |
| ANYONG-SYNC-20260710-3 | local | aizhuliren/xgic/anyong-agent | user-request | 合并 fresh GitHub upstream/main 并保护未提交 OEM 品牌修复 | high | medium | done | codex | gpt-5.3-codex | - | review-medium | main | - |
| ANYONG-PUSH-20260710 | local | aizhuliren/xgic/anyong-agent | user-request | 提交并 push upstream merge 与 OEM 运行时品牌修复 | high | high | done | codex | gpt-5.3-codex | - | review-high | main | - |
| ANYONG-RELEASE-20260710-4 | local | aizhuliren/xgic/anyong-agent | user-request | 发布包含 upstream 离线工作台与 OEM 运行时品牌默认的 Windows 新版 | high | high | running | codex | gpt-5.3-codex | gpt-5.5 | review-high | main | - |

### ANYONG-RELEASE-20260710-4 Task Contract

- 目标：基于 live CNB `main=3c95bdab` 和已发布 `desktop-v0.8.1`，以补丁版发布已合并的 upstream workbench/Office/Coreutils 更新以及 OEM 运行时品牌默认，由 CNB 构建并发布 Windows amd64 Anyong 安装包、便携包和 `latest.json`。
- 非目标：不发布 macOS/Linux/CLI，不改仓库可见性，不硬编码产品名到通用源码，不重写/force push `main`，不覆盖或重用旧 tag，不输出 CNB/Git/签名/OEM 网关 secret。
- 验收标准：fresh live `main` 与本地一致，最新 tag 为 `desktop-v0.8.1@d9eee8b7`；`fix(desktop): release OEM runtime branding update` 最终 trigger commit 计算为 `desktop-v0.8.2`；发布前主进程与独立 candidate verifier 通过；push 后 CNB 快速验证与 release pipeline 成功；live tag `desktop-v0.8.2` 指向 trigger commit；Release 存在且包含 `Anyong-windows-amd64-installer.exe`、`Anyong-windows-amd64.zip`、`latest.json`；manifest 的 `version`、canonical installer URL、size、SHA-256 与实际资产一致；真实 zip 包含 `Anyong.exe`、update helper、computer-use MCP server、Windows N-API addon、bundled Bun、Coreutils 安装资源，且可执行文件携带 OEM 中文品牌默认；独立 live verifier PASS。
- 协作模式：`pipeline`。explorer 只读审计版本、触发、产物、鉴权和回滚；candidate verifier 独立复核本地发布候选；production commit/push/tag/release 由 orchestrator 主进程与 CNB CI 执行，不委派 secret/不可逆写入；live verifier 独立下载并校验发布资产；orchestrator 最终裁决。
- 相关 skill：`agent-team-delegation-gate`、`agent-team-automation`、`cnb-ci-cd`、`cicd-release-management`、`anyong-brand-config`、`xigu-ai-ops`；遵循现有 Go/Wails/CNB Windows-only 技术栈、Conventional Commits、BrandConfig/OEM build default 与 `DESKTOP_APP_NAME=Anyong` 命名边界。
- Stack/Deployment Profile：既有 Go CLI + Wails v2 desktop + Svelte frontend；发布目标为 CNB Linux Docker runner 交叉构建 Windows amd64 Wails/NSIS，并通过 CNB Release API 上传私有资产。决策来源为 `.agents/AGENTS.local.md`、`.cnb.yml`、`references/skills/cnb-ci-cd/SKILL.md`；本轮不选择新栈/数据库/托管平台。
- 发布序列：先将本 Task Contract 形成 `chore: prepare desktop v0.8.2 release [skip-release]` 本地提交，再创建空 `fix(desktop): release OEM runtime branding update` trigger commit，一次 fast-forward push 以确保最终 HEAD 消息触发 patch release；发布完成后用 `[skip-release]` 协作收尾提交记录 live 证据。
- 风险：high，涉及远程 `main`、自动 tag/Release、签名私钥、OEM 网关 sidecar、Windows 原生 N-API/Bun/Coreutils 资源和私有下载鉴权；CNB 构建中任一依赖/网络/签名/API 失败都可能产生部分发布状态。
- Secrets Strategy：Git 仅用一次性 macOS Keychain helper reset；CNB token、minisign key/password、`XIGU_API_KEY` 只由 CI secret 注入；远程 API/资产验证仅使用内存中的 Keychain 凭据并只输出状态/元数据，不显示 secret 值，不读取 `bundled.env` 内容。
- 回滚：push 前任何门禁失败则停止；trigger push 后若尚未生成 tag，以同一 `main` 上的普通 `fix:` follow-up 修复并发布下一 patch；若 tag/Release 已部分生成，不强推/重写 tag，优先用新 patch 修复，仅在明确证据支持且必要时通过 CNB 管理面撤下错误 Release。
- 验证计划：fresh local/tracking/live refs 与 tag/release 基线；root/desktop Go test+vet、brand/linker 专项、Coreutils/Bun/computer-use stage 脚本测试、frontend check/build、YAML/shell/Node 语法、manifest/release tools 测试、secret scan；candidate verifier；push 后持续读取 CNB build/tag/Release，下载 `latest.json`、installer 和 zip 完成 size/SHA-256/内容/OEM 品牌验证；live verifier。
- context_isolation：explorer 写 `.mailbox/045-release-explorer-result.md`；candidate verifier 写 `.mailbox/046-release-candidate-verifier-result.md`；live verifier 写 `.mailbox/047-release-live-verifier-result.md`；不向子代理传递凭据值，产物证据以文件路径+哈希/元数据交付。
- interruption_recovery：子代理或 CNB 构建超时时，`last_stable_artifact` 为 Task Contract、candidate commit、push porcelain、live tag/Release JSON、已下载资产哈希；子代理可重派一次，不切换 Claude/WorkBuddy；持续无 live 发布证据则保持 running/PARTIAL，不声称完成。

### ANYONG-PUSH-20260710 Task Contract

- 目标：将已验证的 upstream merge `b556405d` 与当前 OEM 运行时品牌修复/协作记录形成一个明确提交，push 到 CNB `origin/main`，并以 live remote ref 验证成功。
- 非目标：不触发或创建新 `desktop-v*` Release，不部署/发布安装包，不改写业务实现，不提交 mailbox/运行态文件，不暴露或写入 token，不 force push。
- 验收标准：fresh remote `main` 在 push 前仍为 `6ac16313`；暂存范围恰好为 `desktop/windows_update_handoff_test.go`、`internal/config/brand_test.go`、`internal/config/config.go`、`scripts/desktop-build.sh`、`tasks.md`、`progress.md`；提交信息为 `fix(desktop): embed OEM runtime brand default [skip-release]`；push 后 live `refs/heads/main` 等于本地 HEAD，合并提交和 brand 提交均在远程历史中；`[skip-release]` 被 `.cnb.yml` 明确识别，本轮不生成新发布 tag。
- 协作模式：`pipeline`。explorer 只读审计提交范围、release-skip 逻辑、remote 分歧和鉴权恢复方案；commit/push 属外部写入，由 orchestrator 主进程执行；verifier 独立复核 local/remote refs、commit 内容和无新 release tag；orchestrator 最终裁决。
- 预计文件：仅上述六个已验证 dirty 文件进入新提交；已有 merge `b556405d` 与其 upstream 祖先随 push 发布到 remote history。
- 相关 skill：`agent-team-delegation-gate`、`agent-team-automation`、`cnb-ci-cd`、`anyong-brand-config`、`xigu-ai-ops`；提交遵循 Conventional Commits、配置优先和上游通用性约定。本轮不编辑/分析 `.svelte`，不激活 Svelte 编写 skill。
- 风险：high，涉及 CNB 远程 `main` 外部写入和每次 push 的 CI；当前 `origin` URL 带 `cnb@` 会命中过期凭据并伪装成 `Repository Not Found`，而 macOS Keychain 的 host-only 凭据已证明可读 remote。
- 鉴权策略：仅将本地 `origin` URL 从带用户名的 `https://cnb@cnb.cool/...` 调整为无 userinfo 的 `https://cnb.cool/...`，使 Git 命中 Keychain host-only 凭据；不读取/输出 token 值，不修改远程仓库权限。
- 回滚：push 前任何门禁失败则停止；push 后如需回退产品改动，以普通 revert 提交撤销，不重写历史；本地 remote URL 可恢复为原值，但不恢复失效凭据。
- 验证计划：Keychain-only `ls-remote/fetch`、remote ahead/behind；提交前 `git diff --check`、root/desktop Go 测试与 vet、brand 专项、Coreutils Node、frontend check/build 证据；精确 staged-file 清单与 secret 扫描；push 后 `ls-remote origin refs/heads/main`、commit range/tag 复核和独立 verifier。
- context_isolation：explorer 将结果写入 `.mailbox/042-push-explorer-result.md`；verifier 只读 final local/remote 状态并写 `.mailbox/043-push-verifier-result.md`；子代理不接收凭据内容，不执行 push。
- interruption_recovery：若 explorer/verifier 超时，保留 mailbox error；`last_stable_artifact` 为 Task Contract、本地 commit、push porcelain/live ref 输出；orchestrator 可重派一次，不切换 Claude/WorkBuddy，缺 verifier 时不声称完成。
- completion_evidence：explorer `.mailbox/042-push-explorer-result.md` PASS；产品/协作提交 `93230f6cf8c40f0e74cc6f652d4b7904a846e80a` 以 fast-forward 推送到 live CNB `main`；独立 verifier `.mailbox/043-push-verifier-result.md` PASS，local/tracking/live ref 一致，merge `b556405d` 与 upstream `909fbc9f` 均为远程祖先；六文件范围、测试、secret scan 和 `[skip-release]` 通过，live 最新 tag 仍为 `desktop-v0.8.1@d9eee8b7`；保护 stash 未删除。

### ANYONG-SYNC-20260710-3 Task Contract

- 目标：在 fresh fetch `git@github.com:zuohuadong/volt-gui.git` 后，将 `upstream/main` 的新增提交合并到本地 `main`，同时原样保护当前未提交的 OEM 运行时品牌修复和协作记录。
- 非目标：不提交、不 push、不发布；不运行会 `git add -A` / force push 的旧同步脚本；不借合并改写已完成但未提交的品牌实现。
- 验收标准：fresh `upstream/main` 成为本地 `main` 祖先；无未解决冲突或冲突标记；合并前六个未提交文件的改动在合并后仍存在且语义不变；品牌仍通过 BrandConfig/OEM build default 配置实现；按 upstream 实际变更范围运行真实验证，并获得独立 verifier 证据。
- 协作模式：`pipeline`。explorer 只读审计 fresh delta、merge-tree 冲突面和本地改动保护点；executor 在隔离 worktree 中完成 merge 及必要的 union 解决；verifier 独立复核合并历史、本地 diff 恢复和测试；orchestrator 最终裁决。
- 预计影响：Git 历史、upstream 实际增量文件；不主动修改产品文件。当前未提交保护集为 `desktop/windows_update_handoff_test.go`、`internal/config/brand_test.go`、`internal/config/config.go`、`scripts/desktop-build.sh`、`tasks.md`、`progress.md`。
- 相关 skill：`agent-team-delegation-gate`、`agent-team-automation`、`anyong-brand-config`、`xigu-ai-ops`；按项目 Go/Wails/Astro 边界和上游优先约定执行。本轮若仅合并既有 `.svelte` 提交而不手工编辑，不激活 Svelte 编写 skill。
- 风险：medium，upstream 可能与 OEM 品牌默认、桌面构建或发布覆盖同文件；当前工作树不干净，直接 merge 可能覆盖或混入未提交工作。
- 回滚：用命名 stash 和隔离 sync worktree 保护本地改动；merge 未完成时可 abort/删除临时 worktree；merge 提交已进入 `main` 后如需回退，只用普通 revert，不 reset/force push。
- 验证计划：`git fetch upstream`、ahead/behind 与 commit 审计、`git merge-tree`、`git diff --check`、冲突标记扫描；按变更范围运行 root/desktop/frontend/site 窄门禁；比对 stash 前后本地 diff；独立 verifier 给出 PASS/FAIL/PARTIAL。
- context_isolation：所有子代理 isolated；explorer 将结果写入 `.mailbox/039-upstream-explorer-result.md`；executor 仅读取 Task Contract/explorer mailbox 并只写隔离 worktree；verifier 只读最终仓库与命名 stash 证据。
- interruption_recovery：原生 executor 已完成预期 `App.svelte` 冲突 union 但未写 mailbox/提交即停滞；orchestrator 中断后以该已暂存 merge 为 `last_stable_artifact`，重做全部门禁、创建 `b556405d`、快进 `main` 并恢复 stash。失败记录为 `.mailbox/040-upstream-executor-result.md`，独立 verifier `.mailbox/041-upstream-verifier-result.md` 最终 PASS；未切换 Claude/WorkBuddy。
- completion_evidence：explorer `.mailbox/039-upstream-explorer-result.md`；merge `b556405d15f9b7de7a5e103d61bc3dda074cd47f`；`upstream/main=909fbc9f` 已为 `main` 祖先且 marker 一致；root/desktop `go test ./...` 与 `go vet ./...`、Coreutils Node 5/5、frontend check/build、brand 专项、shell 语法和 `git diff --check` 通过；六个 dirty 文件恢复，保护 stash `255991ae` 仍保留，未 push/未发布。

### ANYONG-RUNTIME-BRAND-20260710 Task Contract

- 目标：让使用 `VOLTUI_BRAND_NAME="西谷智灯暗涌系统"` 构建的桌面发行版在没有安装机环境变量、且用户未显式配置 `[brand]` 时，运行时 `BrandName()`、系统提示词和助手自我介绍仍使用西谷智灯暗涌系统，不再回退或自行引入 `Volt` / `VoltUI`。
- 非目标：不把西谷智灯暗涌系统硬编码进通用 Go/Svelte 产品逻辑；不修改模型服务、9010 路由、BrandConfig 用户覆盖能力、安装包文件名前缀或现有 UI 视觉品牌；本轮不发布、不提交、不 push。
- 验收标准：先有失败测试证明当前 build-time 品牌不会成为运行时默认；实现后满足 `进程环境变量 > 用户 [brand] 配置 > OEM 构建默认 > VoltUI`；默认系统提示词包含 OEM 品牌且不含 `You are VoltUI`；桌面构建脚本安全注入含中文/空格的品牌 linker value；品牌未配置时 upstream 行为仍为 VoltUI；有测试防止模型使用未配置旧昵称。
- 协作模式：`pipeline`。explorer 只读确认最小通用设计和 linker/提示词边界；executor 独占允许文件执行 red-green-refactor；verifier 独立检查 diff、测试和打包命令；orchestrator 最终裁决。
- 预计文件：`internal/config/config.go`、`internal/config/brand_test.go`、`scripts/desktop-build.sh`、桌面构建脚本专项测试；如需通用身份提示，仅限 `internal/boot/boot.go` 及其测试。不得修改 `.cnb.yml` 中现有品牌值或前端硬编码。
- 相关 skill：`agent-team-delegation-gate`、`agent-team-tdd`、`agent-team-automation`、`anyong-brand-config`；遵循 Go `gofmt`、最小 diff、配置优先、上游通用能力优先。未涉及 `.svelte` 编辑，因此禁用 `svelte-code-writer` / `svelte-core-bestpractices`。
- 风险：medium，改动影响所有 OEM 白标发行版的默认品牌和系统提示词；linker quoting 错误可能导致构建失败，优先级错误可能覆盖用户自定义品牌。
- 回滚：移除 OEM 默认变量及 `desktop-build.sh` linker 注入即可恢复当前 VoltUI fallback；不迁移或改写用户配置。
- 验证计划：TDD red/green 覆盖 OEM 默认、env/config 覆盖、未配置 fallback、系统提示词身份；`go test ./internal/config`、必要的 `go test ./internal/boot`、`cd desktop && go test .`、shell/脚本专项测试、含中文空格 linker smoke、`bash -n scripts/desktop-build.sh`、`git diff --check`。
- context_isolation：所有子代理 isolated；explorer 通过 `.mailbox/036-runtime-brand-explorer-result.md` 交付设计；executor 仅读取该 mailbox 与 Task Contract；verifier 只读当前 diff和验证输出。
- interruption_recovery：若子代理超时，`last_stable_artifact` 为 Task Contract、已有品牌测试和对应 mailbox error；Codex CLI 已在上一任务出现启动超时，因此优先使用当前 Codex 原生子代理，不切换 Claude/WorkBuddy；失败时由 orchestrator 重派一次或标记 PARTIAL。

### ANYONG-CHAT-OUTPUT-20260710 Task Contract

- 目标：基于用户截图，定位“自动工具调用 400 提示仍可见”以及助手将同一自我介绍近乎完整重复两遍的真实产生层，区分历史错误提示、模型原始输出、OpenAI 兼容流解析、Agent 事件汇聚和 Svelte Transcript 渲染问题。
- 非目标：本轮诊断阶段不修改产品源码、不重启或改写生产服务、不变更 9010 路由/鉴权/模型映射，也不把模型重复简单归因于截图或用户操作。
- 验收标准：形成可复现或可证伪的最小反馈环；列出并逐一检验 3-5 个假设；给出截图证据、相关 file:line、可用的真实 9010/本地测试证据；确认根因或明确剩余唯一缺失的运行时证据；产出后续 TDD 回归 seam。
- 协作模式：`pipeline`。orchestrator 负责截图解读、现有任务/运行时证据核对和最终裁决；explorer 只读检查 provider -> agent event -> desktop transcript 链路并提交 mailbox；如确认需要修复，再另行进入 `agent-team-tdd` executor -> verifier。
- 相关 skill：`agent-team-delegation-gate`、`agent-team-diagnose`、`agent-team-automation`、`xigu-ai-ops`；遵循 Go/Wails/Svelte 既有边界与上游优先原则。诊断若需要改动 `.svelte`，后续必须加载 `svelte-code-writer` 和 `svelte-core-bestpractices`。
- 风险：medium，症状同时覆盖模型服务和用户可见桌面对话；仅凭截图可能混淆旧 400 提示与修复后的新响应，错误归因会导致无效客户端补丁。
- 回滚：本轮只读诊断无产品回滚；协调记录可按任务状态归档。临时诊断产物必须放在非产品路径并在结论前清理或明确标记。
- 验证计划：检查当前 live 9010 能力与既有 VLLM 修复状态；用截图中的最小问句和工具请求分别验证无工具/有工具流；对照 OpenAI SSE 原始文本、Agent `event.Text`/`event.Message`、持久化 History 与 `mergeStreamingText`；运行相关 Go/前端窄测试或只读 harness。
- context_isolation：explorer 使用 isolated context，仅共享截图路径、Task Contract、仓库路径和允许读取的 provider/agent/desktop/frontend 文件。
- interruption_recovery：explorer 超时或输出不完整时读取 `.mailbox/035-chat-output-explorer-result.md` 的 error evidence；以当前截图、既有 `ANYONG-VLLM-TOOLS-20260710` live 记录和主进程复现结果为 last_stable_artifact，必要时重派一次，否则标记 PARTIAL。

### ANYONG-VLLM-TOOLS-20260710 Task Contract

- 目标：保持桌面端与默认 provider 继续请求 `http://192.168.1.47:9010/v1` GoModel 网关，修复其后 `vllm-qwen36-gpu4.service` / `vllm-qwen36-gpu5.service` 因未启用自动工具解析而对 Volt Agent `tools` 请求返回 HTTP 400 的运行时故障。
- 非目标：不把桌面端改为直连 8001/8005；不绕过 GoModel 鉴权、别名和路由；不使用 `tool_choice=none` 静默禁用工具；不修改 GLM、图像模型、GoModel 数据库或仓库产品源码。
- 验收标准：修复前通过 9010 复现精确错误；两个 Qwen unit 均启用 `--enable-auto-tool-choice` 和与现有 XML tool template 匹配的 parser；服务重启后 active/healthy；8001、8005 以及带鉴权的 9010 请求不再返回该 400；至少一个经 9010 的工具请求产生有效 completion/tool-call 响应；原 unit 有可用备份和明确回滚命令。
- 协作模式：`pipeline`。explorer 只读审计 parser、路由和回滚；生产服务器备份、编辑、重启由 orchestrator 主进程执行；独立 verifier 只读复核 live 服务与 9010 行为。
- 相关 skill：`agent-team-delegation-gate`、`agent-team-tdd`、`xigu-ai-ops`；沿用项目 Go/Wails/Volt 上游一致性原则，运行时配置优先，不在 fork 中私有特判。
- 风险：high，涉及正在提供内部模型能力的 GPU4/GPU5 systemd 服务；重启会产生短暂不可用，错误 parser 可能导致文本可生成但工具调用无法结构化。
- 回滚：修改前复制两个 unit 为带时间戳的 root-only 备份；任一服务启动/健康/工具 smoke 失败时恢复对应备份，执行 `systemctl daemon-reload` 并重启；不修改 9010 GoModel 服务和路由。
- 验证计划：TDD red 为当前 9010 function-tool 请求的精确 400；green 为 8001/8005 与 9010 的 HTTP/JSON/SSE smoke、systemd active 状态和日志无 parser 启动错误；最后由独立 verifier 复核，仓库运行态记录经 `git diff --check` 检查。

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
