# 迁移到 VoltUI 1.0（Go 重写版）

<a href="./MIGRATING.md">English</a>

VoltUI 1.0 是一次从零开始的 **Go 重写**。它使用全新的代码库，并不是 `0.x` TypeScript 版本的增量升级。本文说明两个版本的差异以及迁移方法。

## 摘要

| | 旧版（v1） | VoltUI 1.0+（v2） |
| --- | --- | --- |
| 语言 | TypeScript / Node.js | Go |
| 分支 | [`v1`](https://github.com/zuohuadong/volt-gui/tree/v1)（仅维护） | `main`（默认、活跃开发） |
| 版本 | `0.x`（最高 v0.54.x） | `1.0.0`+ |
| 安装 | `npm i -g voltui`（`latest` 标签，固定在 `0.x`） | `npm i -g voltui@next` — `latest` 刻意固定在 `0.x`；也可使用 release 归档或源码构建 |
| 代码智能 | embedding 语义搜索 + tree-sitter 符号索引 | LSP 辅助代码读取，以及 grep/read_file/glob；语义索引尚未移植 |

“v1”和“v2”表示代码库代际，而不是 semver 主版本：v1 从未发布 1.0，因此 Go 重写版使用 `1.x` 版本号。

## 安装 1.0

`npm` 仍是主要安装渠道。npm 包会下载预编译的 Go 二进制文件，方式与 esbuild/biome 类似；二进制本身是独立的 Go 可执行文件，npm 不是运行时依赖。

**`npm i -g voltui` 会刻意安装 `0.x` 版本。** 直接安装——以及 `npx voltui` 和 0.53 自带的 `update`——都跟随 npm 的 `latest` 标签；我们把它固定在 `0.x` 线，避免现有用户在不知情时被拉到重写版。v1.x（Go）通过 `next` 标签发布，需要显式选择：

```sh
npm i -g voltui@next     # 或固定到某个版本：voltui@1.1.0
voltui
```

`latest` 在可预见的未来都会停留在 `0.x`，所以安装或更新 v2 始终意味着 `@next`（或固定到某个 `1.x` 版本）。

每个 GitHub release 都附带预编译归档（`voltui-<os>-<arch>.tar.gz` / `.zip`）和桌面安装包。它们与 npm 是不同的安装渠道：桌面安装包会部署独立的桌面/二进制构建，不会改动通过 `npm i -g` 安装的 CLI，因此两者可以共存——shell 里的 npm `0.53` 与 `1.x` 桌面应用并存是预期行为，不是冲突。也可以从源码构建：

```sh
git clone https://github.com/zuohuadong/volt-gui   # 默认分支 main（Go）
cd volt-gui && make build                        # -> bin/voltui(.exe)
```

## 配置

| 旧版 | VoltUI 1.0 |
| --- | --- |
| TypeScript 配置文件 | 项目使用 `voltui.toml`；从 v1.8.1 起，全局配置为 VoltUI home 下的 `config.toml`（macOS/Linux：`~/.voltui/`；Windows：`%AppData%\voltui\`）。参见 `voltui.example.toml` 和[配置路径](./CONFIG_PATHS.zh-CN.md) |
| 环境变量 / API key | provider 配置保留 `api_key_env`；保存的 key 位于 VoltUI home 的 `.env`（`DEEPSEEK_API_KEY`、`MIMO_API_KEY` 等） |
| 项目记忆 | `VOLTUI.md` / 旧版 `REASONIX.md`（含自动记忆），兼容 Claude Code |
| MCP server | 在 `voltui.toml` 中使用 `[[plugins]]`，或直接读取 Claude Code 的 `.mcp.json` |

首次启动时，v1.8.1+ 会执行一次**非破坏性**导入。它会读取以下旧配置：

- `~/Library/Application Support/voltui/config.toml`
- `~/.config/voltui/config.toml`
- `~/.voltui/voltui.toml`
- v0.x 的 `~/.voltui/config.json`

导入内容包括 API key、base URL、语言和 MCP server；缺失的旧凭据会迁移到 `<VoltUI home>/.env`，旧会话也会从历史目录导入。原文件不会被修改，VoltUI 会在导入后显示启动提示。每个会话会回到它原本所属的工作区（从 v0.x sidecar 元数据读取，摘要沿用为标题），因此桌面侧边栏会把会话列在正确的项目下；工作区已不存在的会话会进入全局会话目录。可通过 `--resume` 或历史面板恢复这些会话。自动配置导入仅在尚未存在 v1.8.1+ 配置时运行；如果你在旧路径就绪之前就打开了 v1.8.1+ CLI/桌面构建，新配置已生成、不会被覆盖，需要手动补入缺失值。

如果自动导入因你过早打开 v1.8.1+ 构建而漏掉了数据，可在交互式会话中运行 `/migrate`。该命令仅在包含它的 Go 版 VoltUI 构建中可用；若看到 `unknown command`，请先升级。它会打印进度，检查旧配置与凭据、扫描旧记忆和会话目录、导入此前未导入的记忆文件和会话，并汇总结果。`/migrate` 沿用与启动迁移相同的安全规则：不会覆盖已有 `config.toml` 或记忆文件，尊重会话导入标记，并且在旧的 0.x TypeScript 版本中不可用。如果旧 v0.x 会话位于自定义 Windows 安装/数据目录，可指定来源：

```text
/migrate --from "D:\OldVoltUI"
```

完整路径和限制见[配置路径](./CONFIG_PATHS.zh-CN.md)。

## Reasonix → VoltUI 命名映射

VoltUI 由 Reasonix 改名而来。旧安装通过 `internal/config/paths.go` 中逐项的兼容回退继续可用；新配置应使用 VoltUI 名称。当两者同时设置时，VoltUI 名称优先，Reasonix 名称仅作为回退读取。

| 类别 | Reasonix（旧） | VoltUI（当前） | 回退行为 |
|---|---|---|---|
| 产品 / 品牌 | Reasonix | VoltUI | `VOLTUI_BRAND_NAME` > `REASONIX_BRAND_NAME` > 编译默认 |
| 项目记忆文件 | `REASONIX.md` | `VOLTUI.md` | 两者均加载；`AGENTS.md` / `CLAUDE.md` 也被接受 |
| 项目配置文件 | `reasonix.toml` | `voltui.toml` | 项目内 `voltui.toml` 优先 |
| Home 目录 | `~/.reasonix` | `~/.voltui`（Windows 为 `%AppData%\voltui`） | — |
| Home 环境变量 | `REASONIX_HOME` | `VOLTUI_HOME` | 先 `VOLTUI_HOME`，再 `REASONIX_HOME` |
| State 环境变量 | `REASONIX_STATE_HOME` | `VOLTUI_STATE_HOME` | 先 `VOLTUI_STATE_HOME`，再 `REASONIX_STATE_HOME` |
| Cache 环境变量 | `REASONIX_CACHE_HOME` | `VOLTUI_CACHE_HOME` | 先 `VOLTUI_CACHE_HOME`，再 `REASONIX_CACHE_HOME` |
| Theme 环境变量 | `REASONIX_THEME` | `VOLTUI_THEME` | 单次运行覆盖 |
| Language 环境变量 | `REASONIX_LANG` | `VOLTUI_LANG` | 单次运行覆盖 |
| Brand 环境变量 | `REASONIX_BRAND_NAME` | `VOLTUI_BRAND_NAME` | 先 `VOLTUI_BRAND_NAME`，再 `REASONIX_BRAND_NAME` |
| 约定目录 | `.reasonix/` | `.voltui/` | `.voltui` 最高；`.agents` / `.agent` / `.claude` 也被扫描 |
| 二进制 / 命令 | `reasonix` | `voltui` | — |
| 插件前缀 | `reasonix-plugin-` | `voltui-plugin-` | — |
| npm 包 | `reasonix` | `voltui` | — |

双名回退仅为了让现有 Reasonix 用户在不丢数据的前提下升级；新安装和新文档应只使用 VoltUI 名称。不要在代码或文档中引入新的 `REASONIX_*` 引用——当你改动某个文件时，把它迁移到 VoltUI 名称。

## Context Engine v2 升级

指令与记忆升级会自动完成，不需要 setup mode、re-index 命令或新配置：

| 现有数据 | 升级行为 |
| --- | --- |
| `VOLTUI.md`、`REASONIX.md`、`AGENTS.md`、`CLAUDE.md` | 作为常驻指令加载，并附带来源、目录、precedence、imports 和 diagnostics；原文件名继续有效。 |
| 嵌套指令文件 | 从 workspace root 解析到当前目标路径；同一目录内 `.local.md` 优先，更深目录仍高于更浅目录。 |
| 没有 `id` / `revision` 的旧事实 | 获得确定性的 scope-aware `legacy-*` ID，并从 revision 1 开始；migration 幂等。 |
| 没有 `metadata.scope` 的旧事实 | 根据原本拥有该文件的 project/global 目录推导 scope。 |
| 现有 `MEMORY.md` | 作为派生 index，根据 active fact 文件重建；陈旧手写条目不会变成事实。 |
| 现有 active facts | 保持 active，之后发生修改时才开始产生 revision history。 |
| 现有 archive entries | 继续排除在 recall 外，可从 Context Center 或 `/memory recover` 显式恢复。 |
| 旧 Memory v5 transcript | 继续可读；preview 会从 `<memory-compiler-execution>` 恢复原始用户提示。 |
| `[agent].memory_compiler` | 已退役，由既有一次性配置 migration 清除。 |

升级后第一次当前版本启动会补齐缺失的 identity/time metadata，不修改 fact body。若新旧版本
共享同一 state root，兼容路由字段会避免旧客户端把事实移到错误 scope 目录。

升级后请使用诊断命令，不要手工修改 migration state：

```text
/memory
/memory instructions
/memory recall
/memory revisions <id-or-name>
/memory archived
```

新的相关事实会自动召回。只有有界、非敏感、纯创建的 project/reference 事实可以免确认保存；
全局事实、偏好、feedback、更新、重复项、敏感内容和所有归档操作仍是显式用户决定。桌面
Suggestions tab 会自动扫描，但候选在用户接受前绝不会写入。

完整 precedence、freshness、恢复、cache、隐私与远程 workspace 契约见
[Context Engine v2](./SESSION_MEMORY_RETRIEVAL.zh-CN.md)。

## 保持不变的部分

agent 核心延续了原有能力：循环、读写编辑与 glob/grep/bash 等工具、子智能体（`task`、explore/research/review）、Skill、Hook、Plan 模式、MCP 客户端，以及针对 DeepSeek 前缀缓存的设计。

## 主要变化

- **代码智能**：Go 重写版通过 LSP 辅助代码读取，并结合 `grep`、`read_file` 和 `glob` 理解本地代码。v1 的语义搜索与 tree-sitter 符号索引尚未移植，CodeGraph 也不再以内置 MCP server 形式提供。
- **Plan 模式**：新增 `complete_step`，用于基于证据确认步骤完成。
- **MCP 项目身份与 schema 缓存 URL 感知凭据**：userinfo 和 token/api_key/password 等查询值不会进入项目运行身份摘要或 schema 缓存键，因此轮换凭据不会改变项目运行时/缓存身份。用户安装的 server 不计算项目身份摘要；已配置 MCP 不再需要旧的启动或逐工具授权回执。
- **MCP 添加后即可使用**：用户通过桌面端、CLI、全局配置、旧配置导入或主动安装插件包添加的 server 默认可信，全局安装统一写入 `config.toml`。仓库内 `voltui.toml` / `.mcp.json` 声明保留在项目中，同样无需额外启动确认。同名时项目覆盖全局，项目内部 `voltui.toml` 高于 `.mcp.json`。打开陌生仓库等同于接受其中可执行的项目配置；启动 VoltUI 前应检查 `.voltui/settings.json`、`voltui.toml` 和 `.mcp.json`。如果仓库引发异常的 MCP 或 Hooks 行为，可用安全模式重新启动，在恢复期间禁用这些外部集成。
- **stdio MCP 连接持久化**：writer 调用不再创建新进程，浏览器或会话类 server 的状态可以保留。
- **Plan 与权限策略相互独立**：普通内置工具和 Bash 仍遵循 Ask/Auto/YOLO 与 Sandbox；已安装或代理解析的 MCP 写入/破坏性工具，以及来自未授权 server 的读取工具，在整个规划阶段保持阻止。`complete_step` 等执行阶段工具也要等计划获批后才能使用。
- `plan_mode_read_only_commands` 仍可解析和保存，以兼容旧配置，但不再决定主 Plan 流程能否调用工具。安装或通过项目配置声明 MCP server 后，其非破坏性的 `readOnlyHint` 工具会自动进入 planner 与只读子智能体，不需要逐工具信任配置。
- 使用 `read_only_task` / `read_only_skill` 创建技术上只读的子智能体；普通 `task` / `run_skill` 仍可写入，并受权限与 Sandbox 控制。未声明 `readOnlyHint` 的 MCP 工具仍按 writer 处理。
- `default_tools_approval_mode`、`tools.<raw>.approval_mode` 和 `approvals_reviewer` 已停用，加载时忽略并在下次保存时移除；安装或通过项目配置声明 server 后，其所有工具直接可用。
- **没有 Web Dashboard** —— v2 线按设计只有终端 + 桌面（Electron/DSH）。
- 一些细粒度 v1 工具被合并，例如文件管理操作改由 `bash` 完成；少数工具尚未移植，进度在 Discussions 中跟踪。

## 文件编码

VoltUI 1.0 支持读取和编辑 UTF-8、UTF-8 BOM、UTF-16 LE/BE 与 GB18030（GBK 的超集），与 v1 行为一致。

- `read_file` 会把受支持编码解码为 UTF-8 后提供给模型。
- `edit_file` 和 `multi_edit` 会保留文件原编码；编辑 GB18030 文件后仍以 GB18030 保存。
- `write_file` 始终写入 UTF-8。
- `grep` 会在匹配前解码，因此正则表达式可用于非 UTF-8 文件。

## 报告问题

Issue 和 PR 按代码线标记：**`v1`** 表示旧 TypeScript 版，**`v2`** 表示 Go 版。请按实际使用版本提交报告。旧 `v1` 线处于维护模式，只接收 bug 修复，不再新增功能。

如有问题，请发起 [Discussion](https://github.com/zuohuadong/volt-gui/discussions)。
