# VoltUI Product Plan and Bilingual Requirements

> Status: Draft  
> Last updated: 2026-06-30  
> Scope: VoltUI CLI/TUI, Wails desktop workbench, local configuration, model/provider management, MCP/skills/plugin ecosystem, and enterprise rollout.

## 0. Document Control / 文档控制

| Item | 中文 | English |
| --- | --- | --- |
| Product name | VoltUI / Volt GUI。面向用户的材料统一使用 VoltUI；历史 Reasonix 命名仅作为兼容和迁移上下文处理。 | VoltUI / Volt GUI. User-facing materials should use VoltUI; legacy Reasonix naming is treated as compatibility and migration context only. |
| Evidence base | 当前仓库 README、桌面 Workbench 契约、Feature Matrix、配置路径、插件开发文档、Marketing Hub 规划和 `desktop/frontend/src` 源码。 | Current repo README, desktop Workbench contract, feature matrix, config paths, plugin development docs, Marketing Hub plan, and `desktop/frontend/src` source. |
| UI reference note | 项目规则要求 UI 规划优先参考 aoristlawer 源码；本机 `/Volumes/Data/workspace` 下未找到该仓库。本 PRD 不声明视觉对齐已完成，后续 UI 实施前必须补充该证据。 | Project rules require UI planning to reference the aoristlawer source first; that repo was not found under local `/Volumes/Data/workspace`. This PRD does not claim visual parity; UI implementation must refresh that evidence first. |
| Non-goals for this document | 不改变代码、不定义商业价格、不承诺云 SaaS、不替代工程规格和测试矩阵。 | Do not change code, define pricing, promise cloud SaaS, or replace engineering specs and test matrices. |

## 1. Product Vision / 产品愿景

**中文**

VoltUI 是面向企业内网的 AI coding agent 与本地工作台。它的核心价值不是“再做一个聊天窗口”，而是把企业已有的私有模型、内部文档、代码仓库、权限策略、MCP 工具、技能包和审计流程组织成一个离线优先、可分发、可治理的桌面生产力入口。

产品长期方向是成为“企业内网 AI 工作系统的本地控制台”：开发者用它完成代码、调试、审查和文档工作；团队负责人用它管理任务、上下文、Agent 和自动化；平台管理员用它统一模型渠道、权限、插件、更新和分发策略。

**English**

VoltUI is an enterprise-intranet AI coding agent and local workbench. Its value is not another chat window. It organizes private models, internal docs, repositories, permission policy, MCP tools, skill packages, and audit flows into an offline-first, distributable, governable desktop entry point.

The long-term direction is to become the local control console for enterprise intranet AI work systems. Developers use it for code, debugging, review, and documentation. Team leads use it for tasks, context, agents, and automation. Platform admins use it to govern model channels, permissions, plugins, updates, and distribution.

## 2. Positioning / 产品定位

| Dimension | 中文 | English |
| --- | --- | --- |
| Primary category | 企业内网 AI coding agent + 桌面工作台。 | Enterprise intranet AI coding agent plus desktop workbench. |
| Primary buyer | 已部署或计划部署私有/内网大模型的研发平台、IT、AI 平台或安全合规团队。 | R&D platform, IT, AI platform, or security teams that run or plan to run private/intranet LLMs. |
| Primary users | 开发者、技术负责人、团队协调者、平台管理员、插件/技能维护者。 | Developers, tech leads, team coordinators, platform admins, and plugin/skill maintainers. |
| Differentiation | 离线优先、Windows 10 优先、任意 OpenAI 兼容模型、多模型路由、Go/Wails 本地内核、MCP/技能/插件治理、Work/Code 双工作台。 | Offline-first, Windows 10 first, any OpenAI-compatible model, multi-model routing, local Go/Wails kernel, MCP/skill/plugin governance, and Work/Code workbench modes. |
| Product promise | 打包一次，内网开发者开箱可用；策略可控，结果可审查，扩展不侵入核心。 | Package once, let intranet developers work immediately; keep policy controllable, results reviewable, and extensions outside the core. |

## 3. Target Users and Scenarios / 目标用户与场景

| Persona | 中文需求 | English need | Success signal |
| --- | --- | --- | --- |
| Enterprise developer / 企业开发者 | 在不能访问公网 AI 服务的环境里完成代码理解、修改、测试、文档、脚本和审查。 | Complete code understanding, editing, testing, docs, scripts, and review where public AI services are unavailable. | First useful response from an approved internal model in minutes. |
| Team lead / 技术负责人 | 把上下文、任务、变更、风险和回滚计划组织成可追踪工作流。 | Organize context, tasks, changes, risks, and rollback plans into traceable workflows. | A task can move from brief to verified output with visible evidence. |
| Platform admin / 平台管理员 | 统一配置模型渠道、密钥位置、权限策略、MCP、技能、更新和离线分发包。 | Govern model channels, credential locations, permissions, MCP, skills, updates, and offline packages. | Users can onboard without manual model setup or secret leakage. |
| Security/compliance / 安全合规 | 控制工具权限、沙盒边界、审计记录、内网数据流和敏感信息暴露。 | Control tool permissions, sandbox boundaries, audit logs, intranet data flow, and sensitive information exposure. | High-risk actions require policy-backed approval and leave evidence. |
| Plugin/workflow builder / 插件与流程维护者 | 通过 MCP、skills 和 workbench plugins 扩展工具、业务流程和多步骤产物。 | Extend tools, workflows, and multi-step artifacts through MCP, skills, and workbench plugins. | A new capability can ship without hardcoding vendor logic into the desktop shell. |

## 4. Product Principles / 产品原则

1. **Offline first / 离线优先**  
   Runtime must not depend on public package downloads, telemetry, or cloud-only control planes. 企业内网部署时，运行时不依赖公网包下载、遥测或云控制面。

2. **Model neutral / 模型中立**  
   Providers are configuration and registry entries, not hardcoded product branches. 模型渠道通过配置和注册表扩展，不在产品逻辑里硬编码厂商。

3. **Local trust boundary / 本地信任边界**  
   Go/Wails remains the desktop execution and IPC boundary. Desktop UI calls typed bindings, not a hidden Node/Electron server. Go/Wails 继续作为桌面执行和 IPC 边界；桌面 UI 通过类型化绑定访问内核。

4. **Workbench, not chat-only / 工作台优先，不是纯聊天**  
   Chat is one surface inside Work and Code. The product must expose projects, tasks, files, diffs, approvals, resources, memory, and checkpoints as first-class work objects. 对话只是 Work/Code 工作台中的一个面，项目、任务、文件、diff、审批、资源、记忆和检查点都必须是一等对象。

5. **Reviewable automation / 可审查自动化**  
   Automation must expose inputs, intermediate state, approvals, outputs, and rollback paths. 自动化必须暴露输入、中间状态、审批、产物和回滚路径。

6. **Extensible outside the core / 扩展不侵入核心**  
   MCP plugins provide model-callable tools. Workbench plugins own rich UI, durable jobs, artifacts, and review flows. MCP 插件负责工具能力，Workbench 插件负责复杂 UI、持久任务、产物和审查流程。

## 5. Product Scope / 产品范围

### 5.1 Core Product / 核心产品

| Area | 中文范围 | English scope |
| --- | --- | --- |
| Agent runtime | CLI/TUI、桌面端和 serve 共享同一个 Go 控制器、Provider、Tool、Permission、Memory 和 Checkpoint 能力。 | CLI/TUI, desktop, and serve share the same Go controller, provider, tool, permission, memory, and checkpoint capabilities. |
| Desktop workbench | Wails v2 + Svelte 5。Work 和 Code 是顶层工作域；Ask/Auto/YOLO/Plan/Goal 是运行姿态。 | Wails v2 plus Svelte 5. Work and Code are top-level activity domains; Ask/Auto/YOLO/Plan/Goal are run postures. |
| Model/provider management | OpenAI-compatible and Anthropic providers, provider/model refs, priority-based disambiguation, key env handling, default/planner model selection. | OpenAI-compatible and Anthropic providers, provider/model refs, priority disambiguation, key env handling, and default/planner model selection. |
| MCP and skills | MCP servers, prompts/resources/tools, skill roots, enable/disable controls, and capability center surfaces. | MCP servers, prompts/resources/tools, skill roots, enable/disable controls, and capability center surfaces. |
| Local state | `~/.voltui` or `%APPDATA%\voltui` config, sessions, archive, memory, credentials `.env`, migration rescue, and workspace-local workbench jobs. | `~/.voltui` or `%APPDATA%\voltui` config, sessions, archive, memory, credential `.env`, migration rescue, and workspace-local workbench jobs. |
| Enterprise distribution | Windows 10-first packaged distribution, pre-baked config, no user setup wizard required for managed rollout, update banner and release artifacts. | Windows 10-first packaged distribution, pre-baked config, no user setup wizard required for managed rollout, update banner, and release artifacts. |

### 5.2 Adjacent Product Surfaces / 相邻产品面

| Surface | 中文说明 | English description |
| --- | --- | --- |
| Work dashboard | 面向日常任务、目标、近期会话、记忆、资料中心、自动化、团队和 Agent 管理。 | Daily work surface for tasks, goals, recent sessions, memory, resources, automation, teams, and agents. |
| Code dashboard | 面向仓库、上下文、文件树、变更、diff、检查点和代码级审批。 | Repository surface for context, file tree, changes, diffs, checkpoints, and code-level approvals. |
| Resource console | Provider、Model、MCP、Skill、Permission、Desktop prefs、Session、Memory、Update、Workbench plugin/job 的统一资源视图。 | Unified resource view for providers, models, MCP, skills, permissions, desktop prefs, sessions, memory, updates, and workbench plugins/jobs. |
| Workbench plugins | 多步骤产物和业务流程扩展，例如 Content Studio / Marketing Hub。 | Extensions for multi-step artifacts and business workflows, such as Content Studio / Marketing Hub. |

### 5.3 Out of Scope by Default / 默认非目标

- 不迁移到 Electron，不把 Go 内核迁到 Node 服务。  
  Do not migrate to Electron or move the Go kernel to a Node service.
- 不默认提供公网 SaaS、多租户计费或云端控制面。  
  Do not assume public SaaS, multi-tenant billing, or a cloud control plane.
- 不把客户或下游产品品牌硬编码进上游桌面壳。  
  Do not hardcode customer or downstream branding into the upstream desktop shell.
- 不在配置文件、日志、文档样例中写入真实密钥。  
  Do not put real secrets into configs, logs, or documentation examples.

## 6. Roadmap / 路线图

| Phase | 中文目标 | English goal | Exit criteria |
| --- | --- | --- | --- |
| Phase 0: Product contract consolidation | 统一 VoltUI 命名、产品边界、PRD、验收指标和文档入口；清理仍会误导用户的 Reasonix 表述。 | Consolidate VoltUI naming, product boundaries, PRD, acceptance metrics, and docs entry points; clean user-confusing legacy Reasonix wording. | Product docs link to a single current product narrative; legacy names are marked as compatibility context. |
| Phase 1: Production desktop baseline | 把 Svelte Workbench 从功能可用推进到生产可用，重点是 onboarding、设置、模型验证、Work/Code 稳定性、更新、无障碍和响应式。 | Move the Svelte Workbench from usable to production-ready, focusing on onboarding, settings, model validation, Work/Code stability, updates, accessibility, and responsive behavior. | `scripts/ui-feature-smoke.mjs`, `scripts/p0-production-smoke.sh`, frontend build/check, and `git diff --check` pass for release candidates. |
| Phase 2: Enterprise rollout kit | 形成企业分发包、内网模型模板、密钥/配置策略、Windows 安装与升级策略、管理员诊断和离线文档。 | Produce enterprise distribution packages, intranet model templates, credential/config policy, Windows install/update strategy, admin diagnostics, and offline docs. | A managed Windows user can start with a pre-baked provider and no manual secret entry. |
| Phase 3: Team operations | 把任务、目标、自动化、Agent、团队和资料中心变成可持续日常工作流，而不是静态样例。 | Turn tasks, goals, automation, agents, teams, and resource center into durable daily workflows instead of static examples. | Work dashboard tasks and agent flows persist through typed resources and have smoke coverage. |
| Phase 4: Workbench ecosystem | 发布 Workbench plugin SDK，支持本地 job/artifact/review 流程；以 Marketing Hub / Content Studio 作为首个复杂插件样板。 | Publish the Workbench plugin SDK with local job/artifact/review flows; use Marketing Hub / Content Studio as the first complex plugin sample. | A plugin can create a job, persist steps, produce artifacts, request approval, and export files without core UI rewrites. |
| Phase 5: Governance and scale | 补齐审计、策略模板、团队级配置、同步边界、权限报告和平台运维诊断。 | Add audit, policy templates, team-level config, sync boundaries, permission reports, and platform operational diagnostics. | Admins can prove model/tool/policy state for a user or workspace without exposing secrets. |

## 7. Functional Requirements / 功能需求

### FR-1. Onboarding and Startup / 启动与上手

| Requirement | 中文 | English | Priority |
| --- | --- | --- | --- |
| FR-1.1 | 首次启动必须能识别全局配置、项目配置、Provider 状态、密钥状态、MCP/Skill 状态和迁移状态。 | First launch must identify global config, project config, provider state, credential state, MCP/skill state, and migration state. | P0 |
| FR-1.2 | 管理员预配置分发包时，终端用户不需要运行配置向导即可开始使用。 | In an admin preconfigured package, end users should start without running a setup wizard. | P0 |
| FR-1.3 | 配置缺失时，界面应给出最短修复路径，例如添加 Provider、保存 Key、选择默认模型或运行迁移。 | When config is missing, the UI should show the shortest repair path, such as adding a provider, saving a key, selecting a default model, or running migration. | P0 |

### FR-2. Agent Conversation Loop / Agent 对话循环

| Requirement | 中文 | English | Priority |
| --- | --- | --- | --- |
| FR-2.1 | 用户可以提交文本、附件、`@` 引用和斜杠命令，并看到流式文本、reasoning、usage、工具调用和完成状态。 | Users can submit text, attachments, `@` references, and slash commands, then see streamed text, reasoning, usage, tool calls, and completion state. | P0 |
| FR-2.2 | 工具审批、计划审批和 ask question 必须以内联卡片呈现，支持键盘和鼠标操作。 | Tool approvals, plan approvals, and ask questions must appear as inline cards with keyboard and mouse support. | P0 |
| FR-2.3 | 运行中的 turn 必须可取消；取消后草稿、pending state 和 transcript 不得交叉污染其他 tab 或 activity mode。 | A running turn must be cancellable; draft, pending state, and transcript must not leak across tabs or activity modes. | P0 |
| FR-2.4 | 历史会话可列表、恢复、预览、归档或删除；恢复后 Work/Code 状态保持清晰。 | Historical sessions can be listed, resumed, previewed, archived, or deleted; Work/Code state remains clear after resume. | P1 |

### FR-3. Work Mode / Work 工作域

| Requirement | 中文 | English | Priority |
| --- | --- | --- | --- |
| FR-3.1 | Work 首页展示今日工作、任务/目标、最近会话、记忆、资料中心、自动化、团队和 Agent 入口。 | Work home shows today's work, tasks/goals, recent sessions, memory, resources, automation, teams, and agent entry points. | P0 |
| FR-3.2 | 任务和目标应成为持久资源，支持开始、继续、完成、阻塞、清除和证据查看。 | Tasks and goals should become durable resources supporting start, continue, complete, block, clear, and evidence view. | P1 |
| FR-3.3 | 资料中心支持导入、搜索、对话引用和失败任务恢复。 | Resource center supports ingest, search, conversation references, and failed-job recovery. | P1 |
| FR-3.4 | 团队/Agent 管理应支持内置 Agent、自定义 Agent、技能绑定、核心文件和运行记录。 | Team/agent management should support built-in agents, custom agents, skill binding, core files, and run records. | P1 |

### FR-4. Code Mode / Code 工作域

| Requirement | 中文 | English | Priority |
| --- | --- | --- | --- |
| FR-4.1 | Code 首页展示当前仓库、分支、上下文用量、变更数量、检查点和代码相关动作。 | Code home shows current repository, branch, context usage, change count, checkpoints, and code actions. | P0 |
| FR-4.2 | 右侧 dock 提供 Context、Workspace、Changes、Diff、Checkpoints 面板。 | The right dock provides Context, Workspace, Changes, Diff, and Checkpoints panels. | P0 |
| FR-4.3 | 文件引用、文件预览、变更列表、二进制/重命名/截断 diff 状态必须可见且可操作。 | File references, previews, change lists, and binary/renamed/truncated diff states must be visible and actionable. | P0 |
| FR-4.4 | Rewind/Checkpoint 必须在执行前说明范围和影响，执行后刷新 transcript、context、changes 和 checkpoint state。 | Rewind/checkpoint actions must explain scope and impact before execution and refresh transcript, context, changes, and checkpoint state afterward. | P0 |

### FR-5. Model and Provider Management / 模型与渠道管理

| Requirement | 中文 | English | Priority |
| --- | --- | --- | --- |
| FR-5.1 | 支持 OpenAI-compatible、Anthropic 和本地/内网模型端点；添加新 OpenAI-compatible 模型不需要改代码。 | Support OpenAI-compatible, Anthropic, and local/intranet model endpoints; adding a new OpenAI-compatible model must not require code changes. | P0 |
| FR-5.2 | UI 必须展示 provider/model 完整引用、默认模型、planner 模型、priority、context window、reasoning protocol、vision models 和 key 状态。 | UI must show provider/model refs, default model, planner model, priority, context window, reasoning protocol, vision models, and key state. | P0 |
| FR-5.3 | 多个渠道暴露同名模型时，裸模型名只在最高 priority 唯一时自动解析；否则提示用户使用 `provider/model`。 | When multiple providers expose the same model name, bare model names auto-resolve only when the highest priority is unique; otherwise prompt for `provider/model`. | P0 |
| FR-5.4 | 密钥值只写入全局 `.env` 或受控凭据存储，配置和前端只展示 env key 和 masked 状态。 | Secret values are written only to global `.env` or controlled credential storage; config and frontend show only env keys and masked state. | P0 |

### FR-6. Permissions, Modes, and Sandbox / 权限、模式与沙盒

| Requirement | 中文 | English | Priority |
| --- | --- | --- | --- |
| FR-6.1 | Work/Code activity mode 不得和 Ask/Auto/YOLO/Plan/Goal run mode 混在一个控件里。 | Work/Code activity modes must not be collapsed into the Ask/Auto/YOLO/Plan/Goal run modes. | P0 |
| FR-6.2 | Permission mode 支持 ask、allow、deny 规则；硬阻断规则在任何 run mode 下都生效。 | Permission mode supports ask, allow, and deny rules; hard-deny rules apply under every run mode. | P0 |
| FR-6.3 | Sandbox 设置必须清晰展示 workspace root、额外可写路径、shell/network 策略和风险解释。 | Sandbox settings must clearly show workspace root, extra writable paths, shell/network policy, and risk explanation. | P1 |
| FR-6.4 | YOLO/Auto 只能降低普通审批摩擦，不能绕过 hard deny、用户问题、计划审批和高风险策略。 | YOLO/Auto can reduce routine approval friction, but cannot bypass hard deny, user questions, plan approvals, or high-risk policy. | P0 |

### FR-7. MCP, Skills, and Plugins / MCP、技能与插件

| Requirement | 中文 | English | Priority |
| --- | --- | --- | --- |
| FR-7.1 | MCP server 支持 stdio 和 streamable HTTP；连接、失败、禁用、延迟加载和重试状态必须可见。 | MCP servers support stdio and streamable HTTP; connected, failed, disabled, lazy, and retry states must be visible. | P0 |
| FR-7.2 | Skill roots 和技能包支持列表、启用/禁用、来源、scope、runAs 和描述展示。 | Skill roots and packages support listing, enable/disable, source, scope, runAs, and description display. | P0 |
| FR-7.3 | Workbench plugins 支持 durable jobs、steps、artifacts、approval 和 export，不把复杂业务流程硬编码到核心 UI。 | Workbench plugins support durable jobs, steps, artifacts, approval, and export without hardcoding complex business flows into the core UI. | P1 |
| FR-7.4 | 插件配置不得把 provider secrets 暴露给前端；前端只能看到 `envKeys` 和 `headerKeys`。 | Plugin config must not expose provider secrets to the frontend; frontend sees only `envKeys` and `headerKeys`. | P0 |

### FR-8. Memory and Context / 记忆与上下文

| Requirement | 中文 | English | Priority |
| --- | --- | --- | --- |
| FR-8.1 | 记忆支持查看 facts/docs、添加、忘记、按 scope 区分和显示存储位置。 | Memory supports viewing facts/docs, adding, forgetting, scope separation, and storage location display. | P0 |
| FR-8.2 | Context 面板展示 token usage、read files、changed files、cache breakdown 和刷新动作。 | Context panel shows token usage, read files, changed files, cache breakdown, and refresh action. | P0 |
| FR-8.3 | 长会话压缩、历史检索和会话恢复不应破坏用户明确输入的事实。 | Long-session compaction, history retrieval, and session resume should not lose facts explicitly provided by the user. | P1 |

### FR-9. Enterprise Distribution and Updates / 企业分发与更新

| Requirement | 中文 | English | Priority |
| --- | --- | --- | --- |
| FR-9.1 | Windows 10 是第一优先级；安装包和运行时必须覆盖 WebView2、路径、RDP/VDI 和 SmartScreen 现实问题。 | Windows 10 is first priority; installer and runtime must address WebView2, paths, RDP/VDI, and SmartScreen realities. | P0 |
| FR-9.2 | 更新横幅展示 available、error、progress、done；平台不支持自更新时打开下载页。 | Update banner shows available, error, progress, and done; when self-update is unsupported, open the download page. | P1 |
| FR-9.3 | 企业离线包应包含二进制、配置模板、`.env` 策略说明、内网 Provider 模板、MCP 模板和管理员诊断文档。 | Enterprise offline package should include binary, config templates, `.env` policy notes, intranet provider templates, MCP templates, and admin diagnostics. | P1 |

### FR-10. Localization and White Label / 本地化与白标

| Requirement | 中文 | English | Priority |
| --- | --- | --- | --- |
| FR-10.1 | 产品 UI、README 和关键配置/故障排除文档至少支持中文和英文。 | Product UI, README, and key config/troubleshooting docs support at least Chinese and English. | P0 |
| FR-10.2 | 白标名称、short name、logo、wordmark、tray/taskbar icon 可通过配置或环境变量替换。 | White-label name, short name, logo, wordmark, and tray/taskbar icon can be replaced through config or environment variables. | P1 |
| FR-10.3 | 下游品牌不得污染上游默认产品文案、系统提示词和 release assets。 | Downstream branding must not leak into upstream default copy, system prompts, or release assets. | P0 |

## 8. Non-Functional Requirements / 非功能需求

| Area | 中文要求 | English requirement |
| --- | --- | --- |
| Security | 密钥不进入仓库、配置诊断、前端状态、日志或文档样例；所有导出诊断默认脱敏。 | Secrets never enter repo files, config diagnostics, frontend state, logs, or doc examples; exported diagnostics are redacted by default. |
| Reliability | 启动、提交、取消、审批、恢复、设置保存、更新检查和资源列表必须可重试、可恢复并显示错误。 | Startup, submit, cancel, approval, resume, settings save, update check, and resource listing must be retryable, recoverable, and visible on error. |
| Performance | 桌面首屏不依赖远程字体或资源；大 transcript 和大 diff 必须有截断、折叠或虚拟化策略。 | Desktop first paint depends on no remote fonts/assets; large transcripts and diffs need truncation, folding, or virtualization. |
| Compatibility | 保持 Go CLI 单静态二进制目标；桌面 CGO/WebKit 依赖隔离在 `desktop/` nested module。 | Preserve the Go CLI single static binary target; isolate desktop CGO/WebKit dependencies in the `desktop/` nested module. |
| Accessibility | 常用操作支持键盘；审批卡片、菜单、设置和 Work/Code 切换必须有稳定焦点路径。 | Common operations support keyboard access; approval cards, menus, settings, and Work/Code switching have stable focus paths. |
| Observability | Provider、MCP、Skill、Plugin、Permission、Update、Job 和 Session 状态有可见诊断入口。 | Provider, MCP, skill, plugin, permission, update, job, and session states have visible diagnostics. |
| Privacy | 默认本地优先，不上传会话、记忆、仓库内容或工具结果；任何同步能力必须显式启用。 | Local-first by default. Sessions, memory, repository content, and tool results are not uploaded; any sync capability must be explicit. |

## 9. Data and Resource Model / 数据与资源模型

**中文**

VoltUI 的桌面资源层应以统一的 DataProvider 形态暴露资源。当前核心资源包括：

- `providers`：模型渠道、连接、模型列表、priority、密钥 env、上下文窗口。
- `models`：可选择模型引用、默认模型、planner 模型。
- `mcpServers`：MCP server 配置、连接状态、tools/prompts/resources 数量。
- `skills`：技能包、来源、scope、runAs、启用状态。
- `permissions`：mode、allow/ask/deny、sandbox。
- `desktopPrefs`：语言、主题、关闭行为。
- `workspaces` / `sessions` / `topics`：项目、会话和话题。
- `tasks` / `memory` / `checkpoints` / `updates`：工作流、记忆、回退点、更新。
- `workbenchPlugins` / `workbenchProviders` / `workbenchJobs`：插件、插件 provider 和持久 job。

**English**

The VoltUI desktop resource layer should expose resources through a unified DataProvider shape. Core resources include:

- `providers`: model channels, connection, model list, priority, credential env, context window.
- `models`: selectable model refs, default model, planner model.
- `mcpServers`: MCP server config, connection state, tools/prompts/resources counts.
- `skills`: skill package, source, scope, runAs, enabled state.
- `permissions`: mode, allow/ask/deny, sandbox.
- `desktopPrefs`: language, theme, close behavior.
- `workspaces` / `sessions` / `topics`: projects, sessions, and topics.
- `tasks` / `memory` / `checkpoints` / `updates`: workflow, memory, rewind points, updates.
- `workbenchPlugins` / `workbenchProviders` / `workbenchJobs`: plugins, plugin providers, and durable jobs.

## 10. UX Information Architecture / 交互信息架构

| Region | 中文职责 | English responsibility |
| --- | --- | --- |
| App chrome | 当前项目/会话、紧凑状态、命令入口、窗口拖拽和更新状态。 | Current project/session, compact status, command entry, window drag region, and update state. |
| Primary sidebar | Work/Code 切换、项目/话题、任务/资源/能力/设置入口。 | Work/Code switching, projects/topics, tasks/resources/capabilities/settings entry points. |
| Main stage | 当前对话、Work dashboard、Code dashboard、资源页或插件页面。 | Current conversation, Work dashboard, Code dashboard, resource page, or plugin page. |
| Composer | 文本、附件、`@` 引用、斜杠命令、模型/effort/run mode 控制。 | Text, attachments, `@` references, slash commands, model/effort/run-mode controls. |
| Right dock | Code context、文件、变更、diff、检查点、计划、审批、工具 trace、插件 inspector。 | Code context, files, changes, diffs, checkpoints, plan, approvals, tool trace, plugin inspectors. |
| Resource console | Provider、Model、MCP、Skill、Permission、Session、Memory、Update 和 Plugin Job 的表单/列表/详情。 | List/form/detail surfaces for providers, models, MCP, skills, permissions, sessions, memory, updates, and plugin jobs. |

## 11. Acceptance Metrics / 验收指标

| Metric | 中文目标 | English target |
| --- | --- | --- |
| First useful response | 管理员预配置包下，新用户从启动到收到第一个模型回复不超过 5 分钟。 | With an admin-preconfigured package, a new user gets the first model response within 5 minutes. |
| Provider setup success | 用户添加 OpenAI-compatible provider 后，可以在同一设置流里完成模型发现、默认模型选择和密钥保存。 | After adding an OpenAI-compatible provider, the same settings flow supports model discovery, default model selection, and credential save. |
| Work/Code clarity | 用户切换 Work/Code 时，run mode 不变化，且不会出现跨面板状态污染。 | Switching Work/Code does not change run mode and does not leak state across panels. |
| Safety visibility | 每个 writer tool、计划执行、checkpoint rewind 和高风险设置更改都有可见审批或确认。 | Every writer tool, plan execution, checkpoint rewind, and high-risk settings change has visible approval or confirmation. |
| Smoke coverage | 生产候选必须通过 UI feature smoke、P0 production smoke、frontend build/check 和 `git diff --check`。 | Release candidates pass UI feature smoke, P0 production smoke, frontend build/check, and `git diff --check`. |
| Enterprise packaging | Windows 用户拿到分发包后可离线启动、看到预配置模型、提交请求并完成一次可审查工具流。 | A Windows user can launch offline, see a preconfigured model, submit a request, and complete one reviewable tool flow. |

## 12. Verification Plan / 验证计划

**中文**

按改动范围选择最小但真实的门禁：

- 文档/规划：`git diff --check`，必要时检查链接和术语一致性。
- Frontend：`cd desktop/frontend && pnpm check && pnpm build`。
- Desktop Go：`cd desktop && GOTOOLCHAIN=local GOPROXY=https://goproxy.cn,direct go test ./...`。
- Root Go：`GOTOOLCHAIN=local GOPROXY=https://goproxy.cn,direct go test ./...`，必要时 `go vet ./...`。
- 生产门禁：`./scripts/p0-production-smoke.sh`。
- 广覆盖 UI：`node scripts/ui-feature-smoke.mjs` 或项目当前推荐 smoke 命令。

**English**

Choose the smallest real gate based on changed scope:

- Docs/planning: `git diff --check`, plus link and terminology checks when needed.
- Frontend: `cd desktop/frontend && pnpm check && pnpm build`.
- Desktop Go: `cd desktop && GOTOOLCHAIN=local GOPROXY=https://goproxy.cn,direct go test ./...`.
- Root Go: `GOTOOLCHAIN=local GOPROXY=https://goproxy.cn,direct go test ./...`, and `go vet ./...` when needed.
- Production gate: `./scripts/p0-production-smoke.sh`.
- Broad UI: `node scripts/ui-feature-smoke.mjs` or the current project-recommended smoke command.

## 13. Risks and Mitigations / 风险与缓解

| Risk | 中文缓解 | English mitigation |
| --- | --- | --- |
| Legacy naming drift | 建立产品术语清单，新增文档统一 VoltUI，旧 Reasonix 表述标注兼容来源并逐步修复。 | Maintain product terminology, use VoltUI in new docs, mark legacy Reasonix wording as compatibility context, and fix it incrementally. |
| Provider compatibility variance | 把模型发现、streaming、tool call、reasoning、vision、context window 都做成 capability，不靠厂商名推断。 | Model discovery, streaming, tool calls, reasoning, vision, and context window should be capabilities, not vendor-name assumptions. |
| UI scope creep | Work/Code 核心路径优先；Marketing/Content Studio 等复杂业务能力通过 Workbench plugin 隔离。 | Prioritize Work/Code core paths; isolate complex business capabilities such as Marketing/Content Studio through Workbench plugins. |
| Wails platform variance | 保持平台专项 release notes 和 smoke；Linux WebKit、Windows WebView2、macOS Gatekeeper 单独列风险。 | Keep platform-specific release notes and smoke; track Linux WebKit, Windows WebView2, and macOS Gatekeeper separately. |
| Secret leakage | 所有配置、诊断、插件和文档样例都使用 env key、masked value 和 redaction。 | Use env keys, masked values, and redaction in configs, diagnostics, plugins, and documentation examples. |
| Missing UI reference evidence | 后续 UI 实施前补充 aoristlawer 源码读取和截图/结构证据；没有证据时不声明对齐。 | Before UI implementation, refresh aoristlawer source and screenshot/structure evidence; do not claim alignment without evidence. |

## 14. Open Questions / 待决问题

| Question | 中文说明 | English note |
| --- | --- | --- |
| Product naming | 对外统一叫 VoltUI、Volt GUI 还是 Volt？是否保留 Reasonix 作为内核/上游兼容名？ | Should the external name be VoltUI, Volt GUI, or Volt? Should Reasonix remain as a kernel/upstream compatibility name? |
| Enterprise auth | OIDC/SSO 是否进入 P1，还是只作为下游/插件能力保留？ | Should OIDC/SSO enter P1, or remain a downstream/plugin capability? |
| Sync boundary | 是否提供跨设备/团队同步？如果提供，同步哪些对象，默认是否关闭？ | Should cross-device/team sync exist? If yes, which objects sync, and is it disabled by default? |
| Workbench plugin SDK | 首个样板插件选 Marketing Hub、Content Studio、Enterprise Mounts，还是内部 Agent Team 运营台？ | Should the first sample plugin be Marketing Hub, Content Studio, Enterprise Mounts, or an internal Agent Team operations console? |
| Admin packaging | 企业分发是 ZIP、NSIS、MSI、MDM 包，还是多格式并行？ | Should enterprise distribution use ZIP, NSIS, MSI, MDM package, or multiple formats? |
| UI reference | aoristlawer 源码不可用时，是否允许基于 VoltUI 当前 Workbench 和截图先推进？ | If aoristlawer source is unavailable, can UI work proceed from current VoltUI workbench and screenshots first? |

## 15. Immediate Next Actions / 近期行动

1. **中文**：确认产品命名和对外叙事，把新 PRD 链接到 README 或 docs index。  
   **English**: Confirm naming and external narrative, then link this PRD from README or docs index.

2. **中文**：对现有 docs 中的 Reasonix/VoltUI 术语做一次非破坏性审计，先修复最容易误导用户的页面。  
   **English**: Run a non-destructive terminology audit across docs and fix the pages most likely to confuse users first.

3. **中文**：把 Phase 1 的生产桌面门禁固化成 release checklist，明确每次 desktop release 前必须跑哪些命令。  
   **English**: Turn Phase 1 production desktop gates into a release checklist with exact commands for every desktop release.

4. **中文**：补充 aoristlawer UI 参考证据，决定 Work/Code/Resource Console 的下一轮视觉和交互收敛范围。  
   **English**: Add aoristlawer UI reference evidence and decide the next visual/interaction convergence scope for Work, Code, and Resource Console.

5. **中文**：选择一个 Workbench plugin 样板，验证 durable job、step approval、artifact export 和 plugin provider 边界。  
   **English**: Pick one Workbench plugin sample and validate durable jobs, step approvals, artifact export, and plugin provider boundaries.
