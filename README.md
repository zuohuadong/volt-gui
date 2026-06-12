<p align="center">
  <img src="docs/logo.svg" alt="西谷智灯暗涌系统 Anyong" width="640"/>
</p>

<p align="center">
  <strong>English</strong>
  &nbsp;·&nbsp;
  <a href="./README.zh-CN.md">简体中文</a>
  &nbsp;·&nbsp;
  <a href="./docs/CHECKPOINTS.md">Checkpoints</a>
  &nbsp;·&nbsp;
  <a href="./docs/SPEC.md">Spec</a>
</p>

<p align="center">
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-0c2d48?style=flat-square&labelColor=145374" alt="license"/></a>
  <img src="https://img.shields.io/badge/platform-Win%20%7C%20macOS%20%7C%20Linux-1b6ca8?style=flat-square&labelColor=0c2d48" alt="platform"/>
  <img src="https://img.shields.io/badge/runtime-offline%20first-5bc0eb?style=flat-square&labelColor=0c2d48" alt="offline"/>
</p>

<br/>

> **西谷智灯暗涌系统 (Anyong)** by [西谷AI](https://cnb.cool/aizhuliren) — an offline-first, multi-model AI coding agent built for enterprise intranets.
> Based on [VoltUI](https://cnb.cool/aizhuliren/volt-gui) (Go + Wails), brand-customized via `BrandConfig` without forking source code.

<br/>

<h3 align="center">Deploy once behind the firewall. Every developer gets an AI pair programmer.</h3>
<p align="center">No internet. No telemetry. No setup wizard. Just a single binary and your internal LLM endpoint.</p>

<br/>

## The Problem 西谷智灯暗涌系统 Solves

Your company deployed Qwen, DeepSeek, GLM, or a private model on the intranet — but your developers are still coding without AI assistance because every public agent *needs the internet*.

| Pain point | 西谷智灯暗涌系统's answer |
|------------|---------------|
| Public agents phone home | **Offline-first** — zero runtime network calls, no telemetry |
| Only one model provider | **Any OpenAI-compatible API** — switch models with one config line |
| IT hates npm/node setups | **Single static binary** — download and run, no dependencies |
| "Our devs use Windows 10" | **Windows 10 first** — Edge is pre-installed, browser tool works out of the box |
| Can't browse internal wikis | **Built-in headless browser** renders JS-heavy intranet pages |
| Hard to roll out at scale | **Pre-package API key + endpoint** into the binary — double-click to start |

## Features

- **Multi-model.** Qwen, DeepSeek, GLM, Claude, MiMo, Ollama, vLLM — any OpenAI-compatible or Anthropic endpoint. One `[[providers]]` entry per model, zero code changes. Two-model collaboration (executor + planner) in one config line.
- **Offline / intranet ready.** No npm, no auto-downloads, no telemetry. Works entirely behind corporate firewalls. Browser automation uses the pre-installed Edge on Windows 10.
- **Pre-packaged deployment.** Bake the API endpoint and key into the binary or config at build time — distribute a ready-to-run package to every developer, no setup wizard needed.
- **Windows 10 first.** Microsoft Edge (Chromium) is pre-installed on Win10 — `browser_navigate` works out of the box. Windows path detection and RDP/VDI friendly. macOS and Linux also supported.
- **Config-driven.** Providers, tools, permissions, and plugins are declared in `voltui.toml`. No hardcoded models. One file per team, checked into the repo.
- **Plugin-driven (MCP).** External tools run over stdio JSON-RPC or HTTP. Compatible with the MCP ecosystem — drop in an `.mcp.json` and go.
- **Code intelligence (CodeGraph).** Tree-sitter symbol/call-graph search (`codegraph_*` tools) — no embedding service or API cost. Auto-fetched on first use, indexed in the background.
- **Checkpoints & rewind.** Snapshot-based edit safety net — press Esc-Esc or `/rewind` to undo any change. See [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md).
- **Skills & hooks.** Claude-Code-style skills (`.voltui/skills/`) and hooks (`PreToolUse`/`PostToolUse`/`Stop`) for workflow automation.
- **Plan mode.** Evidence-backed step sign-off (`complete_step`) — the agent proposes, you approve.
- **Memory.** `VOLTUI.md` hierarchy + auto-memory store, folded into the cache-stable prefix so context carries across sessions.
- **Single static binary.** `CGO_ENABLED=0` — one file, no runtime dependencies, cross-compile for 6 platforms.
- **Industry skills.** Semiconductor ATE, yield/SPC, failure analysis, LIMS/OCR data org — fork-specific skills that stay local.

## Install

### Pre-built (recommended for enterprise rollout)

```sh
npm i -g voltui                  # any OS; pulls the prebuilt native binary
```

### Build from source

```sh
make build      # -> bin/voltui(.exe)
make cross      # -> dist/ (darwin|linux|windows × amd64|arm64)
```

## Quick Start

### Online (with external API)

```sh
voltui setup                      # config wizard -> ./voltui.toml
export DEEPSEEK_API_KEY=sk-...    # or put it in .env
voltui chat
```

### Intranet (with private model endpoint)

```sh
# Edit voltui.toml to point at your internal model server
voltui chat                       # that's it — no internet needed
```

### Pre-packaged (zero-setup for end users)

```sh
# Admin: build with embedded config
cp voltui.example.toml voltui.toml
# Edit voltui.toml: set base_url to internal endpoint, api_key to embedded key
make build
# Distribute bin/voltui.exe to every developer — double-click to run
```

## Configuration

Resolution order: **flag > `./voltui.toml` > `~/.config/voltui/config.toml` > built-in defaults**.

### Multi-model setup

```toml
default_model = "qwen"   # your internal model
# language    = "zh"     # ui language; empty = auto-detect

# Internal Qwen (DashScope / vLLM / Ollama)
[[providers]]
name           = "qwen"
kind           = "openai"
base_url       = "http://10.0.1.100:8000/v1"   # intranet endpoint
model          = "qwen3-235b-a22b"
api_key_env    = "QWEN_API_KEY"
context_window = 131072

# Internal DeepSeek
[[providers]]
name           = "deepseek"
kind           = "openai"
base_url       = "http://10.0.1.100:8001/v1"
models         = ["deepseek-v4-flash", "deepseek-v4-pro"]
api_key_env    = "DEEPSEEK_API_KEY"
context_window = 1000000

# Internal GLM (zhipu)
[[providers]]
name           = "glm"
kind           = "openai"
base_url       = "http://10.0.1.100:8002/v1"
model          = "glm-4-plus"
api_key_env    = "GLM_API_KEY"
context_window = 128000

# Claude (if you have Anthropic access)
[[providers]]
name           = "claude"
kind           = "anthropic"
model          = "claude-opus-4-8"
api_key_env    = "ANTHROPIC_API_KEY"
context_window = 1000000
```

### Pre-packaged deployment (embedded key)

For enterprise rollout, embed the API endpoint and key directly so developers don't need any setup:

```toml
# voltui.toml — baked into the distribution package
default_model  = "company-llm"

[[providers]]
name        = "company-llm"
kind        = "openai"
base_url    = "http://llm.internal.company.com/v1"
model       = "qwen3-235b-a22b"
api_key_env = "COMPANY_LLM_KEY"   # or set the default in .env

[permissions]
mode  = "ask"   # or "allow" for trusted internal teams
```

Then distribute `voltui.exe` + `voltui.toml` + `.env` as a ZIP package.

### Brand customization (西谷智灯暗涌系统)

西谷智灯暗涌系统 uses VoltUI's built-in BrandConfig mechanism — **no recompilation needed**:

```toml
# voltui.toml
[brand]
name        = "西谷智灯暗涌系统"                         # window title, tray, onboarding
short_name  = "西谷智灯暗涌系统"                          # compact form (menu bar)
```

Or via environment variables (ideal for packaged deployment / containers):

```bash
VOLTUI_BRAND_NAME="西谷智灯暗涌系统"
VOLTUI_BRAND_SHORT_NAME="西谷智灯暗涌系统"
```

Environment variables take precedence over config files. If logo/icon is not configured, the built-in VoltUI assets are used. The AI system prompt automatically replaces "VoltUI" with the configured brand name.

> **Core principle**: brand customization is done through the `[brand]` config section and environment variables. **Never hard-code brand names into source code.**

### Two-model collaboration

Add a planner model for complex tasks — one line in config:

```toml
[agent]
planner_model = "deepseek-pro"   # cheap model plans, strong model executes
```

### Permissions & sandbox

```toml
[permissions]
mode  = "ask"                                # ask | allow | deny
deny  = ["bash(rm -rf*)", "bash(git push*)"] # always blocked
allow = ["bash(go test*)"]                   # never prompted

[sandbox]
# workspace_root = ""          # file-writers confined here; empty = current dir
# allow_write    = ["/tmp"]    # extra dirs write_file/edit_file/multi_edit may touch
```

## Browser (enabled by default)

Built-in `browser_navigate` drives a headless Chromium-family browser through
CDP (Chrome DevTools Protocol), so JavaScript-heavy internal docs, dashboards,
and SPAs render before text extraction. It covers pages that `web_fetch` (plain
HTTP) cannot handle.

- **Windows 10:** Edge is pre-installed — works out of the box, zero setup.
- **macOS / Linux:** auto-detects Chrome/Chromium/Edge from well-known paths.
- **Intranet:** no network access needed at runtime. Set `VOLTUI_BROWSER_PATH` to the browser binary if auto-detection doesn't find it.

```sh
# Optional override when auto-detection cannot find the browser:
export VOLTUI_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## Plugins (MCP)

西谷智灯暗涌系统 is an MCP client. Add internal tool servers via `[[plugins]]`:

```toml
[[plugins]]                       # local stdio server (e.g. internal knowledge base)
name    = "knowledge-base"
command = "my-mcp-knowledge-base"
args    = ["--db", "http://docs.internal.company.com"]

[[plugins]]                       # remote server over Streamable HTTP
name    = "internal-search"
type    = "http"
url     = "http://search.internal.company.com/mcp"
headers = { Authorization = "Bearer ${SEARCH_TOKEN}" }
```

Drop an `.mcp.json` in the project root and 西谷智灯暗涌系统 reads it as-is.

## Architecture

Three tiers of extensibility, all behind registries:

1. **Registry** — `Provider` and `Tool` are interfaces; no hardcoded models.
2. **Compile-time built-ins** — providers and tools self-register via `init()`.
3. **Runtime plugins** — MCP stdio/HTTP servers declared in config.

## Documentation

- **[Checkpoints & Rewind](./docs/CHECKPOINTS.md)** — snapshot-based edit safety net.
- **[Spec](./docs/SPEC.md)** — engineering contract: architecture, registries, data types & roadmap.
- **[Migrating from 0.x](./docs/MIGRATING.md)** — from the legacy TypeScript release to the 1.0 Go rewrite.
- **[西谷智灯暗涌系统 Product Strategy](./暗涌.md)** — fork positioning, brand principles, release pipeline.

## Fork Information

西谷智灯暗涌系统 is a [西谷AI](https://cnb.cool/aizhuliren) fork of [VoltUI](https://cnb.cool/aizhuliren/volt-gui), following these principles:

- **Source stays in sync with upstream** — sync with a simple `git merge`, zero conflicts
- **Brand via BrandConfig** — no source code replacement
- **Industry skills stay local** — not contributed upstream
- **Generic features go upstream first** — then everyone benefits

## Acknowledgments

西谷智灯暗涌系统 is built on [VoltUI](https://cnb.cool/aizhuliren/volt-gui), which is derived from [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix), originally released under the MIT License. See [NOTICE](./NOTICE) and [THIRD-PARTY-NOTICES](./THIRD-PARTY-NOTICES).

<br/>

---

<p align="center">
  <sub>MIT — see <a href="./LICENSE">LICENSE</a></sub>
</p>
