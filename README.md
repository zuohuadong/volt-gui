<p align="center">
  <img src="docs/logo.svg" alt="VoltUI" width="640"/>
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
  <a href="./LICENSE"><img src="https://img.shields.io/npm/l/voltui.svg?style=flat-square&color=8b949e&labelColor=161b22" alt="license"/></a>
</p>

<br/>

<h3 align="center">AI coding agent for enterprise intranet.</h3>
<p align="center">Offline-first, multi-model, pre-packaged for Windows 10 — deploy once, every developer on your intranet is productive.</p>

<br/>

## Why VoltUI?

VoltUI is built for **enterprises that have LLMs on their intranet** — companies
running Qwen, DeepSeek, GLM, or private models behind a firewall, where
developers need an AI coding agent that just works without internet access.

| Problem | VoltUI's answer |
|---------|-----------------|
| Public agents need internet | **Offline-first** — zero runtime network dependencies |
| Only supports one model | **Any OpenAI-compatible API** — one config entry per model |
| Hard to deploy at scale | **Single binary** — pre-bake API endpoint & key into the package |
| Linux-only tools | **Windows 10 first**, then macOS — Edge works out of the box |
| Can't browse internal docs | **Built-in headless browser** renders JS-heavy internal pages |

## Features

- **Multi-model.** DeepSeek, Qwen, GLM, Claude, MiMo, Ollama, vLLM — any
  OpenAI-compatible or Anthropic endpoint. One `[[providers]]` entry per model,
  no code changes. Two-model collaboration (executor + planner) in one config line.
- **Offline / intranet ready.** No npm, no auto-downloads, no telemetry calls.
  Works entirely behind corporate firewalls. Browser automation uses the
  pre-installed Edge on Windows 10.
- **Pre-packaged deployment.** Bake the API endpoint and key into the binary or
  config at build time — distribute a ready-to-run package to every developer,
  no setup wizard needed.
- **Windows 10 first.** Microsoft Edge (Chromium) is pre-installed on Win10 —
  `browser_navigate` works out of the box. Windows path detection and RDP/VDI
  friendly. macOS and Linux also supported.
- **Config-driven.** Providers, tools, permissions, and plugins are declared in
  `voltui.toml`. No hardcoded models. One file per team, checked into the repo.
- **Plugin-driven (MCP).** External tools run over stdio JSON-RPC or HTTP.
  Compatible with the MCP ecosystem — drop in an `.mcp.json` and go.
- **Code intelligence (CodeGraph).** Tree-sitter symbol/call-graph search
  (`codegraph_*` tools) — no embedding service or API cost. Auto-fetched on
  first use, indexed in the background.
- **Checkpoints & rewind.** Snapshot-based edit safety net — press Esc-Esc or
  `/rewind` to undo any change. See [docs/CHECKPOINTS.md](docs/CHECKPOINTS.md).
- **Skills & hooks.** Claude-Code-style skills (`.voltui/skills/`) and hooks
  (`PreToolUse`/`PostToolUse`/`Stop`) for workflow automation.
- **Plan mode.** Evidence-backed step sign-off (`complete_step`) — the agent
  proposes, you approve.
- **Memory.** `VOLTUI.md` hierarchy + auto-memory store, folded into the
  cache-stable prefix so context carries across sessions.
- **Single static binary.** `CGO_ENABLED=0` — one file, no runtime dependencies,
  cross-compile for 6 platforms.

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

## Quick start

### Online (with external API)

```sh
voltui setup                      # config wizard → ./voltui.toml
export DEEPSEEK_API_KEY=sk-...  # or put it in .env
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

Resolution order: **flag > `./voltui.toml` > `~/.config/voltui/config.toml` >
built-in defaults**.

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

For enterprise rollout, embed the API endpoint and key directly so developers
don't need any setup:

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

### White-label / OEM branding

Replace the product name and logos for your organization — no rebuild required:

```toml
# voltui.toml
[brand]
name        = "Acme Copilot"                         # window title, tray, onboarding
short_name  = "Copilot"                              # compact form (menu bar)
logo_path   = "C:\\Program Files\\Acme\\logo.png"    # icon-only (PNG/SVG/JPG/ICO)
wordmark_path = "C:\\Program Files\\Acme\\logo-text.png"   # logo + text
```

Or use environment variables (ideal for packaged deploys / containers):

```bash
VOLTUI_BRAND_NAME="Acme Copilot"
VOLTUI_BRAND_SHORT_NAME="Copilot"
VOLTUI_BRAND_LOGO="C:\Program Files\Acme\logo.png"
VOLTUI_BRAND_WORDMARK="C:\Program Files\Acme\logo-text.png"
VOLTUI_BRAND_ICON="C:\Program Files\Acme\tray-icon.ico"
```

Env vars take precedence over config. When `logo_path` / `wordmark_path` /
`icon_path` are empty, the built-in VoltUI SVG/icon assets are used. The
agent's system prompt automatically replaces "VoltUI" with the configured
brand name. The tray/taskbar icon can also be replaced via `icon_path`
(.ico on Windows, .png on macOS/Linux).

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

## Browser and desktop automation (enabled by default)

Built-in `browser_navigate` drives a headless Chromium-family browser through
CDP (Chrome DevTools Protocol), so JavaScript-heavy internal docs, dashboards,
and SPAs render before text extraction. It covers pages that `web_fetch` (plain
HTTP) cannot handle.

Release builds also include first-party desktop automation tools:

- `browser_control` — Playwright-like CDP actions: open a page, click selectors
  or coordinates, type text, press keys, wait, and save browser screenshots.
- `desktop_screenshot` — capture the desktop to a PNG file.
- `desktop_mouse` / `desktop_keyboard` — move/click/drag/scroll and type/press
  keys on the host desktop.

These host-control tools are **not read-only** in the tool contract, so the
normal permission rules and desktop approval UI gate them by default. macOS may
ask for Screen Recording / Accessibility permissions; Windows uses built-in
PowerShell/.NET + user32; Linux uses common desktop backends such as
`gnome-screenshot`, `grim`, `scrot`, and `xdotool` when available.

- **Windows 10:** Edge is pre-installed — works out of the box, zero setup.
- **macOS / Linux:** auto-detects Chrome/Chromium/Edge from well-known paths.
- **Intranet:** no network access needed at runtime. Set `VOLTUI_BROWSER_PATH`
  to the browser binary if auto-detection doesn't find it.

```sh
# Optional override when auto-detection cannot find the browser:
export VOLTUI_BROWSER_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

## Plugins (MCP)

VoltUI is an MCP client. Add internal tool servers via `[[plugins]]`:

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

Drop an `.mcp.json` in the project root and VoltUI reads it as-is.

## Architecture

Three tiers of extensibility, all behind registries:

1. **Registry** — `Provider` and `Tool` are interfaces; no hardcoded models.
2. **Compile-time built-ins** — providers and tools self-register via `init()`.
3. **Runtime plugins** — MCP stdio/HTTP servers declared in config.

## Documentation

- **[Checkpoints & rewind](./docs/CHECKPOINTS.md)** — snapshot-based edit safety net (Esc-Esc / `/rewind`).
- **[Spec](./docs/SPEC.md)** — engineering contract: architecture, registries, data types, and roadmap.
- **[Migrating from 0.x](./docs/MIGRATING.md)** — moving from the legacy TypeScript releases to the 1.0 Go rewrite.

## Acknowledgments

VoltUI is a derivative work of [DeepSeek-Reasonix](https://github.com/esengine/DeepSeek-Reasonix),
originally licensed under the MIT License. See [NOTICE](./NOTICE) for details.

<br/>

---

<p align="center">
  <sub>MIT — see <a href="./LICENSE">LICENSE</a></sub>
</p>
