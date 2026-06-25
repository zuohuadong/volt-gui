<p align="center">
  <img src="docs/logo.svg" alt="VoltUI" width="640"/>
</p>

<p align="center">
  <a href="./README.md">English</a>
  &nbsp;·&nbsp;
  <strong>简体中文</strong>
  &nbsp;·&nbsp;
  <a href="./docs/CHECKPOINTS.md">检查点</a>
  &nbsp;·&nbsp;
  <a href="./docs/SPEC.md">规格</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/voltui.svg?style=flat-square&color=8b949e&labelColor=161b22" alt="license"/></a>
</p>

<br/>

<h3 align="center">面向企业内网的 AI coding agent。</h3>
<p align="center">离线优先、多模型、Windows 10 开箱即用 —— 打包一次，内网全员上手。</p>

<br/>

## VoltUI 解决什么问题？

VoltUI 专为**内网部署大模型的企业**打造 —— 在防火墙内运行 Qwen、DeepSeek、GLM 或私有模型的团队，
需要的是一个无需联网、开箱即用的 AI 编程助手。

| 痛点 | VoltUI 的方案 |
|------|---------------|
| 公网 Agent 必须联网 | **离线优先** —— 运行时零网络依赖 |
| 只支持单一模型 | **任意 OpenAI 兼容 API** —— 每个模型一行配置 |
| 大规模部署困难 | **单二进制** —— 打包时内置 API 地址和 Key，下发即用 |
| 工具只支持 Linux | **Windows 10 优先**，其次 macOS —— Edge 开箱即用 |
| 无法浏览内部文档站 | **内置无头浏览器**，JS 重度页面也能渲染提取 |

## 核心特性

- **多模型支持。** DeepSeek、通义千问、智谱 GLM、Claude、MiMo、Ollama、vLLM —— 任何
  OpenAI 兼容或 Anthropic 端点，一个 `[[providers]]` 配置项即可，无需改代码。双模型协同
  （执行器 + 规划器）一行配置开启。
- **离线 / 内网就绪。** 无 npm、无自动下载、无遥测回传，完全在防火墙内运行。浏览器自动化
  直接用 Windows 10 自带的 Edge。
- **打包即部署。** 构建时将 API 地址和 Key 嵌入二进制或配置文件 —— 分发一个开箱即用的包给
  每位开发者，无需配置向导。
- **Windows 10 优先。** Microsoft Edge（Chromium 内核）是 Win10 自带 —— `browser_navigate`
  零配置可用。Windows 路径检测、RDP/VDI 友好。macOS 和 Linux 同样支持。
- **配置驱动。** Provider、工具、权限、插件全部在 `voltui.toml` 中声明，无硬编码模型。
  一个文件管一个团队，直接提交到仓库。
- **插件驱动 (MCP)。** 外部工具通过 stdio JSON-RPC 或 HTTP 运行。兼容 MCP 生态 ——
  放一个 `.mcp.json` 即可。
- **企业资源挂载规划。** 桌面端企业网络盘能力按平台/产品边界拆分，通用挂载生命周期留在
  Volt GUI，业务策略由下游产品提供。详见 [docs/ENTERPRISE_MOUNTS.md](docs/ENTERPRISE_MOUNTS.md)。
- **代码智能 (CodeGraph)。** 基于 tree-sitter 的符号/调用图搜索
  (`codegraph_*` 工具) —— 无需嵌入服务，零 API 成本。首次使用自动下载，后台索引。
- **检查点与回退。** 基于快照的编辑安全网 —— 按 Esc-Esc 或 `/rewind` 撤销任何改动。
  详见 [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md)。
- **技能与钩子。** Claude-Code 风格的技能 (`.voltui/skills/`) 和钩子
  (`PreToolUse`/`PostToolUse`/`Stop`)，用于工作流自动化。
- **规划模式。** 基于证据的步骤签署 (`complete_step`) —— 智能体提议，你审批。
- **记忆。** `VOLTUI.md` 层级 + 自动记忆存储，折叠进缓存稳定前缀，跨会话保持上下文。
- **单一静态二进制。** `CGO_ENABLED=0` —— 一个文件、无运行时依赖、交叉编译 6 个平台。

## 安装

### 预构建（推荐企业统一下发）

```sh
npm i -g voltui                  # 任意系统;自动拉取对应平台的原生二进制
```

### 从源码构建

```sh
make build      # -> bin/voltui(.exe)
make cross      # -> dist/（darwin|linux|windows × amd64|arm64）
```

## 快速开始

### 公网（使用外部 API）

```sh
voltui setup                      # 配置向导 → ./voltui.toml
export DEEPSEEK_API_KEY=sk-...  # 或写入 .env
voltui chat
```

### 内网（使用私有模型端点）

```sh
# 编辑 voltui.toml，指向内网模型服务
voltui chat                       # 无需联网，直接使用
```

### 打包部署（终端用户零配置）

```sh
# 管理员：构建时嵌入配置
cp voltui.example.toml voltui.toml
# 编辑 voltui.toml：设置 base_url 为内网端点、api_key 为内置 Key
make build
# 将 bin/voltui.exe 分发给每位开发者 —— 双击即用
```

## 配置

优先级：**flag > `./voltui.toml` > `~/.config/voltui/config.toml` > 内置默认值**。

### 多模型配置

```toml
default_model = "qwen"   # 默认使用内网模型
# language    = "zh"     # 界面语言；为空则自动检测

# 内网通义千问 (DashScope / vLLM / Ollama)
[[providers]]
name           = "qwen"
kind           = "openai"
base_url       = "http://10.0.1.100:8000/v1"   # 内网地址
model          = "qwen3-235b-a22b"
api_key_env    = "QWEN_API_KEY"
context_window = 131072

# 内网 DeepSeek
[[providers]]
name           = "deepseek"
kind           = "openai"
base_url       = "http://10.0.1.100:8001/v1"
models         = ["deepseek-v4-flash", "deepseek-v4-pro"]
priority       = 10   # 多个渠道暴露同名模型时，裸模型名优先走更高优先级
api_key_env    = "DEEPSEEK_API_KEY"
context_window = 1000000

# 内网智谱 GLM
[[providers]]
name           = "glm"
kind           = "openai"
base_url       = "http://10.0.1.100:8002/v1"
model          = "glm-4-plus"
api_key_env    = "GLM_API_KEY"
context_window = 128000

# Claude（如有 Anthropic 访问权限）
[[providers]]
name           = "claude"
kind           = "anthropic"
model          = "claude-opus-4-8"
api_key_env    = "ANTHROPIC_API_KEY"
context_window = 1000000
```

如果多个渠道都暴露同一个模型名，推荐在 UI 中选择完整的 `provider/model`，或给渠道设置不同的 `priority`。裸模型名只有在最高优先级唯一时才会自动解析；并列时会报错并提示改用完整引用，避免静默走错渠道。

### 打包部署（内置 Key）

企业统一下发时，将 API 地址和 Key 直接嵌入配置，开发者无需任何设置：

```toml
# voltui.toml — 打包进分发 ZIP
default_model  = "company-llm"

[[providers]]
name        = "company-llm"
kind        = "openai"
base_url    = "http://llm.internal.company.com/v1"
model       = "qwen3-235b-a22b"
api_key_env = "COMPANY_LLM_KEY"   # 或在 .env 中设默认值

[permissions]
mode  = "ask"   # 内网可信团队可设为 "allow"
```

然后将 `voltui.exe` + `voltui.toml` + `.env` 打成 ZIP 下发。

### 白标 / OEM 品牌定制

替换产品名称和 Logo，无需重新编译：

```toml
# voltui.toml
[brand]
name        = "银河助手"                             # 窗口标题、托盘、引导页
short_name  = "助手"                                 # 紧凑形式（菜单栏）
logo_path   = "C:\\Program Files\\Acme\\logo.png"    # 图标（PNG/SVG/JPG/ICO）
wordmark_path = "C:\\Program Files\\Acme\\logo-text.png"   # 图标 + 文字
```

也可以用环境变量（适合打包部署 / 容器场景）：

```bash
VOLTUI_BRAND_NAME="银河助手"
VOLTUI_BRAND_SHORT_NAME="助手"
VOLTUI_BRAND_LOGO="C:\Program Files\Acme\logo.png"
VOLTUI_BRAND_WORDMARK="C:\Program Files\Acme\logo-text.png"
VOLTUI_BRAND_ICON="C:\Program Files\Acme\tray-icon.ico"
```

环境变量优先于配置文件。`logo_path` / `wordmark_path` / `icon_path` 留空
则使用内置 VoltUI SVG/图标资源。AI 系统提示词会自动将 "VoltUI" 替换为
配置的品牌名称。托盘/任务栏图标也可以通过 `icon_path` 替换（Windows 用
.ico，macOS/Linux 用 .png）。

### 双模型协同

加一个规划器模型处理复杂任务 —— 配置加一行：

```toml
[agent]
planner_model = "deepseek-pro"   # 便宜模型规划，强模型执行
```

### 权限与沙盒

```toml
[permissions]
mode  = "ask"                                # ask | allow | deny
deny  = ["bash(rm -rf*)", "bash(git push*)"] # 任何模式下都硬阻断
allow = ["bash(go test*)"]                   # 从不询问

[sandbox]
# workspace_root = ""          # 文件写工具被限制在此目录；留空 = 当前目录
# allow_write    = ["/tmp"]    # write_file/edit_file/multi_edit 额外可写的目录
```

## 浏览器（默认启用）

内置 `browser_navigate` 工具，通过 CDP（Chrome DevTools Protocol）驱动无头
Chromium 系浏览器。浏览内网文档站、管理后台、SPA 应用时，它会先执行页面
JavaScript 再提取可见文本，覆盖 `web_fetch`（纯 HTTP）做不到的场景。

- **Windows 10：**系统自带 Edge（Chromium 内核），零配置开箱即用。
- **macOS / Linux：**自动检测 Chrome/Chromium/Edge。
- **内网：**运行时无需联网。如自动检测不到，设置 `VOLTUI_BROWSER_PATH` 即可。

```sh
# 自动检测不到浏览器时，可手动指定：
export VOLTUI_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## 插件（MCP）

VoltUI 是 MCP 客户端。通过 `[[plugins]]` 接入内网工具服务：

```toml
[[plugins]]                       # 本地 stdio 服务器（如内部知识库）
name    = "knowledge-base"
command = "my-mcp-knowledge-base"
args    = ["--db", "http://docs.internal.company.com"]

[[plugins]]                       # 远程 Streamable HTTP 服务器
name    = "internal-search"
type    = "http"
url     = "http://search.internal.company.com/mcp"
headers = { Authorization = "Bearer ${SEARCH_TOKEN}" }
```

在项目根目录放一个 `.mcp.json`，VoltUI 会原样读取。

## 架构

三层可扩展性，全部藏在内核按名解析的 registry 之后：

1. **Registry**：`Provider` 与 `Tool` 是接口；内核无硬编码模型。
2. **编译期内置**：provider 和 tool 通过 `init()` 自注册，新增 = 一个文件 + 一行 import。
3. **运行时插件**：配置里声明的 MCP stdio/HTTP 服务器，每个远程 tool 适配成 `Tool` 接口。

## 文档

- **[检查点与回退](./docs/CHECKPOINTS.md)** — 基于快照的编辑安全网（Esc-Esc / `/rewind`）。
- **[规格](./docs/SPEC.md)** — 工程契约：架构、注册表、数据类型与路线图。
- **[从 0.x 迁移](./docs/MIGRATING.md)** — 从旧版 TypeScript 发布版迁移到 1.0 Go 重写版。

## 致谢

VoltUI 是 [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix) 的衍生作品，
原始项目以 MIT 许可证发布。详见 [NOTICE](./NOTICE)；
第三方依赖及其许可证见 [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES)。

<br/>

---

<p align="center">
  <sub>MIT —— 见 <a href="./LICENSE">LICENSE</a></sub>
</p>
