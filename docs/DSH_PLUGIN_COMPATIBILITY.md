# Volt DSH Plugin Compatibility

内置插件审计日期：2026-09-15。未引入的社区候选插件仍为历史评估版本，不表示当前最新版。

## 官方运行时

2026-09-10 查询 npm registry：`@deepseek-ai/dsh` 的 `latest` 与 `next` 均为 `0.1.5-rc.1`，`alpha` 为 `0.1.5-alpha.2`。Volt 不把 Alpha 当作可复现的稳定升级。

Volt 已精确锁定 `0.1.5-rc.1`。桌面已迁移到启动 token 换 Cookie、HTTP Remote RPC、`/api/remote.mux`、`$events`、`session/follow` 与 `session/control`，不保留旧协议双栈。迁移结果见 `docs/DSH_UPGRADE_REVIEW_2026-09-10.md`。

## 第三方插件审计

| 包 | 版本 | 结论 | 原因 |
| --- | --- | --- | --- |
| `dsh-workbench` | `0.11.0` | 暂不引入 | MIT，但包含 React client、独立文件 host API 和自己的 workspace/watch/history 状态；会和 Volt 的 Svelte 工作台及官方 DSH 工作区能力重复。 |
| `dsh-better-sidebar` | `0.17.1` | 暂不引入 | MIT，但包含 React renderer、`node-pty`、文件/Git/浏览器/任务服务和独立设置持久化；超出 Volt 的单一官方 DSH 运行时边界。 |
| `dsh-ide-sidebar` | `0.1.1` | 暂不引入 | 仅 React Web sidebar 注入，不能挂载到 Volt 的本地 Svelte renderer。 |
| `dsh-conversation-navigator` | `0.2.1` | 暂不引入 | 仅官方 Web conversation 注入，Volt 已在本地 renderer 管理会话导航。 |
| `@tecfancy/dsh-dock-terminal` | `0.5.3` | 暂不引入 | 带 `node-pty` 和 React client；会建立第二个终端呈现/权限面。 |
| `dsh-localqwen-rolefix` | `1.0.3` | 观察名单 | Host-only Profile Bundle，MIT；依赖 pi-ai 内部 model descriptor，需针对 Volt 的本地 provider 做真实回归后才能启用。 |
| `@wxg-prc-cpg/browser-skill-dsh-plugin` | `0.2.1` | 默认内置 | 腾讯 BrowserSkill 的 DSH 原生 Profile Bundle，MIT；Host 侧只是 `bsk --json` 的结构化桥接，不复制会话、权限或持久化。 |
| `@officecli/officecli` | `1.0.149` | 默认内置 | Apache-2.0；没有 DSH Profile Bundle，但原生提供 `officecli mcp` stdio server，因此由官方 `@deepseek-ai/dsh-mcp-client` 接入，不复制 Office 文档引擎。 |
| `@wxg-prc-cpg/dsh-weknora` | `0.1.0` | 默认内置 | 腾讯 WeKnora 官方只读 DSH 插件，MIT；提供知识库列表、混合检索、文档读取和带引用的 RAG 问答，不实现本地知识库运行时。 |

## 浏览器与 Computer Use 评估

| 方案 | 审计版本 | 适用场景 | Volt 结论 |
| --- | --- | --- | --- |
| BrowserSkill DSH plugin | `0.2.1` | 借用用户已登录的 Chrome/Edge 标签页、语义观察、截图、受控点击输入、多会话 | 默认采用。保持 `lazyTools: true`，浏览器扩展离线时 fail closed。 |
| Playwright MCP | `0.0.80` | 隔离 Chromium、accessibility snapshot、确定性网页回归 | 保留为测试候选，不与 BrowserSkill 同时默认启用。 |
| Chrome DevTools MCP | `1.8.0` | Chrome 网络、Console、性能和 DevTools 诊断 | 仅按需启用；远程调试端口扩大控制面。 |
| Nuphus MCP | `0.2.2` | 桌面鼠标键盘与浏览器的完整 Computer Use | 暂不接入。需先审计平台二进制、权限边界、坐标操作和人工接管。 |

采用 BrowserSkill 的理由：

1. 桌面与 CLI 在首次启动前把随包发布的固定版本离线 provision 到官方 DSH `web`/`headless` Profile；仍使用插件自带的 `dsh.bundle` 和 `cordis.patch.yml`，不改变 DSH 的会话、工具与权限权威。
2. `browser_session`、`browser_page`、`browser_inspect`、`browser_interact`、`browser_tabs`、`browser_assist` 使用结构化参数；任意页面脚本执行未暴露给模型。
3. 默认延迟公开工具 schema，适合内网模型与有限上下文；真实浏览器连接由 BrowserSkill daemon 和扩展管理。
4. 本地 Svelte 工作台只读取官方 `pluginInventory/list` 并呈现插件状态，不加载或复制第三方 Web renderer。

仓库记录了精确版本、许可证、npm SHA-512 与平台二进制 SHA-256。桌面包默认包含 `bsk 0.2.1`；安装与诊断命令：

```bash
pnpm run setup:browser-skill
pnpm run check:browser-skill
pnpm run doctor:browser-skill
```

`bsk` CLI 已随桌面包内置，Chrome/Edge BrowserSkill 扩展仍需用户安装并连接。`setup` 重新校验并 staging 固定版本，`check` 验证 CLI 和两个官方 DSH Profile，`doctor` 进一步验证 daemon、协议及扩展连接；扩展离线时真实浏览器调用明确失败。不要把本机 `bskPath`、用户 Profile 或浏览器状态提交到仓库。

## OfficeCLI 接入

OfficeCLI `1.0.149` 已验证 MCP 激活与凭据隔离；空白 DOCX、XLSX、PPTX 的创建/读取/关闭能力沿用前版验收，本轮不宣称覆盖复杂文档转换和排版。其 npm 包没有 `dsh.bundle`，但 CLI 原生提供 MCP server，所以默认 Profile 通过官方 DSH MCP client 启动：

```text
node officecli.js mcp
```

桌面发行包同时 staging OfficeCLI JavaScript launcher 与平台二进制。Svelte 插件页以 `mcp-officecli` entry id 呈现为“OfficeCLI 文档处理”，实际工具注册、超时、中止和结果投影仍由官方 DSH 负责。

## WeKnora 接入

WeKnora `0.1.0` 由 CLI 和 Electron 在启动前离线 provision 到官方 `web`/`headless` Profile，默认 `profiles/anyong.yml` 只覆盖部署配置。两条运行路径都携带同一份锁定依赖。插件只读 WeKnora，不执行导入、修改或删除；凭据和地址通过环境变量注入，不写入 profile：

```text
WEKNORA_BASE_URL=http://localhost:8080/api/v1
WEKNORA_ALLOWED_HOSTS=
WEKNORA_API_KEY=<由安全配置注入>
WEKNORA_TENANT_ID=<平台密钥需要时设置>
WEKNORA_KNOWLEDGE_BASE_IDS=kb-product-docs,kb-team
WEKNORA_AGENT_ID=<可选的 WeKnora Agent>
```

未设置知识库 ID 时由 WeKnora 按当前凭据解析可访问知识库。检索和文档读取默认使用 `retrieve` 权限；`weknora_ask` 还需要 `chat` 权限。外部知识内容按不可信输入处理，任何代码、部署或任务状态写操作仍需官方 DSH 权限确认。

## 外部系统集成

`scripts/anyong-integrations-mcp.mjs` 是一个通过官方 `@deepseek-ai/dsh-mcp-client` 挂载的窄接口 MCP 适配器。它只提供受限的读取工具和本地文档抽取，不复制 DSH 的会话、权限或持久化实现。Profile 中的命名空间如下：

| 命名空间 | 能力 | 默认状态 |
| --- | --- | --- |
| `github` | 代码搜索、Issue、PR 读取 | 关闭 |
| `cnb` | 构建/流水线状态、日志读取、失败摘要 | 关闭 |
| `sentry` | Issue、事件与错误检索 | 开启，可显式关闭 |
| `feishu` | 审批查询；通知发送是独立写工具 | 关闭 |
| `document_import` | PDF、DOCX/XLSX/PPTX 文本抽取、可选 OCR、WeKnora 入库 | 开启，可显式关闭 |

通过 `ANYONG_GITHUB_ENABLED=1`、`ANYONG_CNB_ENABLED=1` 或 `ANYONG_FEISHU_ENABLED=1` 在明确批准的环境中逐项开启。Web 检索同样由 `ANYONG_WEB_RETRIEVAL_ENABLED=1` 显式开启，默认拒绝。Sentry 与文档导入默认启用，可分别设置 `ANYONG_SENTRY_ENABLED=0`、`ANYONG_DOCUMENT_IMPORT_ENABLED=0` 关闭。

GitHub、CNB、Sentry 和飞书的凭据只通过环境或官方 DSH credentials 注入；适配器不会把 token 放进返回值或错误文本。CNB 的流水线/日志路径可用 `CNB_PIPELINES_PATH` 与 `CNB_LOGS_PATH` 覆盖，以适配不同租户的 API 版本。Sentry 使用 `SENTRY_BASE_URL`、`SENTRY_ORG` 与 `SENTRY_AUTH_TOKEN`。飞书使用租户 token，或 `FEISHU_APP_ID`/`FEISHU_APP_SECRET` 换取租户 token。

飞书通知必须同时满足 `ANYONG_FEISHU_WRITE_ENABLED=1`、工具参数 `confirm=true` 和官方 DSH 审批；WeKnora 入库必须设置 `WEKNORA_INGEST_URL`、`ANYONG_WEKNORA_INGEST_ENABLED=1`、知识库 allowlist，并传入 `confirm=true`。文件导入限制在 `ANYONG_IMPORT_ROOT` 下的普通文件，单文件上限 25 MiB，输出和日志均有界截断。真实租户联调需要由部署方提供凭据、API 路径和 OCR 命令，本地 CI 只运行 mock transport 测试。

## 旧版插件迁移

本次自动迁移仅允许仓库此前内置的 BrowserSkill `0.1.2` 或 `0.2.0` 升级到 `0.2.1`，分别作用于官方 `web`、`headless` Profile。未知版本、较新用户版本和旧包符号链接拒绝覆盖。升级前应关闭使用同一 Profile 的暗涌、DSH 和 CLI，备份整个用户 DSH_HOME；不要在旧进程仍加载插件时迁移。

迁移保留 Profile 中的自定义 dependencies、bundles、扩展字段和 `cordis.patch.yml`。新包在临时目录验证完整性后切换；旧包和原始 manifest 留在：

```text
<DSH_HOME>/profiles/<profile>/node_modules/@wxg-prc-cpg/browser-skill-dsh-plugin.backup-<旧版本>
<DSH_HOME>/profiles/<profile>/node_modules/@wxg-prc-cpg/browser-skill-dsh-plugin.backup-<旧版本>.profile.json
```

同一 Profile 的迁移使用排他锁，覆盖读取、备份、提交与回滚。manifest 提交失败会先隔离新包，再恢复旧包，清理中断不会半删除正在使用的插件。旧包已备份但尚未换入新包时，下次尝试会先恢复旧包。备份 manifest 也通过临时文件原子提交；迁移重复运行不重复添加插件。

**异常退出恢复：** `.anyong-browser-skill.lock` 不按超时或 PID 自动抢占。确认所有使用此 Profile 的暗涌/DSH 进程已退出、完成 DSH_HOME 备份后，才可移除该 Profile 下的锁文件并重新启动。遗留的 `*.tmp`、`*.rollback` 是未生效的暂存目录，先保留用于排障，不要删除有效插件或备份。此机制保护进程并发与常见中断，不承诺磁盘损坏或断电级事务持久性。

**人工回退：** 停止所有相关进程并备份当前 Profile；将新插件目录另存，从上述备份恢复旧插件及 Profile 的 `package.json`，再运行旧版发行包。不要只改 manifest 版本号，也不要用新版发行包验证回退，否则它会再次尝试升级。本轮不自动回退 DSH 的用户数据库。

`pnpm run test:dsh-upgrade` 是显式迁移验收，需将 `DSH_UPGRADE_FROM` 指向预先保留的完整旧部署（DSH `0.1.1-rc.2` + BrowserSkill `0.1.2`）。它不是普通全新检出的默认测试；重新 stage 之前必须先保留旧部署。测试在临时 DSH_HOME 验证会话可发现、历史事件及标题、凭据、设置、Profile 扩展和两次重启，绝不使用真实用户目录。冷会话列表可缺少标题缓存，因此数据验证使用官方历史恢复投影。

BrowserSkill CLI 升级不等于浏览器扩展已升级。本轮没有修改用户浏览器扩展、登录态或既有 daemon；真实浏览器连接需用户完成扩展适配后运行 `doctor:browser-skill` 验收。

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
