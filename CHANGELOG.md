# Changelog

## 0.31.56 - 2026-09-16

### Changed

- Ported the Anyong `v0.31.56` product runtime onto the cleaned GitHub line: official `@deepseek-ai/dsh@0.1.5-rc.1`, pnpm `12.1.0`, Electron reliability, Svelte workbench, BrowserSkill/OfficeCLI/WeKnora profile extensions, and Windows unsigned-review packaging.
- GitHub remains the Windows x64 packager. CNB stays a Node 26 source gate and does not import tracked OEM keys or publish installers.
- BrowserSkill CLI is staged by sha256 at build time; the 12MB `vendor/bsk/bsk.exe` binary is not tracked.
- Release-time OEM gateway credentials come from GitHub Actions secrets (`XG_GOMODEL_API_KEY`) and generate `bundled.env` only in CI, never from committed files.

### Fixed

- Preserve transcript, tool-status, startup timeout, intranet model, and session-error fixes from the Anyong 0.31 line without reintroducing cleaned history or live keys.
- Ensure the OfficeCLI native binary exists before official DSH web/headless startup, so `failOnStartupError` cannot stall loopback URL publish on first-run download.
- Include Svelte workbench tests in `pnpm test` and the skills-sync gate in GitHub Node CI, matching the CNB source contract.
- Stage the OfficeCLI native binary on every desktop platform after `pnpm deploy`, not only Windows, so packaged DSH startup cannot hang on a missing vendor binary.
- Resolve packaged OfficeCLI, BrowserSkill, and integrations MCP paths from the Electron `resources` root. Walking five directories up from `dsh/lib/bin.js` landed in `dsh-runtime` and stalled `failOnStartupError` before the loopback URL was published.
- Keep bundled OEM gateway keys out of tracked `.cnb/envs.yml` and out of the official DSH child environment; Windows desktop CI/release also run the skills-sync gate.
- Pin the Windows portable ZIP name and fail closed when Electron extraResources sources are missing, so `package-dist` cannot publish an incomplete unsigned-review artifact.
- Classify credential/settings errors through locale-aware helpers instead of hardcoded Chinese/English fragments in the workbench, including interpolated `requireKeyNotice` and provider-specific 401 messages.
- Fail closed when Windows packaging or inspect sees a non-x64 PE `node.exe`, `officecli.exe`, `bsk.exe`, `node-pty` `win32-x64` addon, or `@koromix/koffi-win32-x64`, so ARM64/32-bit PE and macOS-staged runtimes cannot ship as Windows artifacts.
- Pin `@koromix/koffi-win32-x64` on the desktop package and copy it into the staged DSH graph if `pnpm deploy` omitted the nested optional native addon.
- Copy missing Windows x64 `node-pty` ConPTY prebuilds and Koffi into the staged graph from the workspace or pnpm virtual store before `electron-builder --win`, and fail closed unless `conpty.node`, `conpty_console_list.node`, `conpty.dll`, and `OpenConsole.exe` are AMD64 PE images.
- Omit Darwin/Linux/ARM64 native addons and `*.pdb` files from the Windows extraResources graph; inspect fails if native binaries leak into `win-unpacked`, ignores empty leftover directories, and requires the packaged `Anyong.exe` host to be Windows x64 PE.
- Require Authenticode `NotSigned` for the Windows desktop CI installer, matching the unsigned-review release contract.
- Ignore a staged Koffi binary unless it is Windows x64 PE, so an ARM64 leftover cannot satisfy the packaging gate.
- Strip inherited provider API keys and OEM endpoints from the official DSH child environment; bundled `XG_MODEL_BASE_URL` still comes from `bundled.env`.
- Keep CNB publisher/installer scripts and `.worktrees/` out of the GitHub line via gitignore.
- Keep root package metadata on GitHub (`zuohuadong/volt-gui`, MIT) and reject copied CNB repository URLs or a fake `index.js` entry.
- Offer a locale-aware “open configuration” action on management credential errors outside the settings tab, and keep the error visible while focusing the credential field.
- Fail closed when the Svelte workbench calls a DSH RPC that is missing from the Electron method allowlist.
- Route conversation credential failures through the same settings focus path as the management banner, instead of wiping the error with a generic tab switch.
- Localize credential titles/hints, model capability labels, and tool activity cards through the workbench locale tables so English no longer shows leftover Chinese copy.

## 0.31.36 - 2026-09-04

### Fixed

- 恢复内置模型的构建期凭据注入：发布环境提供完整凭据时生成 `bundled.env`，并随 Windows 安装版、便携版发布。
- Electron 启动官方 DSH 后，通过 credentials service 导入内置网关 Key，已有用户凭据不会被覆盖。
- 禁止内置模型 Key 从用户电脑环境变量继承，避免不同机器环境导致认证行为不一致。

## 0.31.35 - 2026-09-03

### Changed

- 将工具调用改为面向用户的简洁状态卡，显示操作类别、动作和目标，隐藏内部协议参数。
- 工具结果、截图、终端输出默认收起，错误状态保留简短可执行提示。
- 精简活动记录面板，移除重复统计、执行队列和轨迹，仅保留任务计划与最近操作。
- 默认收起活动面板，把对话区域留给用户内容。

## 0.31.34 - 2026-09-03

### Fixed

- 修复会话消息内容被旧头像选择器压缩为 `28x28` 的问题。
- 修复工具消息内容被旧选择器隐藏的问题，恢复工具调用卡片、推理过程和长文本的完整显示。
- 精简会话流：移除上下文用量统计、消息序号和重复角色标签；成功工具调用默认折叠，仅保留必要结果。
- 过滤仅包含工具调用 JSON 的重复“推理过程”，避免内部协议细节干扰阅读。
- 工具调用改为面向用户的状态卡，仅展示动作、状态和必要摘要。

## 0.31.33 - 2026-09-03

### Changed
- **现代化极简界面重构 (Minimalist Workbench)**：
  - 参考 Codex Desktop、网易龙虾、zcode 等工程级客户端设计风格，全面升级中性冷灰黑设计语言与扁平视觉层级；
  - 精简顶栏至 42px，居中收纳工作区与会话标题，统一收纳新建、工作台、定制与语言切换，移除非必要长文本；
  - 隐藏冗余重复的头部大横幅，将垂直可视空间全部留给代码与消息流；
  - 侧边栏顶部增加高可见度“+ 新建会话”圆角胶囊主按钮，会话列表项支持悬停即显快捷归档；
  - 输入框升级为现代悬浮岛屿（Floating Island Composer），支持柔和微阴影、聚焦光晕与模型选择胶囊；
  - 消息流排版 Typography-first，优化用户圆角气泡与助手代码块排版，支持超细自定义平滑滚动条。

## 0.31.32 - 2026-09-03

### Fixed

- Eliminate desktop startup hang by queuing runtime readiness IPC across concurrent
  bootstrap passes, arming lightweight polling fallback, and strictly enforcing the
  70-second diagnostic timeout with manual retry.
- Strip internal protocol and policy suffixes from echoed user conversation messages
  to ensure clean prompt transcripts and prevent ghost or duplicated user bubbles.
- Cleanly reset pending state on conversation prompt cancellation.
- Bounded file removal retries in DSH runtime staging on Windows.

## 0.31.31 - 2026-09-03

### Fixed

- Filter internal runtime context and `<system-reminder>` directives (including
  workspace instruction sets and skill catalogs) from the conversation
  transcript so internal prompts never leak into user chat bubbles.
- Prevent ghost message bubbles when runtime emits empty finish chunks, and
  cleanly unpack nested turn error messages for clearer error surfacing.
- Synchronize composer input reset on message submission with error recovery,
  and restore missing `isProviderCredentialOptional` import in desktop shell.

## 0.31.30 - 2026-09-02

### Fixed

- Show the desktop window before the official DSH runtime finishes starting,
  bound each startup attempt to 30 seconds, and report actionable diagnostics
  instead of waiting indefinitely (#236).
- Add runtime restart IPC, request timeouts, and a localized retry surface while
  preserving the official DSH credential and session ownership boundaries (#236).

## 0.31.29 - 2026-09-02

### Fixed

- Clear management feedback and error banners on tab transitions to prevent
  cross-page message lingering in workbench (#235).
- Suppress empty assistant ghost message bubbles and prevent sender metadata
  vertical truncation (#234).
- Enforce brand green ring and border focus states across input controls and
  composer (#230).
- Align session error handling and credential state indicators (#233).

## 0.31.28 - 2026-09-02

### Fixed

- Support intranet and local LAN model endpoints (e.g. `xg-gomodel`) without
  enforcing external API keys or displaying false "missing key" banners (#234).
- Prevent transcript and streaming message truncation by preserving accumulated
  delta chunks and relaxing runtime context keyword filters (#234).
- Dismiss stale credential requirement errors immediately upon model selection
  or incoming assistant streaming events (#234).

## 0.31.27 - 2026-09-02

### Fixed

- Correctly recognize invalid or expired API key responses as 401 authentication
  failures instead of missing API key errors (#233).
- Sanitize user credentials by stripping surrounding quotes and whitespace on
  save in workbench and settings.
- Clear pending status and surface turn errors immediately on `turn/end` event
  to prevent session stuck in queued state.
- Align topbar runtime status and session list health state when active session
  encounters an error.

## 0.31.20 - 2026-09-02

### Added

- Added official DSH knowledge-base indexing workflows with guarded concurrent
  indexing and Svelte management surfaces.
- Bundled the audited BrowserSkill DSH plugin and CLI for Computer Use, plus
  OfficeCLI as a default DSH MCP integration.

### Fixed

- Stabilized conversation, project, workspace, multimodal attachment, and
  internal-model workflows across the Svelte desktop interface.
- Improved SMB mapping consistency, offline diagnostics, and configuration
  handling without persisting credentials.
- Added structured rendering for browser and Computer Use tool results and
  refined responsive, localized desktop interaction states.

## 0.31.1 - 2026-08-31

### Fixed

- Resolved CNB issue regressions across session management, model discovery,
  workspace browsing, Agent presets, and responsive management UI.

## 1.0.0 - 2026-08-25

### Changed

- Adopted Node 26, Electron, and the official `@deepseek-ai/dsh` package as the
  only supported runtime architecture.
- Reduced the Electron application to window security, loopback navigation, and
  official DSH child-process lifecycle management.
- Moved sessions, tools, approvals, credentials, workspaces, and persistence to
  the official DSH runtime.
- Replaced repository-owned UI and Harness packages with the official DSH Web
  profile and `profiles/anyong.yml` patch.
- Rebuilt CI, CodeQL, CNB validation, and Windows x64 packaging around the locked
  Node workspace.
- Reduced the Astro site and documentation to current product capabilities and
  supported distribution paths.

### Removed

- Retired runtime implementations, desktop bridges, duplicate renderer assets,
  service Workers, legacy distribution packages, and inactive release flows.
- Automated external source synchronization and publication workflows.

### Security

- Electron now denies new windows, unexpected navigation, browser permission
  checks, and browser permission requests.
- The managed DSH Web process binds to IPv4 loopback on an ephemeral port.
- Official DSH and native dependencies are unpacked for the managed
  Electron-as-Node child process.
