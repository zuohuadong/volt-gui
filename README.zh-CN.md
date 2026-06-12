<p align="center">
  <img src="docs/logo.svg" alt="暗涌 Anyong" width="640"/>
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
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-0c2d48?style=flat-square&labelColor=145374" alt="license"/></a>
  <img src="https://img.shields.io/badge/platform-Win%20%7C%20macOS%20%7C%20Linux-1b6ca8?style=flat-square&labelColor=0c2d48" alt="platform"/>
  <img src="https://img.shields.io/badge/runtime-%E7%A6%BB%E7%BA%BF%E4%BC%98%E5%85%88-5bc0eb?style=flat-square&labelColor=0c2d48" alt="offline"/>
</p>

<br/>

> **暗涌 (Anyong)** — [西谷AI](https://cnb.cool/aizhuliren) 出品的本土化 AI 编码 Agent。
> 离线优先、多模型、内网就绪 —— 打包一次，全员上手。

<br/>

<h3 align="center">防火墙内部署一次，全员获得 AI 编程搭档。</h3>
<p align="center">无需联网 · 无遥测回传 · 无配置向导 · 一个二进制 + 内网模型端点，开箱即用。</p>

<br/>

## 暗涌解决什么问题？

企业已经在内网部署了通义千问、DeepSeek、智谱 GLM 或私有模型 —— 但开发者仍然没有 AI 编程助手，因为所有公开 Agent 都**必须联网**。

| 痛点 | 暗涌的方案 |
|------|------------|
| 公网 Agent 必须联网 | **离线优先** —— 运行时零网络调用、零遥测 |
| 只支持单一模型 | **任意 OpenAI 兼容 API** —— 一行配置切换模型 |
| IT 不喜欢 npm/node 安装 | **单一静态二进制** —— 下载即用，零依赖 |
| "我们开发者用 Windows 10" | **Windows 10 优先** —— Edge 自带，浏览器工具零配置可用 |
| 无法浏览内部文档站 | **内置无头浏览器**，JS 重度页面也能渲染提取 |
| 大规模部署困难 | **打包时内置 API 地址和 Key** —— 双击即用 |

## 核心特性

- **多模型支持。** 通义千问、DeepSeek、智谱 GLM、Claude、MiMo、Ollama、vLLM —— 任何 OpenAI 兼容或 Anthropic 端点，一个 `[[providers]]` 配置项即可，无需改代码。双模型协同（执行器 + 规划器）一行配置开启。
- **离线 / 内网就绪。** 无 npm、无自动下载、无遥测回传，完全在防火墙内运行。浏览器自动化直接用 Windows 10 自带的 Edge。
- **打包即部署。** 构建时将 API 地址和 Key 嵌入二进制或配置文件 —— 分发一个开箱即用的包给每位开发者，无需配置向导。
- **Windows 10 优先。** Microsoft Edge（Chromium 内核）是 Win10 自带 —— `browser_navigate` 零配置可用。Windows 路径检测、RDP/VDI 友好。macOS 和 Linux 同样支持。
- **配置驱动。** Provider、工具、权限、插件全部在 `voltui.toml` 中声明，无硬编码模型。一个文件管一个团队，直接提交到仓库。
- **插件驱动 (MCP)。** 外部工具通过 stdio JSON-RPC 或 HTTP 运行。兼容 MCP 生态 —— 放一个 `.mcp.json` 即可。
- **代码智能 (CodeGraph)。** 基于 tree-sitter 的符号/调用图搜索 (`codegraph_*` 工具) —— 无需嵌入服务，零 API 成本。首次使用自动下载，后台索引。
- **检查点与回退。** 基于快照的编辑安全网 —— 按 Esc-Esc 或 `/rewind` 撤销任何改动。详见 [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md)。
- **技能与钩子。** Claude-Code 风格的技能 (`.voltui/skills/`) 和钩子 (`PreToolUse`/`PostToolUse`/`Stop`)，用于工作流自动化。
- **规划模式。** 基于证据的步骤签署 (`complete_step`) —— 智能体提议，你审批。
- **记忆。** `VOLTUI.md` 层级 + 自动记忆存储，折叠进缓存稳定前缀，跨会话保持上下文。
- **单一静态二进制。** `CGO_ENABLED=0` —— 一个文件、无运行时依赖、交叉编译 6 个平台。
- **行业技能。** 半导体 ATE、良率/SPC、失效分析、LIMS/OCR 数据组织 —— fork 专属技能，留在本地。

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
voltui setup                      # 配置向导 -> ./voltui.toml
export DEEPSEEK_API_KEY=sk-...    # 或写入 .env
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

### 暗涌品牌定制

暗涌使用 VoltUI 内置的 BrandConfig 机制定制品牌，**无需重新编译**：

```toml
# voltui.toml
[brand]
name        = "暗涌"                             # 窗口标题、托盘、引导页
short_name  = "暗涌"                              # 紧凑形式（菜单栏）
```

也可以用环境变量（适合打包部署 / 容器场景）：

```bash
VOLTUI_BRAND_NAME="暗涌"
VOLTUI_BRAND_SHORT_NAME="暗涌"
```

环境变量优先于配置文件。Logo/icon 如未配置，则使用内置 VoltUI 资源。
AI 系统提示词会自动将 "VoltUI" 替换为配置的品牌名称。

> **核心原则**：品牌定制通过 `[brand]` 配置段 + 环境变量实现，**禁止硬编码品牌名到源码中**。

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

内置 `browser_navigate` 工具，在无头 Chromium 中渲染 JS 重度页面 —— 浏览内网文档站、管理后台、SPA 应用时，`web_fetch`（纯 HTTP）做不到的事它能做。

- **Windows 10：**系统自带 Edge（Chromium 内核），零配置开箱即用。
- **macOS / Linux：**自动检测 Chrome/Chromium/Edge。
- **内网：**运行时无需联网。如自动检测不到，设置 `VOLTUI_BROWSER_PATH` 即可。

```toml
[browser]
# path = "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe"  # Windows
# path = "/usr/bin/chromium"                                              # Linux
# path = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"  # macOS
```

## 插件（MCP）

暗涌是 MCP 客户端。通过 `[[plugins]]` 接入内网工具服务：

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

在项目根目录放一个 `.mcp.json`，暗涌会原样读取。

## 架构

三层可扩展性，全部藏在内核按名解析的 registry 之后：

1. **Registry**：`Provider` 与 `Tool` 是接口；内核无硬编码模型。
2. **编译期内置**：provider 和 tool 通过 `init()` 自注册，新增 = 一个文件 + 一行 import。
3. **运行时插件**：配置里声明的 MCP stdio/HTTP 服务器，每个远程 tool 适配成 `Tool` 接口。

## 文档

- **[检查点与回退](./docs/CHECKPOINTS.md)** — 基于快照的编辑安全网（Esc-Esc / `/rewind`）。
- **[规格](./docs/SPEC.md)** — 工程契约：架构、注册表、数据类型与路线图。
- **[从 0.x 迁移](./docs/MIGRATING.md)** — 从旧版 TypeScript 发布版迁移到 1.0 Go 重写版。
- **[暗涌产品策略](./暗涌.md)** — fork 定位、品牌原则、发布管道。

## Fork 信息

暗涌是 [西谷AI](https://cnb.cool/aizhuliren) 基于 [VoltUI](https://cnb.cool/aizhuliren/volt-gui) 的 fork，遵循以下原则：

- **源码与上游保持一致** — 同步只需 `git merge`，零冲突
- **品牌通过 BrandConfig 定制** — 不硬编码替换源码
- **行业 skill 保留在本仓库** — 不贡献上游
- **通用功能先提 PR 上游** — 然后在 fork 享受

## 致谢

暗涌基于 [VoltUI](https://cnb.cool/aizhuliren/volt-gui) 开发，VoltUI 是 [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix) 的衍生作品，原始项目以 MIT 许可证发布。详见 [NOTICE](./NOTICE) 和 [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES)。

<br/>

---

<p align="center">
  <sub>MIT —— 见 <a href="./LICENSE">LICENSE</a></sub>
</p>
