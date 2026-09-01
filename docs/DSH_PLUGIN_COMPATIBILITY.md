# Volt DSH Plugin Compatibility

审计日期：2026-09-01

## 官方运行时

`@deepseek-ai/dsh` 的 npm `latest` 与 `next` 当前均为 `0.1.1-rc.2`，`alpha` 为 `0.1.2-alpha.4`。Volt 不把 Alpha 当作可复现的稳定升级。Volt 已精确锁定 `0.1.1-rc.2`，升级必须同时通过 DSH 集成、Electron 边界和打包运行时验证。

## 第三方插件审计

| 包 | 版本 | 结论 | 原因 |
| --- | --- | --- | --- |
| `dsh-workbench` | `0.11.0` | 暂不引入 | MIT，但包含 React client、独立文件 host API 和自己的 workspace/watch/history 状态；会和 Volt 的 Svelte 工作台及官方 DSH 工作区能力重复。 |
| `dsh-better-sidebar` | `0.17.1` | 暂不引入 | MIT，但包含 React renderer、`node-pty`、文件/Git/浏览器/任务服务和独立设置持久化；超出 Volt 的单一官方 DSH 运行时边界。 |
| `dsh-ide-sidebar` | `0.1.1` | 暂不引入 | 仅 React Web sidebar 注入，不能挂载到 Volt 的本地 Svelte renderer。 |
| `dsh-conversation-navigator` | `0.2.1` | 暂不引入 | 仅官方 Web conversation 注入，Volt 已在本地 renderer 管理会话导航。 |
| `@tecfancy/dsh-dock-terminal` | `0.5.3` | 暂不引入 | 带 `node-pty` 和 React client；会建立第二个终端呈现/权限面。 |
| `dsh-localqwen-rolefix` | `1.0.3` | 观察名单 | Host-only Profile Bundle，MIT；依赖 pi-ai 内部 model descriptor，需针对 Volt 的本地 provider 做真实回归后才能启用。 |
| `@wxg-prc-cpg/browser-skill-dsh-plugin` | `0.1.2` | 采用（可选） | 腾讯 BrowserSkill 的 DSH 原生 Profile Bundle，MIT；Host 侧只是 `bsk --json` 的结构化桥接，不复制会话、权限或持久化。 |

## 浏览器与 Computer Use 评估

| 方案 | 审计版本 | 适用场景 | Volt 结论 |
| --- | --- | --- | --- |
| BrowserSkill DSH plugin | `0.1.2` | 借用用户已登录的 Chrome/Edge 标签页、语义观察、截图、受控点击输入、多会话 | 默认采用。保持 `lazyTools: true`，浏览器扩展离线时 fail closed。 |
| Playwright MCP | `0.0.80` | 隔离 Chromium、accessibility snapshot、确定性网页回归 | 保留为测试候选，不与 BrowserSkill 同时默认启用。 |
| Chrome DevTools MCP | `1.8.0` | Chrome 网络、Console、性能和 DevTools 诊断 | 仅按需启用；远程调试端口扩大控制面。 |
| Nuphus MCP | `0.2.2` | 桌面鼠标键盘与浏览器的完整 Computer Use | 暂不接入。需先审计平台二进制、权限边界、坐标操作和人工接管。 |

采用 BrowserSkill 的理由：

1. 通过官方 `dsh plugin --profile web add` 安装，不改变 DSH 的会话、工具与权限权威。
2. `browser_session`、`browser_page`、`browser_inspect`、`browser_interact`、`browser_tabs`、`browser_assist` 使用结构化参数；任意页面脚本执行未暴露给模型。
3. 默认延迟公开工具 schema，适合内网模型与有限上下文；真实浏览器连接由 BrowserSkill daemon 和扩展管理。
4. 本地 Svelte 工作台只读取官方 `pluginInventory/list` 并呈现插件状态，不加载或复制第三方 Web renderer。

仓库记录了精确版本、MIT 许可证与 npm SHA-512 完整性。安装与诊断命令：

```bash
pnpm run setup:browser-skill
pnpm run check:browser-skill
pnpm run doctor:browser-skill
```

`bsk` CLI 与 Chrome/Edge BrowserSkill 扩展是外部前置条件。`check` 验证 CLI 和 DSH Profile；`doctor` 进一步验证 daemon、协议及扩展连接。不要把本机 `bskPath`、用户 Profile 或浏览器状态提交到仓库。

## 采用原则

Volt 只接受以下插件：

1. 通过官方 `dsh plugin --profile <profile> add` 安装的 Profile Bundle。
2. 不携带第二套 renderer、会话、工作区、凭据、权限或持久化实现。
3. 不要求 Electron 直接访问文件系统或 Git；原生能力必须经过现有安全边界。
4. 精确锁版本、记录许可证和完整性信息，并在分发 bundle 中可复现。

因此不引入第三方 Web 工作台。现有 Volt 功能已经覆盖文件引用、文件浏览、会话/检查点、插件清单、SMB 和界面自定义；BrowserSkill 仅补充浏览器工具能力，不取代 Svelte 工作台或官方 DSH 运行时。

DSH 的社区 Generative UI 实践证明了 DSH 可以让模型生成交互界面。Volt 采用相同的“模型产出声明式界面规格”思路，但保持 Svelte/svadmin 技术栈：模型只生成 `@svadmin/surface` JSON proposal，Volt 按 catalog 和 policy 校验，用户确认后再由 `SurfaceRenderer` 渲染。任何原始 HTML、CSS、JavaScript、Svelte、SQL、URL 或 mutation 都会被拒绝。

## 后续引入门槛

若要启用观察名单插件，先在隔离 profile 中执行：

```bash
dsh plugin --profile web add dsh-localqwen-rolefix@1.0.3
```

然后使用 Volt 的真实 provider、`pnpm run test:dsh-integration` 和打包 smoke 验证；任何兼容性失败都应移除插件，而不是在 Volt 内复制其实现。
