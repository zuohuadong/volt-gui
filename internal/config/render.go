package config

import (
	"fmt"
	"reflect"
	"sort"
	"strconv"
	"strings"
)

type RenderScope string

const (
	RenderScopeFull    RenderScope = "full"
	RenderScopeUser    RenderScope = "user"
	RenderScopeProject RenderScope = "project"
)

// RenderTOML renders the config as annotated TOML in the `voltui setup` house style:
// comments preserved, system_prompt as a multi-line string, helpful hints. The
// output round-trips back through Load (see render_test.go).
func RenderTOML(c *Config) string {
	return RenderTOMLForScope(c, RenderScopeFull)
}

// RenderTOMLForScope renders an annotated TOML file for a specific persistence
// target. User configs can carry desktop and account-level preferences; project
// voltui.toml stays focused on project behavior and intentionally excludes
// desktop-only preferences.
func RenderTOMLForScope(c *Config, scope RenderScope) string {
	if c == nil {
		c = Default()
	}
	switch scope {
	case RenderScopeUser, RenderScopeProject:
	default:
		scope = RenderScopeFull
	}
	defaults := Default()
	var b strings.Builder

	b.WriteString("# VoltUI configuration.\n")
	b.WriteString("# Resolution order: flag > ./voltui.toml > ~/.config/voltui/config.toml > built-in defaults.\n")
	b.WriteString("# Secrets come from the environment via api_key_env; never put keys here.\n\n")

	fmt.Fprintf(&b, "config_version = %d   # schema marker for diagnostics; old versions may ignore it\n", configVersion(c))
	fmt.Fprintf(&b, "default_model = %q\n", c.DefaultModel)
	if c.Language != "" {
		fmt.Fprintf(&b, "language      = %q   # ui/model language; empty = auto-detect from $LANG / $VOLTUI_LANG\n", c.Language)
	} else {
		b.WriteString("# language      = \"zh\"   # ui/model language; empty = auto-detect from $LANG / $VOLTUI_LANG\n")
	}
	b.WriteString("\n")

	if shouldRenderUI(c, defaults, scope) {
		b.WriteString("[ui]\n")
		fmt.Fprintf(&b, "theme = %q   # auto|dark|light; CLI colors only; VOLTUI_THEME can override per run\n", c.UITheme())
		if style := c.UIThemeStyle(); style != "" {
			fmt.Fprintf(&b, "theme_style = %q   # CLI accent palette; VOLTUI_THEME_STYLE can override per run\n", style)
		} else {
			b.WriteString("# theme_style = \"graphite\"   # graphite|ember|aurora|midnight|sandstone|porcelain|linen|glacier\n")
		}
		if strings.TrimSpace(c.UI.CloseBehavior) != "" && scope == RenderScopeProject {
			fmt.Fprintf(&b, "close_behavior = %q   # legacy desktop close behavior; prefer [desktop].close_behavior in user config\n", c.DesktopCloseBehavior())
		}
		b.WriteString("\n")
	}

	if scope != RenderScopeProject {
		b.WriteString("[desktop]\n")
		if lang := c.DesktopLanguage(); lang != "" {
			fmt.Fprintf(&b, "language = %q   # desktop UI language; empty/auto = browser/OS auto-detect\n", lang)
		} else {
			b.WriteString("# language = \"zh\"   # desktop UI language; empty/auto = browser/OS auto-detect\n")
		}
		fmt.Fprintf(&b, "layout_style = %q   # desktop layout: classic|workbench|creation\n", c.DesktopLayoutStyle())
		fmt.Fprintf(&b, "theme = %q   # desktop only: auto|dark|light\n", c.DesktopTheme())
		if style := c.DesktopThemeStyle(); style != "" {
			fmt.Fprintf(&b, "theme_style = %q   # desktop accent palette\n", style)
		} else {
			b.WriteString("# theme_style = \"graphite\"   # graphite|ember|aurora|midnight|sandstone|porcelain|linen|glacier\n")
		}
		fmt.Fprintf(&b, "close_behavior = %q   # desktop: quit|background when the window close button is clicked\n", c.DesktopCloseBehavior())
		fmt.Fprintf(&b, "status_bar_style = %q   # desktop: icon|text metric labels in the bottom status bar\n", c.DesktopStatusBarStyle())
		fmt.Fprintf(&b, "status_bar_items = %s   # desktop: ordered visible bottom status bar items\n", renderStringArray(c.DesktopStatusBarItems()))
		fmt.Fprintf(&b, "check_updates = %t   # desktop: check for new versions on startup\n", c.DesktopCheckUpdates())
		fmt.Fprintf(&b, "telemetry = %t   # anonymous startup ping; no prompts, keys, or file data\n", c.DesktopTelemetry())
		fmt.Fprintf(&b, "metrics = %t   # anonymous aggregate desktop counters; default off\n", c.DesktopMetrics())
		if len(c.Desktop.ProviderAccess) > 0 {
			fmt.Fprintf(&b, "provider_access = %s   # desktop settings: providers shown on Settings > Model > Access\n", renderStringArray(c.Desktop.ProviderAccess))
		}
		fmt.Fprintf(&b, "expand_thinking = %t   # desktop: show reasoning text expanded by default; false = collapsed\n", c.Desktop.ExpandThinking)
		fmt.Fprintf(&b, "display_mode = %q   # desktop: standard|compact transcript display mode\n", c.DesktopDisplayMode())
		b.WriteString("\n")
	}

	// Brand section — only render when explicitly configured (non-default).
	if c.Brand.Name != "" || c.Brand.ShortName != "" || c.Brand.LogoPath != "" || c.Brand.WordmarkPath != "" || c.Brand.IconPath != "" {
		b.WriteString("[brand]\n")
		if c.Brand.Name != "" {
			fmt.Fprintf(&b, "name = %q   # product name (window title, tray, onboarding)\n", c.Brand.Name)
		}
		if c.Brand.ShortName != "" {
			fmt.Fprintf(&b, "short_name = %q   # compact form (menu bar, Linux app name)\n", c.Brand.ShortName)
		}
		if c.Brand.LogoPath != "" {
			fmt.Fprintf(&b, "logo_path = %q   # custom icon-only logo (PNG/SVG/JPG/ICO)\n", c.Brand.LogoPath)
		}
		if c.Brand.WordmarkPath != "" {
			fmt.Fprintf(&b, "wordmark_path = %q   # custom logo + text image\n", c.Brand.WordmarkPath)
		}
		if c.Brand.IconPath != "" {
			fmt.Fprintf(&b, "icon_path = %q   # custom tray/taskbar icon (PNG on macOS/Linux, ICO on Windows)\n", c.Brand.IconPath)
		}
		b.WriteString("\n")
	}

	if c.AuthProvider() != "" || c.Auth.Issuer != "" || c.Auth.ClientID != "" {
		b.WriteString("[auth]\n")
		provider := c.AuthProvider()
		if provider == "" {
			provider = "oidc"
		}
		fmt.Fprintf(&b, "provider = %q   # oidc; empty disables desktop identity login\n", provider)
		fmt.Fprintf(&b, "issuer = %q   # OIDC issuer URL, e.g. https://auth.example.com\n", strings.TrimRight(strings.TrimSpace(c.Auth.Issuer), "/"))
		fmt.Fprintf(&b, "client_id = %q   # public desktop client; use PKCE, not client_secret\n", strings.TrimSpace(c.Auth.ClientID))
		fmt.Fprintf(&b, "scope = %q\n", c.AuthScope())
		minPort, maxPort := c.AuthCallbackPorts()
		fmt.Fprintf(&b, "callback_port_min = %d\n", minPort)
		fmt.Fprintf(&b, "callback_port_max = %d\n\n", maxPort)
	}

	if shouldRenderNetwork(c, defaults, scope) {
		b.WriteString("[network]\n")
		fmt.Fprintf(&b, "proxy_mode = %q   # auto|env|custom|off; auto currently uses env proxy\n", c.NetworkProxyMode())
		if c.Network.ProxyURL != "" {
			fmt.Fprintf(&b, "proxy_url  = %q   # custom override, e.g. socks5://127.0.0.1:7890\n", c.Network.ProxyURL)
		} else {
			b.WriteString("# proxy_url  = \"socks5://127.0.0.1:7890\"   # optional custom override\n")
		}
		if c.Network.NoProxy != "" {
			fmt.Fprintf(&b, "no_proxy   = %q   # honored for proxy_mode = \"custom\"\n", c.Network.NoProxy)
		} else {
			b.WriteString("# no_proxy   = \"localhost,127.0.0.1,.local\"   # honored for proxy_mode = \"custom\"\n")
		}
		b.WriteString("\n[network.proxy]\n")
		proxyType := c.Network.Proxy.Type
		if proxyType == "" {
			proxyType = "socks5"
		}
		fmt.Fprintf(&b, "type = %q   # http|https|socks5|socks5h\n", proxyType)
		if c.Network.Proxy.Server != "" {
			fmt.Fprintf(&b, "server = %q\n", c.Network.Proxy.Server)
		} else {
			b.WriteString("# server = \"127.0.0.1\"\n")
		}
		if c.Network.Proxy.Port > 0 {
			fmt.Fprintf(&b, "port = %d\n", c.Network.Proxy.Port)
		} else {
			b.WriteString("# port = 7890\n")
		}
		if c.Network.Proxy.Username != "" {
			fmt.Fprintf(&b, "username = %q\n", c.Network.Proxy.Username)
		} else {
			b.WriteString("# username = \"\"\n")
		}
		if c.Network.Proxy.Password != "" {
			fmt.Fprintf(&b, "password = %q   # supports ${VAR} expansion\n", c.Network.Proxy.Password)
		} else {
			b.WriteString("# password = \"${VOLTUI_PROXY_PASSWORD}\"   # optional; supports ${VAR} expansion\n")
		}
		b.WriteString("\n")
	}

	b.WriteString("[agent]\n")
	if shouldRenderSystemPrompt(c, defaults, scope) {
		b.WriteString("system_prompt = \"\"\"\n")
		b.WriteString(c.Agent.SystemPrompt)
		b.WriteString("\"\"\"\n")
	} else {
		b.WriteString("# system_prompt = \"\"\"...\"\"\"   # omit to use the built-in prompt for this version\n")
	}
	if c.Agent.SystemPromptFile != "" {
		fmt.Fprintf(&b, "system_prompt_file = %q\n", c.Agent.SystemPromptFile)
	} else {
		b.WriteString("# system_prompt_file = \"prompts/system.md\"   # overrides system_prompt when set\n")
	}
	fmt.Fprintf(&b, "max_steps   = %d\n", c.Agent.MaxSteps)
	if c.Agent.PlannerMaxSteps > 0 {
		fmt.Fprintf(&b, "planner_max_steps = %d\n", c.Agent.PlannerMaxSteps)
	}
	fmt.Fprintf(&b, "temperature = %s\n", formatFloat(c.Agent.Temperature))
	autoPlan := c.Agent.AutoPlan
	switch strings.ToLower(strings.TrimSpace(autoPlan)) {
	case "on", "ask":
		autoPlan = "on"
	default:
		autoPlan = "off"
	}
	fmt.Fprintf(&b, "auto_plan   = %q   # off|on; off keeps plan mode manual\n", autoPlan)
	if c.Agent.AutoPlanClassifier != "" {
		fmt.Fprintf(&b, "auto_plan_classifier = %q   # optional provider/model for borderline auto-plan decisions\n", c.Agent.AutoPlanClassifier)
	} else {
		b.WriteString("# auto_plan_classifier = \"deepseek-flash\"   # optional; only used for borderline tasks\n")
	}
	fmt.Fprintf(&b, "soft_compact_ratio  = %s   # notice only; keeps cache-first prefix intact\n", formatFloat(c.Agent.SoftCompactRatio))
	fmt.Fprintf(&b, "compact_ratio       = %s   # try compacting when prompt reaches this fraction\n", formatFloat(c.Agent.CompactRatio))
	fmt.Fprintf(&b, "compact_force_ratio = %s   # force compacting at this high-water mark\n", formatFloat(c.Agent.CompactForceRatio))
	if c.Agent.PlannerModel != "" {
		fmt.Fprintf(&b, "planner_model = %q   # low-frequency planner (two-model collaboration)\n", c.Agent.PlannerModel)
	} else {
		b.WriteString("# planner_model = \"mimo\"   # optional: enable two-model collaboration\n")
	}
	if c.Agent.SubagentModel != "" {
		fmt.Fprintf(&b, "subagent_model = %q   # default model for runAs=subagent skills\n", c.Agent.SubagentModel)
	} else {
		b.WriteString("# subagent_model = \"deepseek-pro\"   # optional default for runAs=subagent skills\n")
	}
	if c.Agent.SubagentEffort != "" {
		fmt.Fprintf(&b, "subagent_effort = %q   # default effort for subagent runs\n", c.Agent.SubagentEffort)
	}
	if len(c.Agent.SubagentModels) > 0 {
		fmt.Fprintf(&b, "subagent_models = %s   # per-skill overrides\n", renderStringMap(c.Agent.SubagentModels))
	} else {
		b.WriteString("# subagent_models = { review = \"deepseek-pro\", security_review = \"deepseek-pro\" }   # per-skill overrides\n")
	}
	if len(c.Agent.SubagentEfforts) > 0 {
		fmt.Fprintf(&b, "subagent_efforts = %s   # per-skill effort overrides\n", renderStringMap(c.Agent.SubagentEfforts))
	}
	if c.Agent.OutputStyle != "" {
		fmt.Fprintf(&b, "output_style = %q   # persona/tone folded into the prompt\n", c.Agent.OutputStyle)
	} else {
		b.WriteString("# output_style = \"explanatory\"   # explanatory | learning | concise | custom; empty = default\n")
	}
	if lang := c.ReasoningLanguage(); lang != "auto" {
		fmt.Fprintf(&b, "reasoning_language = %q   # auto|zh|en visible reasoning language\n", lang)
	}
	if c.Agent.ColdResumePrune != nil {
		fmt.Fprintf(&b, "cold_resume_prune = %t   # elide stale tool results on cold resume\n", c.ColdResumePruneEnabled())
	}
	b.WriteString("\n")

	if shouldRenderBot(c, defaults, scope) {
		renderBotConfig(&b, c.Bot)
	}

	if shouldRenderProviders(c, defaults, scope) {
		for _, p := range c.Providers {
			b.WriteString("[[providers]]\n")
			fmt.Fprintf(&b, "name        = %q\n", p.Name)
			fmt.Fprintf(&b, "kind        = %q\n", p.Kind)
			fmt.Fprintf(&b, "base_url    = %q\n", p.BaseURL)
			if len(p.Models) > 0 {
				fmt.Fprintf(&b, "models      = %s\n", renderStringArray(p.Models))
				if p.Default != "" {
					fmt.Fprintf(&b, "default     = %q\n", p.Default)
				}
			} else if p.Model != "" {
				fmt.Fprintf(&b, "model       = %q\n", p.Model)
			}
			if p.Priority != 0 {
				fmt.Fprintf(&b, "priority    = %d   # higher wins when a bare model name exists in multiple providers\n", p.Priority)
			}
			if p.ModelsURL != "" {
				fmt.Fprintf(&b, "models_url  = %q   # auto-fetch models from this URL on startup\n", p.ModelsURL)
			}
			fmt.Fprintf(&b, "api_key_env = %q\n", p.APIKeyEnv)
			if p.BalanceURL != "" {
				fmt.Fprintf(&b, "balance_url = %q   # optional; wallet-balance endpoint shown in the status bar\n", p.BalanceURL)
			}
			if p.ContextWindow > 0 {
				fmt.Fprintf(&b, "context_window = %d   # tokens; compaction triggers near this limit\n", p.ContextWindow)
			}
			if p.Vision {
				b.WriteString("vision      = true\n")
			}
			if p.VisionModels != nil {
				fmt.Fprintf(&b, "vision_models = %s\n", renderStringArray(p.VisionModels))
			}
			if p.ReasoningProtocol != "" {
				fmt.Fprintf(&b, "reasoning_protocol = %q\n", p.ReasoningProtocol)
			}
			if p.Price != nil {
				fmt.Fprintf(&b, "price       = { cache_hit = %v, input = %v, output = %v, currency = %q }   # per 1M tokens\n",
					p.Price.CacheHit, p.Price.Input, p.Price.Output, p.Price.Symbol())
			}
			if p.Thinking != "" {
				fmt.Fprintf(&b, "thinking    = %q\n", p.Thinking)
			}
			if p.Effort != "" {
				fmt.Fprintf(&b, "effort      = %q\n", p.Effort)
			}
			if len(p.SupportedEfforts) > 0 {
				fmt.Fprintf(&b, "supported_efforts = %s   # custom /effort levels exposed by this provider; overrides the built-in Kind/BaseURL default\n", renderStringArray(p.SupportedEfforts))
			}
			if p.DefaultEffort != "" {
				fmt.Fprintf(&b, "default_effort    = %q   # used when /effort is auto or unset; must be one of supported_efforts\n", p.DefaultEffort)
			}
			if p.NoProxy {
				b.WriteString("no_proxy    = true   # reach this base_url directly, never via the proxy\n")
			}
			b.WriteString("\n")
		}
	}

	b.WriteString("[tools]\n")
	if len(c.Tools.Enabled) == 0 {
		b.WriteString("enabled = []   # empty = all built-in tools\n\n")
	} else {
		b.WriteString("enabled = [")
		for i, t := range c.Tools.Enabled {
			if i > 0 {
				b.WriteString(", ")
			}
			fmt.Fprintf(&b, "%q", t)
		}
		b.WriteString("]\n\n")
	}

	b.WriteString("[codegraph]\n")
	fmt.Fprintf(&b, "enabled      = %v   # built-in MCP server; off by default for first-run sessions\n", c.Codegraph.Enabled)
	fmt.Fprintf(&b, "auto_install = %v   # fetch the runtime when CodeGraph is enabled but missing\n", c.Codegraph.AutoInstall)
	if c.Codegraph.Path != "" {
		fmt.Fprintf(&b, "path         = %q   # optional launcher override\n", c.Codegraph.Path)
	} else {
		b.WriteString("# path       = \"\"   # empty = cache, then PATH, then a bundle beside voltui\n")
	}
	if strings.TrimSpace(c.Codegraph.Tier) != "" {
		fmt.Fprintf(&b, "tier         = %q   # lazy|background|eager\n", c.Codegraph.ResolvedTier())
	} else {
		b.WriteString("# tier       = \"lazy\"   # lazy|background|eager\n")
	}
	b.WriteString("\n")

	b.WriteString("[skills]\n")
	if len(c.Skills.Paths) > 0 {
		fmt.Fprintf(&b, "paths = %s   # extra custom skill roots\n", renderStringArray(c.Skills.Paths))
	} else {
		b.WriteString("# paths = [\"~/my-skills\", \"../shared/skills\"]   # extra custom skill roots\n")
	}
	if len(c.Skills.ExcludedPaths) > 0 {
		fmt.Fprintf(&b, "excluded_paths = %s   # hide convention or custom skill roots without deleting files\n", renderStringArray(c.Skills.ExcludedPaths))
	}
	if disabled := c.DisabledSkillNames(); len(disabled) > 0 {
		fmt.Fprintf(&b, "disabled_skills = %s   # hidden from the prompt, slash invocation, and skill tools\n\n", renderStringArray(disabled))
	} else {
		b.WriteString("# disabled_skills = [\"review\"]   # hide noisy or unwanted skills\n\n")
	}

	b.WriteString("[permissions]\n")
	b.WriteString("# Per-call gating. mode = writer fallback when no rule matches: ask|allow|deny.\n")
	b.WriteString("# Readers always default to allow. Precedence: deny > ask > allow > fallback.\n")
	b.WriteString("# Rules are \"ToolName\" or \"ToolName(glob)\"; '*' matches any run, '?' one char.\n")
	mode := c.Permissions.Mode
	if mode == "" {
		mode = "ask"
	}
	fmt.Fprintf(&b, "mode  = %q\n", mode)
	b.WriteString(renderRuleList("deny", c.Permissions.Deny, `["bash(rm -rf*)", "bash(git push*)"]   # hard-blocked in every mode`))
	b.WriteString(renderRuleList("allow", c.Permissions.Allow, `["bash(go test*)", "bash(git status*)"]   # never prompted`))
	b.WriteString(renderRuleList("ask", c.Permissions.Ask, `["write_file"]   # force a prompt even if otherwise allowed`))
	b.WriteString("\n")

	b.WriteString("[sandbox]\n")
	b.WriteString("# Confine tool blast radius. File-writers (write_file/edit_file/multi_edit)\n")
	b.WriteString("# may only write under workspace_root (empty = current dir) + allow_write.\n")
	b.WriteString("# bash = \"enforce\" (default) jails each command in an OS sandbox (macOS now;\n")
	b.WriteString("# graceful fallback elsewhere); \"off\" disables it. network allows egress.\n")
	if c.Sandbox.WorkspaceRoot != "" {
		fmt.Fprintf(&b, "workspace_root = %q\n", c.Sandbox.WorkspaceRoot)
	} else {
		b.WriteString("# workspace_root = \"\"            # default: current working directory\n")
	}
	if len(c.Sandbox.AllowWrite) > 0 {
		fmt.Fprintf(&b, "allow_write = %s\n", renderStringArray(c.Sandbox.AllowWrite))
	} else {
		b.WriteString("# allow_write = [\"/tmp\"]          # extra dirs writers may also modify\n")
	}
	fmt.Fprintf(&b, "bash    = %q\n", c.BashMode())
	fmt.Fprintf(&b, "network = %v\n", c.Sandbox.Network)
	b.WriteString("\n")

	b.WriteString("[statusline]\n")
	b.WriteString("# A custom status line: a command whose first stdout line replaces the built-in\n")
	b.WriteString("# data row. It receives {\"model\",\"contextUsed\",\"contextWindow\",\"cwd\"} as JSON on stdin.\n")
	if c.Statusline.Command != "" {
		fmt.Fprintf(&b, "command = %q\n", c.Statusline.Command)
	} else {
		b.WriteString("# command = \"my-statusline.sh\"\n")
	}
	b.WriteString("\n")

	b.WriteString("# External MCP servers. type: \"stdio\" (default, a subprocess) | \"http\" | \"sse\".\n")
	b.WriteString("# ${VAR} / ${VAR:-default} are expanded from the environment in command/args/env/url/headers.\n")
	if len(c.Plugins) == 0 {
		b.WriteString("# [[plugins]]\n")
		b.WriteString("# name    = \"example\"\n")
		b.WriteString("# command = \"voltui-plugin-example\"\n")
		b.WriteString("# [[plugins]]                                  # a remote server over Streamable HTTP\n")
		b.WriteString("# name    = \"stripe\"\n")
		b.WriteString("# type    = \"http\"\n")
		b.WriteString("# url     = \"https://mcp.stripe.com\"\n")
		b.WriteString("# headers = { Authorization = \"Bearer ${STRIPE_KEY}\" }\n")
	} else {
		for _, pl := range c.Plugins {
			b.WriteString("\n[[plugins]]\n")
			fmt.Fprintf(&b, "name    = %q\n", pl.Name)
			if pl.Type != "" {
				fmt.Fprintf(&b, "type    = %q\n", pl.Type)
			}
			if pl.Command != "" {
				fmt.Fprintf(&b, "command = %q\n", pl.Command)
			}
			if len(pl.Args) > 0 {
				fmt.Fprintf(&b, "args    = %s\n", renderStringArray(pl.Args))
			}
			if pl.URL != "" {
				fmt.Fprintf(&b, "url     = %q\n", pl.URL)
			}
			if len(pl.Headers) > 0 {
				fmt.Fprintf(&b, "headers = %s\n", renderStringMap(pl.Headers))
			}
			if len(pl.Env) > 0 {
				fmt.Fprintf(&b, "env     = %s\n", renderStringMap(pl.Env))
			}
			if pl.AutoStart != nil {
				fmt.Fprintf(&b, "auto_start = %v\n", *pl.AutoStart)
			}
			if strings.TrimSpace(pl.Tier) != "" {
				fmt.Fprintf(&b, "tier    = %q\n", pl.Tier)
			}
		}
	}
	b.WriteString("\n")

	b.WriteString("# Native workbench plugins and generation providers.\n")
	b.WriteString("# [workbench] plugins own product UI/workflow surfaces; providers adapt MCP,\n")
	b.WriteString("# HTTP, or local commands behind those surfaces. Keep secrets in env vars.\n")
	if len(c.Workbench.Plugins) == 0 && len(c.Workbench.Providers) == 0 {
		b.WriteString("# [[workbench.plugins]]\n")
		b.WriteString("# id           = \"content-studio\"\n")
		b.WriteString("# name         = \"Content Studio\"\n")
		b.WriteString("# kind         = \"native\"\n")
		b.WriteString("# entry        = \"content-studio\"\n")
		b.WriteString("# capabilities = [\"presentation\", \"poster\", \"video\"]\n")
		b.WriteString("# provider_ids = [\"asset-mcp\"]\n")
		b.WriteString("# [[workbench.providers]]\n")
		b.WriteString("# id           = \"asset-mcp\"\n")
		b.WriteString("# type         = \"mcp\"\n")
		b.WriteString("# server       = \"internal-assets\"\n")
		b.WriteString("# capabilities = [\"image-search\", \"asset-library\"]\n")
	} else {
		for _, pl := range c.Workbench.Plugins {
			b.WriteString("\n[[workbench.plugins]]\n")
			fmt.Fprintf(&b, "id           = %q\n", pl.ID)
			if pl.Name != "" {
				fmt.Fprintf(&b, "name         = %q\n", pl.Name)
			}
			if pl.Kind != "" {
				fmt.Fprintf(&b, "kind         = %q\n", pl.Kind)
			}
			if pl.Entry != "" {
				fmt.Fprintf(&b, "entry        = %q\n", pl.Entry)
			}
			if pl.Version != "" {
				fmt.Fprintf(&b, "version      = %q\n", pl.Version)
			}
			if len(pl.Capabilities) > 0 {
				fmt.Fprintf(&b, "capabilities = %s\n", renderStringArray(pl.Capabilities))
			}
			if len(pl.ProviderIDs) > 0 {
				fmt.Fprintf(&b, "provider_ids = %s\n", renderStringArray(pl.ProviderIDs))
			}
			if len(pl.Config) > 0 {
				fmt.Fprintf(&b, "config       = %s\n", renderStringMap(pl.Config))
			}
			if pl.Enabled != nil {
				fmt.Fprintf(&b, "enabled      = %v\n", *pl.Enabled)
			}
		}
		for _, p := range c.Workbench.Providers {
			b.WriteString("\n[[workbench.providers]]\n")
			fmt.Fprintf(&b, "id   = %q\n", p.ID)
			if p.Type != "" {
				fmt.Fprintf(&b, "type = %q\n", p.Type)
			}
			if p.Server != "" {
				fmt.Fprintf(&b, "server = %q\n", p.Server)
			}
			if p.URL != "" {
				fmt.Fprintf(&b, "url = %q\n", p.URL)
			}
			if p.Command != "" {
				fmt.Fprintf(&b, "command = %q\n", p.Command)
			}
			if len(p.Args) > 0 {
				fmt.Fprintf(&b, "args = %s\n", renderStringArray(p.Args))
			}
			if len(p.Capabilities) > 0 {
				fmt.Fprintf(&b, "capabilities = %s\n", renderStringArray(p.Capabilities))
			}
			if len(p.Headers) > 0 {
				fmt.Fprintf(&b, "headers = %s\n", renderStringMap(p.Headers))
			}
			if len(p.Env) > 0 {
				fmt.Fprintf(&b, "env = %s\n", renderStringMap(p.Env))
			}
			if len(p.Config) > 0 {
				fmt.Fprintf(&b, "config = %s\n", renderStringMap(p.Config))
			}
		}
	}

	return b.String()
}

func configVersion(c *Config) int {
	if c != nil && c.ConfigVersion > 0 {
		return c.ConfigVersion
	}
	return Default().ConfigVersion
}

func shouldRenderUI(c, defaults *Config, scope RenderScope) bool {
	if scope != RenderScopeProject {
		return true
	}
	return !reflect.DeepEqual(c.UI, defaults.UI)
}

func shouldRenderNetwork(c, defaults *Config, scope RenderScope) bool {
	if scope != RenderScopeProject {
		return true
	}
	return !reflect.DeepEqual(c.Network, defaults.Network)
}

func shouldRenderProviders(c, defaults *Config, scope RenderScope) bool {
	if scope != RenderScopeProject {
		return true
	}
	return !reflect.DeepEqual(c.Providers, defaults.Providers)
}

func shouldRenderBot(c, defaults *Config, scope RenderScope) bool {
	if scope != RenderScopeProject {
		return true
	}
	return !reflect.DeepEqual(c.Bot, defaults.Bot)
}

func shouldRenderSystemPrompt(c, defaults *Config, scope RenderScope) bool {
	if scope == RenderScopeFull {
		return true
	}
	return strings.TrimSpace(c.Agent.SystemPrompt) != "" && c.Agent.SystemPrompt != defaults.Agent.SystemPrompt
}

func renderBotConfig(b *strings.Builder, bot BotConfig) {
	b.WriteString("[bot]\n")
	fmt.Fprintf(b, "enabled = %t\n", bot.Enabled)
	if strings.TrimSpace(bot.Model) != "" {
		fmt.Fprintf(b, "model = %q\n", bot.Model)
	}
	if strings.TrimSpace(bot.ToolApprovalMode) != "" {
		fmt.Fprintf(b, "tool_approval_mode = %q\n", bot.ToolApprovalMode)
	}
	if bot.MaxSteps > 0 {
		fmt.Fprintf(b, "max_steps = %d\n", bot.MaxSteps)
	}
	if bot.DebounceMs > 0 {
		fmt.Fprintf(b, "debounce_ms = %d\n", bot.DebounceMs)
	}
	b.WriteString("\n[bot.allowlist]\n")
	fmt.Fprintf(b, "enabled = %t\n", bot.Allowlist.Enabled)
	fmt.Fprintf(b, "allow_all = %t\n", bot.Allowlist.AllowAll)
	fmt.Fprintf(b, "qq_users = %s\n", renderStringArray(bot.Allowlist.QQUsers))
	fmt.Fprintf(b, "feishu_users = %s\n", renderStringArray(bot.Allowlist.FeishuUsers))
	fmt.Fprintf(b, "weixin_users = %s\n", renderStringArray(bot.Allowlist.WeixinUsers))
	fmt.Fprintf(b, "qq_groups = %s\n", renderStringArray(bot.Allowlist.QQGroups))
	fmt.Fprintf(b, "feishu_groups = %s\n", renderStringArray(bot.Allowlist.FeishuGroups))
	fmt.Fprintf(b, "weixin_groups = %s\n", renderStringArray(bot.Allowlist.WeixinGroups))

	b.WriteString("\n[bot.qq]\n")
	fmt.Fprintf(b, "enabled = %t\n", bot.QQ.Enabled)
	if strings.TrimSpace(bot.QQ.AppID) != "" {
		fmt.Fprintf(b, "app_id = %q\n", bot.QQ.AppID)
	}
	if strings.TrimSpace(bot.QQ.AppSecretEnv) != "" {
		fmt.Fprintf(b, "app_secret_env = %q\n", bot.QQ.AppSecretEnv)
	}
	fmt.Fprintf(b, "sandbox = %t\n", bot.QQ.Sandbox)

	b.WriteString("\n[bot.feishu]\n")
	fmt.Fprintf(b, "enabled = %t\n", bot.Feishu.Enabled)
	if strings.TrimSpace(bot.Feishu.Domain) != "" {
		fmt.Fprintf(b, "domain = %q\n", bot.Feishu.Domain)
	}
	if strings.TrimSpace(bot.Feishu.AppID) != "" {
		fmt.Fprintf(b, "app_id = %q\n", bot.Feishu.AppID)
	}
	if strings.TrimSpace(bot.Feishu.AppSecretEnv) != "" {
		fmt.Fprintf(b, "app_secret_env = %q\n", bot.Feishu.AppSecretEnv)
	}
	if strings.TrimSpace(bot.Feishu.VerificationToken) != "" {
		fmt.Fprintf(b, "verification_token = %q\n", bot.Feishu.VerificationToken)
	}
	if strings.TrimSpace(bot.Feishu.Mode) != "" {
		fmt.Fprintf(b, "mode = %q\n", bot.Feishu.Mode)
	}
	if bot.Feishu.WebhookPort > 0 {
		fmt.Fprintf(b, "webhook_port = %d\n", bot.Feishu.WebhookPort)
	}
	fmt.Fprintf(b, "require_mention = %t\n", bot.Feishu.RequireMention)

	b.WriteString("\n[bot.weixin]\n")
	fmt.Fprintf(b, "enabled = %t\n", bot.Weixin.Enabled)
	if strings.TrimSpace(bot.Weixin.AccountID) != "" {
		fmt.Fprintf(b, "account_id = %q\n", bot.Weixin.AccountID)
	}
	if strings.TrimSpace(bot.Weixin.TokenEnv) != "" {
		fmt.Fprintf(b, "token_env = %q\n", bot.Weixin.TokenEnv)
	}
	if strings.TrimSpace(bot.Weixin.APIBase) != "" {
		fmt.Fprintf(b, "api_base = %q\n", bot.Weixin.APIBase)
	}

	for _, conn := range bot.Connections {
		b.WriteString("\n[[bot.connections]]\n")
		fmt.Fprintf(b, "id = %q\n", conn.ID)
		fmt.Fprintf(b, "provider = %q\n", conn.Provider)
		if strings.TrimSpace(conn.Domain) != "" {
			fmt.Fprintf(b, "domain = %q\n", conn.Domain)
		}
		if strings.TrimSpace(conn.Label) != "" {
			fmt.Fprintf(b, "label = %q\n", conn.Label)
		}
		fmt.Fprintf(b, "enabled = %t\n", conn.Enabled)
		if strings.TrimSpace(conn.Status) != "" {
			fmt.Fprintf(b, "status = %q\n", conn.Status)
		}
		if strings.TrimSpace(conn.Model) != "" {
			fmt.Fprintf(b, "model = %q\n", conn.Model)
		}
		if strings.TrimSpace(conn.ToolApprovalMode) != "" {
			fmt.Fprintf(b, "tool_approval_mode = %q\n", conn.ToolApprovalMode)
		}
		if strings.TrimSpace(conn.WorkspaceRoot) != "" {
			fmt.Fprintf(b, "workspace_root = %q\n", conn.WorkspaceRoot)
		}
		if strings.TrimSpace(conn.LastError) != "" {
			fmt.Fprintf(b, "last_error = %q\n", conn.LastError)
		}
		if strings.TrimSpace(conn.CreatedAt) != "" {
			fmt.Fprintf(b, "created_at = %q\n", conn.CreatedAt)
		}
		if strings.TrimSpace(conn.UpdatedAt) != "" {
			fmt.Fprintf(b, "updated_at = %q\n", conn.UpdatedAt)
		}
		if botConnectionCredentialConfigured(conn.Credential) {
			b.WriteString("[bot.connections.credential]\n")
			if strings.TrimSpace(conn.Credential.AppID) != "" {
				fmt.Fprintf(b, "app_id = %q\n", conn.Credential.AppID)
			}
			if strings.TrimSpace(conn.Credential.AppSecretEnv) != "" {
				fmt.Fprintf(b, "app_secret_env = %q\n", conn.Credential.AppSecretEnv)
			}
			if strings.TrimSpace(conn.Credential.AccountID) != "" {
				fmt.Fprintf(b, "account_id = %q\n", conn.Credential.AccountID)
			}
			if strings.TrimSpace(conn.Credential.TokenEnv) != "" {
				fmt.Fprintf(b, "token_env = %q\n", conn.Credential.TokenEnv)
			}
		}
		for _, mapping := range conn.SessionMappings {
			b.WriteString("[[bot.connections.session_mappings]]\n")
			if strings.TrimSpace(mapping.RemoteID) != "" {
				fmt.Fprintf(b, "remote_id = %q\n", mapping.RemoteID)
			}
			if strings.TrimSpace(mapping.SessionID) != "" {
				fmt.Fprintf(b, "session_id = %q\n", mapping.SessionID)
			}
			if strings.TrimSpace(mapping.SessionSource) != "" {
				fmt.Fprintf(b, "session_source = %q\n", mapping.SessionSource)
			}
			if strings.TrimSpace(mapping.ChatType) != "" {
				fmt.Fprintf(b, "chat_type = %q\n", mapping.ChatType)
			}
			if strings.TrimSpace(mapping.UserID) != "" {
				fmt.Fprintf(b, "user_id = %q\n", mapping.UserID)
			}
			if strings.TrimSpace(mapping.ThreadID) != "" {
				fmt.Fprintf(b, "thread_id = %q\n", mapping.ThreadID)
			}
			if strings.TrimSpace(mapping.Scope) != "" {
				fmt.Fprintf(b, "scope = %q\n", mapping.Scope)
			}
			if strings.TrimSpace(mapping.WorkspaceRoot) != "" {
				fmt.Fprintf(b, "workspace_root = %q\n", mapping.WorkspaceRoot)
			}
			if strings.TrimSpace(mapping.UpdatedAt) != "" {
				fmt.Fprintf(b, "updated_at = %q\n", mapping.UpdatedAt)
			}
		}
	}
	b.WriteString("\n")
}

func botConnectionCredentialConfigured(cred BotConnectionCredential) bool {
	return strings.TrimSpace(cred.AppID) != "" ||
		strings.TrimSpace(cred.AppSecretEnv) != "" ||
		strings.TrimSpace(cred.AccountID) != "" ||
		strings.TrimSpace(cred.TokenEnv) != ""
}

// renderStringArray renders a []string as a TOML inline array.
func renderStringArray(ss []string) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, s := range ss {
		if i > 0 {
			b.WriteString(", ")
		}
		fmt.Fprintf(&b, "%q", s)
	}
	b.WriteByte(']')
	return b.String()
}

// renderStringMap renders a map[string]string as a TOML inline table with keys
// in sorted order so output is deterministic (round-trips cleanly).
func renderStringMap(m map[string]string) string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	var b strings.Builder
	b.WriteString("{ ")
	for i, k := range keys {
		if i > 0 {
			b.WriteString(", ")
		}
		fmt.Fprintf(&b, "%s = %q", k, m[k])
	}
	b.WriteString(" }")
	return b.String()
}

// renderRuleList emits a permission rule list. A populated list renders as an
// active TOML array; an empty one renders as a commented example so `voltui setup`
// scaffolds discoverable guidance without imposing surprising rules.
func renderRuleList(key string, rules []string, example string) string {
	if len(rules) == 0 {
		return fmt.Sprintf("# %s = %s\n", key, example)
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%s = [", key)
	for i, r := range rules {
		if i > 0 {
			b.WriteString(", ")
		}
		fmt.Fprintf(&b, "%q", r)
	}
	b.WriteString("]\n")
	return b.String()
}

// formatFloat ensures a float renders with a decimal point so TOML types it as a
// float, not an integer (e.g. 0 -> "0.0").
func formatFloat(f float64) string {
	s := strconv.FormatFloat(f, 'f', -1, 64)
	if !strings.Contains(s, ".") {
		s += ".0"
	}
	return s
}
