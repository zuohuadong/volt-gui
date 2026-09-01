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
| ANYONG-AI-ELEMENTS-COMPOSER-DECOMPOSE-20260901 | npm/cnb | aizhuliren/xgic/anyong-agent | user-request | 将自研 Composer 拆解迁移到 PromptInput 官方复合组件族 | high | medium | done | codex | gpt-5.6 | - | review-medium | codex/decompose-ai-elements-composer | https://cnb.cool/aizhuliren/xgic/anyong-agent/-/pull/218 |
| ANYONG-AI-ELEMENTS-RELEASE-20260901 | cnb | aizhuliren/xgic/anyong-agent | user-request | 发布 ai-elements 0.2.0 迁移后的 Windows x64 新版 | high | high | blocked | codex | gpt-5.6 | - | review-high | codex/release-run-v0.31.15 | - |
| ANYONG-CNB-ATOMIC-RELEASE-20260901 | cnb | aizhuliren/xgic/anyong-agent | user-request | 修复 CNB Release 原子性并恢复 v0.31.15 发布 | high | high | blocked | codex | gpt-5.6 | - | review-high | main | - |
| ANYONG-CNB-ZIP-ASSEMBLY-FOLLOWUP-20260901 | cnb | aizhuliren/xgic/anyong-agent | cnb-um8-1k1dtriqj | 修复 CNB PowerShell ZIP 检查并发布 v0.31.16 | high | high | blocked | codex | gpt-5.6 | - | review-high | main | - |
| ANYONG-CNB-DRAFT-STATE-FOLLOWUP-20260901 | cnb | aizhuliren/xgic/anyong-agent | cnb-sig-1k1duoes8 | 兼容 CNB 草稿状态与 204 清理并发布 v0.31.17 | high | high | running | codex | gpt-5.6 | - | review-high | main | - |
| ANYONG-AI-ELEMENTS-FULL-COVERAGE-20260901 | npm/cnb | aizhuliren/xgic/anyong-agent | https://www.npmjs.com/package/@svadmin/ai-elements | 完整接入 AI Elements 对话交互与结构化输出组件 | high | medium | done | codex | gpt-5.6 | - | review-medium | codex/complete-ai-elements-coverage | https://cnb.cool/aizhuliren/xgic/anyong-agent/-/pull/217 |
| ANYONG-AI-ELEMENTS-MIGRATION-20260901 | npm/cnb | aizhuliren/xgic/anyong-agent | https://www.npmjs.com/package/@svadmin/ai-elements | 迁移桌面对话到已发布的 SVAdmin AI Elements | high | medium | done | codex | gpt-5.6 | - | review-medium | codex/migrate-svadmin-ai-elements | https://cnb.cool/aizhuliren/xgic/anyong-agent/-/pull/216 |
| ANYONG-CNB-ISSUES-211-215-20260831 | cnb | aizhuliren/xgic/anyong-agent | https://cnb.cool/aizhuliren/xgic/anyong-agent/-/issues | 修复并关闭全部开放 CNB issues #211-#215 | high | medium | done | codex | gpt-5.6 | - | review-medium | codex/fix-cnb-issues-211-215 | - |
| VOLTGUI-PR103-ELECTRON-FOLLOWUP-20260824 | github | zuohuadong/volt-gui | https://github.com/zuohuadong/volt-gui/pull/103 | 完成 Electron + DSH 上游迁移并永久退役 Wails | high | high | review | codex | gpt-5.6 | - | review-high | codex/electron-dsh-upstream-migration | https://github.com/zuohuadong/volt-gui/pull/103 |

### ANYONG-AI-ELEMENTS-RELEASE-20260901 Task Contract

- parent：`ANYONG-AI-ELEMENTS-COMPOSER-DECOMPOSE-20260901`；source：用户要求合并 PR 后发布新版；reason：CNB PR #218 已合并，需通过既有 tag pipeline 生成可审查的 Windows x64 新版产物。
- 目标：以当前 Anyong 发布线最新 `v0.31.14` 为基线，在最终绿色 `origin/main` 上创建并推送 `v0.31.15`，等待 CNB tag pipeline 完成，并核验 Release、installer、portable ZIP、大小、SHA-256 与未签名状态。
- 非目标：不修改产品代码或已提交 package 版本；不发布 macOS/Linux/CLI；不签名、不启用 updater 或生产部署；不移动/覆盖既有 tag；不使用 GitHub 手动 unsigned-review workflow 代替 CNB 正式 tag pipeline。
- 验收标准：发布前 Node 26.8.1 / pnpm 12.1.0 本地门禁与最终 `main` CNB pipeline 通过；远端 tag `v0.31.15` 精确指向候选 SHA；tag pipeline 的 environment/install/verify/set version/package/create release/两个上传阶段全部成功；Release 非 draft/prerelease、latest=true，包含 `anyong-windows-x64-installer-0.31.15.exe` 与 `anyong-windows-x64-portable-0.31.15.zip`；下载后 SHA-256、大小和 ZIP 完整性可复核，installer Authenticode 为 `NotSigned`。
- orchestration.mode：`panel`，risk=high。主代理唯一执行远端 tag/Release 写入；三名只读 reviewer 分别覆盖 ai-elements 候选、发布契约和发布安全，任一阻断不推 tag；live 结果再次独立复核。
- 相关 skill：`xigu-ai-ops`、`cnb-ci-cd`、`electron-desktop`、`typescript-development`、`agent-team-automation`、`provider-adapter`；保持官方 DSH 单一运行时与 Windows x64 未签名评审产物边界。
- 风险与回滚：CNB self-hosted runner 当前曾因 workspace 数量上限在 Prepare 阶段失败；先通过本 Task Contract 的普通 main push 重试，CI 不绿则保持 blocked。tag 推送后不重写 tag；构建失败通过明确 follow-up 修复并发布下一 patch，错误 Release 仅通过 CNB 管理撤回。
- interruption_recovery：稳定基线 `origin/main@2716cd82d57d294b593d78c2f2dca99c512aaf35`、最新正式 Release `v0.31.14`、目标 `v0.31.15`；任何版本或产物范围变化需用户确认。

### ANYONG-CNB-ATOMIC-RELEASE-20260901 Task Contract

- parent：`ANYONG-AI-ELEMENTS-RELEASE-20260901`；source：用户在 Release 页面未看到新版后明确要求“修复”；reason：旧 CNB tag pipeline 在资产上传前创建正式 latest Release，且缺少签名、哈希和 ZIP 完整性门禁。
- 目标：将 CNB 发布改为草稿创建、两资产上传/verify、API 回读 hash/size、最后 PATCH 为 latest 的原子流程；失败后仅删除 CNB 明确确认仍属于本轮的草稿，状态不明或已发布时保留现场并继续核验；打包阶段验证 Authenticode `NotSigned`、SHA-256、ZIP 非空且包含 `Anyong.exe`；通过后恢复并完成 `v0.31.15` 发布。
- 非目标：不引入签名、updater、macOS/Linux、生产部署或第二套打包链；不覆盖已有 tag 或已发布 Release；对同 tag 的陈旧 draft 允许先删除再按原子流程重建；不持久化 CNB 凭据；不修改应用业务行为。
- 验收标准：mock 测试证明成功路径只在两资产验证后发布、失败路径删除草稿；CI/workflow、核心、DSH integration、build、migration 和 diff 门禁通过；main 精确候选流水线全绿；tag pipeline 全阶段成功；live `v0.31.15` tag 精确指向候选，Release 非 draft/prerelease、latest=true、仅含两项资产，API hash/size 与真实下载一致，ZIP 完整，installer 为 `NotSigned`。
- orchestration.mode：`panel`，risk=high。主代理唯一 writer 和远端执行者；候选实现、发布契约和 live 安全由三名只读 reviewer 独立复核，任一阻断不推 tag。
- 相关 skill：`cnb-ci-cd`、`cicd-release-management`、`xigu-ai-ops`、`electron-desktop`、`typescript`、`agent-team-automation`、`provider-adapter`。
- 风险与回滚：创建草稿后上传失败会先回读 CNB 状态，仅确认同 ID 且仍为 draft 时删除；状态无法确认时不做破坏性清理。tag 不重写，若 tag pipeline 失败则保留 tag 并以明确 follow-up 修复，不创建不完整正式 Release；代码回滚使用普通 revert。

### ANYONG-CNB-ZIP-ASSEMBLY-FOLLOWUP-20260901 Task Contract

- parent：`ANYONG-CNB-ATOMIC-RELEASE-20260901`；source：CNB tag pipeline `cnb-um8-1k1dtriqj`；reason：`v0.31.15` 打包已生成两项产物，但 Windows PowerShell 未自动加载 `System.IO.Compression.ZipFile`，package 阶段失败且 publish 阶段跳过。
- 目标：在 `.cnb.yml` 显式加载 `System.IO.Compression.FileSystem`，验证 ZIP 完整性门禁可运行；保持失败的 `v0.31.15` tag 不变，在修复后的绿色 main 候选上发布下一 patch `v0.31.16`。
- 非目标：不移动、删除或覆盖 `v0.31.15`；不绕过 ZIP 全量读取、Authenticode、hash/size、草稿原子发布或 live 下载验收；不引入签名、updater、其他平台或生产部署。
- 验收标准：workflow 回归测试锁定程序集加载；本地发布/workflow 与 diff 门禁通过；修复提交的 main pipeline 全绿；远端 `v0.31.16` 创建前不存在；tag pipeline 全阶段成功；Release 与真实资产通过状态、size、SHA-256、ZIP 全量读取、`Anyong.exe`、installer `NotSigned` 验收。
- orchestration.mode：`panel`，risk=high。主代理唯一 writer 和远端执行者；复用原子实现、契约和安全 reviewer 对 follow-up diff 与 live 结果复核。
- 风险与回滚：失败 tag 永不重写；若 `v0.31.16` 仍失败则保持现场并创建新的明确 follow-up，不以手工 Release 绕过流水线；代码回滚使用普通 revert。

### ANYONG-CNB-DRAFT-STATE-FOLLOWUP-20260901 Task Contract

- parent：`ANYONG-CNB-ZIP-ASSEMBLY-FOLLOWUP-20260901`；source：CNB tag pipeline `cnb-sig-1k1duoes8`；reason：CNB 草稿回读为 `draft=true,is_latest=true`，且删除草稿成功返回 HTTP 204，脚本原有判断与状态码不兼容导致 publish 失败。
- 目标：草稿校验仅要求 `draft=true` 且非 prerelease，删除接口接受 200/204；保持 `v0.31.15`、`v0.31.16` 不变，在修复后的绿色 main 候选上发布 `v0.31.17`。
- 非目标：不移动、删除或覆盖既有失败 tag；不绕过两资产上传/verify、API hash/size、ZIP/NotSigned 或 draft 原子发布门禁。
- 验收标准：回归测试覆盖草稿 `is_latest=true` 和 DELETE 204；修复提交 main pipeline 全绿；远端 `v0.31.17` 不存在后创建；tag pipeline 与 live Release/真实下载验收全部通过。
- orchestration.mode：`panel`，risk=high。主代理唯一 writer/远端执行者；三名 reviewer 复核 follow-up diff 与 live 结果。
- 风险与回滚：失败 tag 保持不变；若 `v0.31.17` 失败则不重写，保留 CNB 草稿/Release 现场并继续新 follow-up。

### ANYONG-AI-ELEMENTS-COMPOSER-DECOMPOSE-20260901 Task Contract

- parent：`ANYONG-AI-ELEMENTS-FULL-COVERAGE-20260901`；source：用户给出 SVAdmin 官方组件对应清单并要求拆解实施；reason：当前 `App.svelte` 仅用 `PromptInput` 包裹旧 `ReferencePicker`、附件、权限与发送工具栏，尚未采用官方内部复合结构。
- 目标：使用 `PromptInputHeader`、`PromptInputBody`、`PromptInputTextarea`、`PromptInputCommand...`、`PromptInputFooter`、`PromptInputTools`、`PromptInputActionAddAttachments`、`PromptInputSelect...` 和 `PromptInputSubmit` 组成真实 Composer；模型、文件/会话引用、图片附件、权限、发送和停止仍调用现有官方 DSH API。
- 非目标：不引入未安装的 `@svadmin/lite`；不建立新的权限/附件/引用/会话后端；不修改 DSH、Electron 主进程或持久化；不伪造文件、会话、权限、模型或 Surface 数据；本轮不自动提交、推送或创建 PR。
- 验收标准：Composer 内部不再使用自研 textarea、隐藏 file input、原生 permission select 或自研发送/停止按钮；`@` 文件/会话候选仍来自 DSH；图片仍转换为 DSH image prompt；模型仍调用 `selectModel`，权限仍调用官方 `/permission`，提交/停止行为和禁用条件保持；既有 Confirmation/Question、ConversationEmptyState、消息/Token/思考、活动计划和 `SurfaceRenderer` 接入不回退。
- orchestration.mode：`managed`，risk=medium。主代理唯一 writer；完成后复用既有只读 verifier 检查官方组件真实性、Svelte API 和 DSH 边界。
- 相关 skill：`svelte-development`、`typescript`、`svelte-code-writer`、`svelte-core-bestpractices`、`volt-gui-design-language`、`agent-team-automation`；遵循 Svelte 5 runes、官方组件导出和 DSH 单一运行时边界。
- 影响范围：`apps/desktop-frontend/src/App.svelte`、Composer/引用/权限/附件相关组件、`src/app.css`、聚焦纯函数测试和任务记录；允许删除被完整替代且无引用的自研组件。
- 验证计划：官方组件导出静态审计；Svelte autofixer；前端 Vitest、`svelte-check`、Vite production build；根测试、DSH integration、Electron/migration boundary；`git diff --check`；必要时桌面宽/窄屏渲染 smoke。
- 风险与回滚：官方附件状态与 DSH base64 图片模型不同，需在提交边界显式转换；Command 组件只负责交互外壳，候选检索仍需竞态保护；权限和模型选择失败继续走现有 notice/error。回滚使用普通 revert/follow-up，不改写历史。
- interruption_recovery：稳定恢复点为 `main@517990a9a`、分支 `codex/decompose-ai-elements-composer`、本合同及后续验证输出；范围变化必须追加 follow-up 或用户确认。
- continuation：用户于 2026-09-01 明确要求升级到 `@svadmin/ai-elements@0.2.0`、使用新版特性和组件，并延续此前提交及合并 PR 的指令；因此本轮获准精确升级配套 `@svadmin/core@0.48.0`、`@svadmin/ui@0.67.0`、`@svadmin/surface@0.8.0`，提交、推送、创建 ready PR，并在远端 CI 与独立审查通过后合并。
- completion_evidence：Node 26.8.1 / pnpm 12.1.0 下前端 Vitest 40/40、`svelte-check`、Vite production build、根 `pnpm test`、DSH integration、Electron desktop build、runtime/migration boundary 与 `git diff --check` 均通过；0.2.0 新增接入 `ConversationDownload`、`Suggestions`、`Loader`、`Shimmer`、`StackTrace`，并完成结构化 `ChatMessage.parts/status/createdAt` 契约迁移；独立 verifier 对提交 `eba6ffea3` 的 Standards / Spec Fidelity 双轴复核 PASS；CNB PR：https://cnb.cool/aizhuliren/xgic/anyong-agent/-/pull/218。

### ANYONG-AI-ELEMENTS-FULL-COVERAGE-20260901 Task Contract

- parent：`ANYONG-AI-ELEMENTS-MIGRATION-20260901`；source：用户在第一阶段 PR #216 合并后要求接入此前列出的全部剩余 AI Elements 组件；reason：第一阶段只迁移了核心 transcript 与 PromptInput 外壳，尚未覆盖附件、审批/提问、模型、计划轨迹、上下文、来源引用、结构化工具输出和对话空状态/滚动。
- 目标：把 `Attachments`、`Question`、`Confirmation`、`ModelSelector`、`Task`、`Plan`、`ChainOfThought`、`Context`、`TokensWithCost`、`Sources`、`InlineCitation`、`Artifact`、`CodeBlock`、`Terminal`、`TestResults`、`FileTree`、`ConversationEmptyState` 和 `ConversationScrollButton` 接入桌面真实对话工作流；组件仅消费官方 DSH transcript、模型、审批、提问、工具 view/result 和附件数据。
- 非目标：不接入 `ChatDialog` 的本地历史；不新增会话、模型、审批、权限、凭据、附件或持久化后端；不伪造来源、引用、文件树、测试结果或 artifact；不升级官方 DSH 或无关依赖。
- 验收标准：指定组件族均在真实可达 UI 路径中使用；附件仍按 DSH image prompt 合约发送；审批和提问仍通过官方 `respond`；模型仍通过官方 `selectModel`；计划和活动仍来自 transcript/todo；上下文用真实 usage/model limits；来源引用和结构化输出只在解析到对应数据时显示；桌面与窄屏无重叠；现有发送、停止、权限、`@` 引用和生成 Surface 行为保持。
- orchestration.mode：`managed`，risk=medium。主代理为唯一 writer；实现完成后由一名只读 verifier 检查组件真实性、DSH 薄壳边界、Svelte 5 类型与可达 UI。
- 相关 skill：`svadmin-admin-ui`、`typescript`、`svelte-code-writer`、`svelte-core-bestpractices`、`volt-gui-design-language`、`agent-team-automation`；遵循 Svelte 5 runes、当前工作台设计语言和官方 DSH 单一运行时边界。
- 影响范围：`apps/desktop-frontend/src/App.svelte`、`src/app.css`、`src/components/ConversationTranscript.svelte`、附件/交互/活动相关组件、`src/lib/transcript.ts` 及聚焦测试；必要时新增纯呈现适配组件，不修改 Electron 主进程或 DSH runtime。
- 验证计划：前端 Vitest、`svelte-check`、Svelte autofixer、Vite production build；Node 26 根测试、DSH integration、Electron runtime boundary、migration boundary、`git diff --check`；桌面和窄屏真实或可复现渲染 smoke；独立 verifier PASS。
- 风险与回滚：大量复合组件可能引入状态绑定、焦点、滚动和窄屏布局回归；用小型适配器、现有 DSH handler 和聚焦测试控制风险。若组件契约无法表达真实数据则保留明确的无数据状态，不用占位假数据；回滚使用普通 revert/follow-up，不改写历史。
- interruption_recovery：稳定证据为本合同、分支 `codex/complete-ai-elements-coverage`、候选 diff 和测试输出；若 verifier 发现阻断项，保持 `running` 并在原分支修复，不创建脱离 parent 的新任务。
- continuation：用户在完整接入实现和验证摘要后于 2026-09-01 明确要求“继续”；结合此前“提交 PR”“合并 PR”的明确指令，本轮获准提交、推送、创建并在门禁通过后合并 CNB PR。
- completion_evidence：Node 26.8.1 / pnpm 12.1.0 下前端 Vitest 39/39、`svelte-check` 0 errors/0 warnings、Vite production build、`git diff --check` 均通过；此前根 `pnpm test`、DSH integration、Electron desktop build、runtime/migration boundary 已通过；独立 verifier 对最终 running Terminal 增量复核 PASS。

### ANYONG-AI-ELEMENTS-MIGRATION-20260901 Task Contract

- source：用户要求在 `@svadmin/ai-elements` 发布后完成对应迁移并提交 PR；2026-09-01 从 npm registry 确认 `latest` 为 `0.1.0`。
- 目标：精确接入 `@svadmin/ai-elements@0.1.0`，将桌面主对话的消息、Markdown 响应、推理、工具状态与输入容器迁移到发布组件，并补齐包样式与 Vite SSR/bundle 边界；完成验证、提交、推送和 CNB PR。
- 非目标：不替换官方 DSH 会话、工具、权限、凭据、工作区或持久化；不引入 `ChatDialog` 的本地历史持久化；不改变附件、审批、提问、模型选择和 DSH RPC 行为；不升级无关依赖或发布版本。
- 验收标准：主会话使用 `Conversation`、`Message`、`Response`、`Reasoning`、`Tool` 和 `PromptInput`；DSH transcript 仍是唯一消息数据源；用户/助手/工具/流式状态、工具参数与结果、token usage、附件、停止与发送均可用；包 CSS 只导入一次；前端测试、Svelte check/autofixer、Vite build、Electron/迁移边界、根测试与 DSH 集成通过。
- orchestration.mode：`managed`，risk=medium。主代理是唯一 writer；完成候选 diff 后由一名只读 verifier 复核包 API、DSH 架构边界、Svelte 5 用法与回归风险。
- 相关 skill：`svadmin-admin-ui`、`typescript`、`svelte-code-writer`、`svelte-core-bestpractices`、`volt-gui-design-language`、`agent-team-automation`、`provider-adapter`；遵循 Svelte 5 runes、现有视觉语言与官方 DSH 薄壳边界。
- 影响范围：`apps/desktop-frontend/package.json`、`vite.config.ts`、`src/App.svelte`、`src/app.css`、`pnpm-lock.yaml`，以及本 Task Contract/完成证据；不修改 Electron 主进程或官方 DSH runtime。
- 风险与回滚：第三方组件样式和状态映射可能影响主会话布局或流式显示；通过现有适配状态、局部 class 和构建/视觉 smoke 控制风险。若回归，以普通 revert/follow-up 撤回迁移提交，不改写历史。
- 验证计划：`pnpm --filter @voltui/desktop-frontend test`、`check`、`build`；`npx @sveltejs/mcp svelte-autofixer apps/desktop-frontend/src/App.svelte --svelte-version 5`；`node scripts/check-electron-runtime-boundary.mjs`、`node scripts/check-migration-boundary.mjs`、`pnpm test`、`pnpm run test:dsh-integration`、`pnpm run build`、`git diff --check`；候选 diff 独立 verifier PASS。
- interruption_recovery：稳定证据为本 Task Contract、npm `0.1.0` 元数据、候选 diff 与测试输出；verifier 失败时只重派一次，仍无结论则保持 `running/PARTIAL`，不创建 PR。
- completion_evidence：实现提交 `36cabd166` 与证据提交 `2303433f6` 已推送至 `origin/codex/migrate-svadmin-ai-elements`；CNB PR #216 已通过 API 合并，合并提交为 `0784723f9acbffbac8d38bfe9e151f35ef1238dd`，目标 `origin/main` 已更新且包含 head `2303433f6`，PR 状态为 `closed/is_merged=true`。前端 33 项测试、Svelte check 0 errors/0 warnings、Vite build、Node 26 根测试、DSH 集成、Electron runtime boundary、migration boundary、Svelte autofixer 和 `git diff --check` 均通过；独立 verifier 已对同一 head 返回 `PASS`，无 blocking findings。非阻断风险：暂无组件级 DOM 测试，建议后续补桌面/窄屏真实会话 smoke。

### ANYONG-CNB-ISSUES-211-215-20260831 Task Contract

- source：用户要求修复并关闭 `https://cnb.cool/aizhuliren/xgic/anyong-agent/-/issues` 当前全部开放 issue；2026-08-31 读取到 #211、#212、#213、#214、#215 共 5 条。
- 目标：修复会话工作台原始 Provider 错误、失败后等待状态和内部 runtime context 泄漏；在会话管理展示异常状态和凭据修复入口；统一子 Agent 管理页顶栏与面包屑；锁定已启动会话的 Agent 预设操作；模型刷新不暴露内网 IP，缺少凭据时禁用并引导保存；完成验证、提交、推送后逐条评论并关闭对应 CNB issue。
- 非目标：不修改官方 DSH 会话、凭据或持久化实现；不新增第二套 Provider、session 或 runtime 状态后端；不升级官方 DSH；不发布新版本、tag 或 Release。
- 验收标准：官方 Provider 的 `settingsNs/settingsPath` 能正确解析根路径或嵌套凭据；缺 Key 时模型不可发送并提供设置入口；agent error 终止等待状态且不污染其他会话；error turn/end 保留异常标识，成功重开/完成后清除；runtime context 不进入最终可见 transcript；非空会话预设按钮禁用；模型刷新文案不出现内网 IP；子 Agent 页保留平台顶栏和当前位置；前端测试/typecheck/build、Electron/迁移边界、根测试和 DSH 集成通过。
- orchestration.mode：`managed`，risk=medium。主代理为唯一 writer；候选 diff 由一名独立只读 verifier 按 #211-#215、架构边界与回归风险复核。
- 相关 skill：`provider-adapter`、`typescript`、`svelte-code-writer`、`svelte-core-bestpractices`、`volt-gui-design-language`；Svelte 5 runes、官方 DSH RPC 和 Electron loopback 安全边界保持不变。
- 影响范围：`apps/desktop-frontend/src/App.svelte`、`app.css`、`lib/model-catalog.*`、`lib/transcript.*`、新增 `lib/session-health.*` 与 `lib/user-error.*`；任务账本仅记录本次合同与证据。
- 风险与回滚：错误映射和前端健康状态会影响用户可见提示，但不写入 DSH 持久化；如回归，以普通 revert/follow-up 撤回本提交，不改写历史。
- 验证计划：前端 Vitest、`svelte-check`、Svelte autofixer、Vite production build；`pnpm test`、`pnpm run test:dsh-integration`、`pnpm run build`；Electron/迁移边界；Playwright mock 截图检查会话、管理、子 Agent、预设和模型页；最终 `git diff --check` 与独立 verifier PASS。
- completion_evidence：实现提交 `adb29d048` 已推送至 `origin/codex/fix-cnb-issues-211-215`；前端 33 项测试、`svelte-check`、Vite production build、Electron runtime boundary、migration boundary 与 `git diff --check` 通过，独立 verifier 对 #211-#215 全部 PASS。2026-08-31 已通过 CNB API 为 #211、#212、#213、#214、#215 添加修复说明并以 `completed` 原因关闭，随后反查开放 issue `total: 0`。

### VOLTGUI-PR103-ELECTRON-FOLLOWUP-20260824 Task Contract

- parent/source/reason：承接 GitHub PR #103 与 2026-08-24 的阻塞审查；用户明确决定 Wails 和 Reasonix 上游同步链完全退役，并授权 Volt 自身 CI/release 控制面迁移到 `main`。同一 PR 分支只补齐 Electron 上线前必须具备的安全、持久化、CI 与安装身份控制。
- 目标：完成 Electron + DSH 桌面主路径，使工作区文件工具、shell/MCP 调用、配置/API Key/会话持久化、工作区切换、OEM 安装身份和 `main` 分支 CI 契约具备可测试且 fail-closed 的边界；验证后提交并 push 原 PR 分支，等待同一 head 的远端检查和独立 panel 复审，再合并 PR。
- 非目标：不恢复或维护 Wails；不迁移旧 Wails 会话、不删除旧 Wails 数据；不宣称 Electron 原位覆盖 Wails；不在本次伪造签名、自动更新或公开 stable Desktop 发布；不改写历史许可证、NOTICE 或既有 release evidence；不提交 secrets、`.agents/state/` 或 mailbox 运行态。
- 验收标准：文件工具只能访问 canonical workspace 内路径并阻止 symlink/缺失目标/glob 越界；DSH 工具执行经过 Electron-owned 授权 broker，shell/Pwsh/MCP 即使 Yolo 也需一次性授权；工作区 MCP 未信任不得启动，子进程环境使用最小 allowlist；Electron 原子持久化配置、工作区状态、trust 和隔离 JSONL 会话，API Key 仅经 `safeStorage` 保存且不可用时拒绝落盘；失败/取消/超步数 turn 不污染历史，工作区切换 prepare/commit 失败保持旧运行时；安装身份由显式 TypeScript build profile 决定并由 Node 26 直接执行合同测试；unsigned 产物明确命名为 `unsigned-review`；Volt GitHub CI/release 控制面绑定真实 `main`；Reasonix/Volt upstream 同步脚本、marker 和 parity 资产删除；`git diff --check` 干净。
- orchestration.mode：`panel`，risk=high/review-high。主代理是唯一 writer；既有三名只读 reviewer 分别覆盖安全、持久化/spec、构建/发布。候选修改完成后，三路 reviewer 必须针对同一新 head 独立复审；任何一轴 FAIL 都不 push/merge。
- 相关 skill：`agent-team-delegation-gate`、`agent-team-tdd`、`provider-adapter`、`stack-profile-selector`、`electron-desktop`、`typescript`、`svelte-code-writer`、`svelte-core-bestpractices`、`volt-gui-design-language`；遵循 Electron 主进程/预加载/renderer 权限边界、Svelte 5 规范和现有 monorepo 脚本。
- 影响范围：`apps/desktop-electron/`、`apps/desktop-frontend/`、`packages/dsh-core/`、`packages/dsh-plugins/`、必要的根脚本/测试/工作流/文档和 tracked 构建产物；删除废弃的 upstream sync/parity 资产；旧 `desktop/` Wails 目录不再作为产品验收依赖，除非仅删除或取消引用所必需。
- 风险与回滚：工具执行和凭据存储属于高风险本地权限面；采用默认拒绝、显式信任、一次性授权、原子文件替换和 workspace 隔离降低影响。push 前可丢弃本 follow-up 提交；push 后只用普通 revert/follow-up 修复，不 force push、不改写已发布 tag。
- 验证计划：TDD 定向 red/green；DSH/Electron/renderer 单元与类型检查；renderer 和 Electron production build；Windows NSIS/portable review package；workflow/release contract tests；根 Go test/vet 保留 CLI 健康证据但 Wails 不再是门禁；最终 `git diff --check`、候选 diff/secret scan、GitHub 同 head checks 与三轴 panel 复审。
