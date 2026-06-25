package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/BurntSushi/toml"
)

// TestRenderTOMLRoundTrips ensures the annotated TOML we emit parses back into
// an equivalent config — i.e. the wizard never writes a file it can't read.
func TestRenderTOMLRoundTrips(t *testing.T) {
	orig := Default()
	orig.DefaultModel = "mimo-pro"
	orig.Language = "zh"
	orig.UI.Theme = "light"
	orig.UI.ThemeStyle = "glacier"
	orig.Desktop.Language = "en"
	orig.Desktop.Theme = "dark"
	orig.Desktop.ThemeStyle = "graphite"
	orig.Desktop.CloseBehavior = "background"
	orig.Agent.AutoPlanClassifier = "deepseek-flash"
	orig.Agent.SubagentModel = "mimo-pro"
	orig.Agent.SubagentModels = map[string]string{"review": "deepseek-pro"}
	orig.Permissions = PermissionsConfig{
		Mode:  "deny",
		Deny:  []string{"bash(rm -rf*)"},
		Allow: []string{"bash(go test*)", "read_file"},
	}
	orig.Network = NetworkConfig{
		ProxyMode: "custom",
		NoProxy:   "localhost,127.0.0.1",
		Proxy: NetworkProxyConfig{
			Type:     "socks5",
			Server:   "127.0.0.1",
			Port:     7890,
			Username: "user",
			Password: "${VOLTUI_PROXY_PASSWORD}",
		},
	}
	orig.Skills.Paths = []string{"~/my-skills", "../shared/skills"}
	orig.Skills.DisabledSkills = []string{"review", "explore"}
	orig.Codegraph = CodegraphConfig{Enabled: true, AutoInstall: false, Path: "/opt/codegraph", Tier: "background"}
	orig.Plugins = []PluginEntry{
		{Name: "example", Command: "voltui-plugin-example"},
		{Name: "stripe", Type: "http", URL: "https://mcp.stripe.com", Headers: map[string]string{"Authorization": "Bearer x"}, AutoStart: boolPtr(false), Tier: "background"},
	}
	orig.Providers = append(orig.Providers, ProviderEntry{
		Name:      "render-smoke",
		Kind:      "openai",
		BaseURL:   "http://localhost:8000/v1",
		Model:     "render-model",
		Models:    []string{"render-model"},
		Priority:  10,
		APIKeyEnv: "RENDER_MODEL_KEY",
		Effort:    "max",
	})
	orig.Workbench = WorkbenchConfig{
		Plugins: []WorkbenchPluginEntry{{
			ID:           "content-studio",
			Name:         "Content Studio",
			Kind:         "native",
			Entry:        "content-studio",
			Version:      "1.0.0",
			Capabilities: []string{"presentation", "poster", "video"},
			ProviderIDs:  []string{"asset-mcp"},
			Config:       map[string]string{"default_mode": "manual"},
			Enabled:      boolPtr(true),
		}},
		Providers: []WorkbenchProviderEntry{{
			ID:           "asset-mcp",
			Type:         "mcp",
			Server:       "internal-assets",
			Capabilities: []string{"image-search", "asset-library"},
			Headers:      map[string]string{"X-Team": "creative"},
			Config:       map[string]string{"asset_root": "${ASSET_ROOT}"},
		}},
	}

	rendered := RenderTOML(orig)

	var got Config
	if _, err := toml.Decode(rendered, &got); err != nil {
		t.Fatalf("rendered TOML does not parse: %v\n---\n%s", err, rendered)
	}

	if got.DefaultModel != "mimo-pro" {
		t.Errorf("default_model = %q, want mimo-pro", got.DefaultModel)
	}
	if got.ConfigVersion != 3 {
		t.Errorf("config_version = %d, want 3", got.ConfigVersion)
	}
	if got.Language != "zh" {
		t.Errorf("language = %q, want zh", got.Language)
	}
	if len(got.Providers) == 0 || got.Providers[len(got.Providers)-1].Priority != 10 {
		t.Errorf("provider priority did not round-trip: %+v", got.Providers)
	}
	if got.UI.Theme != "light" {
		t.Errorf("ui.theme = %q, want light", got.UI.Theme)
	}
	if got.UI.ThemeStyle != "glacier" {
		t.Errorf("ui.theme_style = %q, want glacier", got.UI.ThemeStyle)
	}
	if got.Desktop.Language != "en" {
		t.Errorf("desktop.language = %q, want en", got.Desktop.Language)
	}
	if got.Desktop.Theme != "dark" {
		t.Errorf("desktop.theme = %q, want dark", got.Desktop.Theme)
	}
	if got.Desktop.ThemeStyle != "graphite" {
		t.Errorf("desktop.theme_style = %q, want graphite", got.Desktop.ThemeStyle)
	}
	if got.Desktop.CloseBehavior != "background" {
		t.Errorf("desktop.close_behavior = %q, want background", got.Desktop.CloseBehavior)
	}
	if got.Agent.MaxSteps != orig.Agent.MaxSteps {
		t.Errorf("max_steps = %d, want %d", got.Agent.MaxSteps, orig.Agent.MaxSteps)
	}
	if got.Agent.Temperature != orig.Agent.Temperature {
		t.Errorf("temperature = %v, want %v", got.Agent.Temperature, orig.Agent.Temperature)
	}
	if got.Agent.AutoPlan != "off" {
		t.Errorf("auto_plan = %q, want off", got.Agent.AutoPlan)
	}
	if got.Agent.AutoPlanClassifier != "deepseek-flash" {
		t.Errorf("auto_plan_classifier = %q, want deepseek-flash", got.Agent.AutoPlanClassifier)
	}
	if got.Agent.SoftCompactRatio != orig.Agent.SoftCompactRatio {
		t.Errorf("soft_compact_ratio = %v, want %v", got.Agent.SoftCompactRatio, orig.Agent.SoftCompactRatio)
	}
	if got.Agent.CompactRatio != orig.Agent.CompactRatio {
		t.Errorf("compact_ratio = %v, want %v", got.Agent.CompactRatio, orig.Agent.CompactRatio)
	}
	if got.Agent.CompactForceRatio != orig.Agent.CompactForceRatio {
		t.Errorf("compact_force_ratio = %v, want %v", got.Agent.CompactForceRatio, orig.Agent.CompactForceRatio)
	}
	if got.Agent.SystemPrompt != orig.Agent.SystemPrompt {
		t.Errorf("system_prompt mismatch:\n got %q\nwant %q", got.Agent.SystemPrompt, orig.Agent.SystemPrompt)
	}
	if !got.Codegraph.Enabled {
		t.Error("codegraph.enabled = false, want true")
	}
	if got.Codegraph.AutoInstall {
		t.Error("codegraph.auto_install = true, want false")
	}
	if got.Codegraph.Path != "/opt/codegraph" {
		t.Errorf("codegraph.path = %q, want /opt/codegraph", got.Codegraph.Path)
	}
	if got.Codegraph.Tier != "background" {
		t.Errorf("codegraph.tier = %q, want background", got.Codegraph.Tier)
	}
	if got.Agent.SubagentModel != "mimo-pro" {
		t.Errorf("subagent_model = %q, want mimo-pro", got.Agent.SubagentModel)
	}
	if got.Agent.SubagentModels["review"] != "deepseek-pro" {
		t.Errorf("subagent_models.review = %q, want deepseek-pro", got.Agent.SubagentModels["review"])
	}
	if g, _ := got.Provider("render-smoke"); g == nil || g.BaseURL != "http://localhost:8000/v1" || g.Effort != "max" {
		t.Errorf("render-smoke provider not preserved: %+v", g)
	}
	if len(got.Providers) != len(orig.Providers) {
		t.Errorf("providers count = %d, want %d", len(got.Providers), len(orig.Providers))
	}
	if got.Permissions.Mode != "deny" {
		t.Errorf("permissions.mode = %q, want deny", got.Permissions.Mode)
	}
	if len(got.Permissions.Deny) != 1 || got.Permissions.Deny[0] != "bash(rm -rf*)" {
		t.Errorf("permissions.deny = %v, want [bash(rm -rf*)]", got.Permissions.Deny)
	}
	if len(got.Permissions.Allow) != 2 {
		t.Errorf("permissions.allow = %v, want 2 entries", got.Permissions.Allow)
	}
	if got.Network.ProxyMode != "custom" || got.Network.Proxy.Type != "socks5" || got.Network.Proxy.Port != 7890 {
		t.Errorf("network proxy not preserved: %+v", got.Network)
	}
	if len(got.Skills.Paths) != 2 || got.Skills.Paths[0] != "~/my-skills" {
		t.Errorf("skills.paths = %v", got.Skills.Paths)
	}
	if len(got.Skills.DisabledSkills) != 2 || got.Skills.DisabledSkills[0] != "review" || got.Skills.DisabledSkills[1] != "explore" {
		t.Errorf("skills.disabled_skills = %v", got.Skills.DisabledSkills)
	}
	if len(got.Plugins) != 2 {
		t.Fatalf("plugins count = %d, want 2", len(got.Plugins))
	}
	stripe := got.Plugins[1]
	if stripe.Name != "stripe" || stripe.Type != "http" || stripe.URL != "https://mcp.stripe.com" {
		t.Errorf("http plugin not preserved: %+v", stripe)
	}
	if stripe.Headers["Authorization"] != "Bearer x" {
		t.Errorf("plugin headers not preserved: %v", stripe.Headers)
	}
	if stripe.AutoStart == nil || *stripe.AutoStart {
		t.Errorf("auto_start should render and parse as false, got %+v", stripe.AutoStart)
	}
	if stripe.Tier != "background" {
		t.Errorf("plugin tier should render and parse as background, got %q", stripe.Tier)
	}
	if len(got.Workbench.Plugins) != 1 {
		t.Fatalf("workbench plugins count = %d, want 1", len(got.Workbench.Plugins))
	}
	workbenchPlugin := got.Workbench.Plugins[0]
	if workbenchPlugin.ID != "content-studio" || workbenchPlugin.Kind != "native" || workbenchPlugin.Entry != "content-studio" {
		t.Errorf("workbench plugin not preserved: %+v", workbenchPlugin)
	}
	if !workbenchPlugin.IsEnabled() || len(workbenchPlugin.Capabilities) != 3 || workbenchPlugin.Capabilities[2] != "video" {
		t.Errorf("workbench plugin capabilities/enabled not preserved: %+v", workbenchPlugin)
	}
	if len(workbenchPlugin.ProviderIDs) != 1 || workbenchPlugin.ProviderIDs[0] != "asset-mcp" || workbenchPlugin.Config["default_mode"] != "manual" {
		t.Errorf("workbench plugin provider/config not preserved: %+v", workbenchPlugin)
	}
	if len(got.Workbench.Providers) != 1 {
		t.Fatalf("workbench providers count = %d, want 1", len(got.Workbench.Providers))
	}
	workbenchProvider := got.Workbench.Providers[0]
	if workbenchProvider.ID != "asset-mcp" || workbenchProvider.Type != "mcp" || workbenchProvider.Server != "internal-assets" {
		t.Errorf("workbench provider not preserved: %+v", workbenchProvider)
	}
	if workbenchProvider.Headers["X-Team"] != "creative" || workbenchProvider.Config["asset_root"] != "${ASSET_ROOT}" {
		t.Errorf("workbench provider headers/config not preserved: %+v", workbenchProvider)
	}
}

func TestScopedRenderSeparatesUserAndProjectConfig(t *testing.T) {
	c := Default()
	c.Language = "zh"
	c.Desktop.Language = "zh"
	c.Desktop.Theme = "dark"
	c.Desktop.ThemeStyle = "graphite"
	c.Desktop.CloseBehavior = "background"

	user := RenderTOMLForScope(c, RenderScopeUser)
	for _, want := range []string{"config_version = 3", "[desktop]", `theme = "dark"`, `close_behavior = "background"`} {
		if !strings.Contains(user, want) {
			t.Fatalf("user render missing %q:\n%s", want, user)
		}
	}

	project := RenderTOMLForScope(c, RenderScopeProject)
	for _, forbidden := range []string{"[desktop]", "close_behavior ="} {
		if strings.Contains(project, forbidden) {
			t.Fatalf("project render should not contain %q:\n%s", forbidden, project)
		}
	}
	if strings.Contains(project, "\nsystem_prompt = \"\"\"") {
		t.Fatalf("project render should not pin the built-in system prompt:\n%s", project)
	}
	if !strings.Contains(project, "# system_prompt =") {
		t.Fatalf("project render should leave a system prompt hint:\n%s", project)
	}
}

func TestProjectRenderPreservesNonDefaultLegacySections(t *testing.T) {
	c := Default()
	c.UI.Theme = "light"
	c.UI.CloseBehavior = "quit"
	c.Network.ProxyMode = "custom"
	c.Network.Proxy.Server = "127.0.0.1"
	c.Network.Proxy.Port = 7890

	project := RenderTOMLForScope(c, RenderScopeProject)
	for _, want := range []string{"[ui]", `theme = "light"`, `close_behavior = "quit"`, "[network]", `proxy_mode = "custom"`, `server = "127.0.0.1"`} {
		if !strings.Contains(project, want) {
			t.Fatalf("project render missing legacy/non-default %q:\n%s", want, project)
		}
	}
}

func TestLoadForRootMergesWorkbenchConfigByID(t *testing.T) {
	home := t.TempDir()
	xdg := filepath.Join(home, ".config")
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", xdg)
	t.Setenv("AppData", filepath.Join(home, "AppData"))
	if err := os.MkdirAll(filepath.Dir(userConfigPath()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(userConfigPath(), []byte(`
[[workbench.plugins]]
id = "global-studio"
name = "Global Studio"
kind = "native"
entry = "global-studio"

[[workbench.providers]]
id = "shared-render"
type = "mcp"
server = "global-render"
`), 0o644); err != nil {
		t.Fatal(err)
	}
	project := t.TempDir()
	if err := os.WriteFile(filepath.Join(project, "voltui.toml"), []byte(`
[[workbench.plugins]]
id = "project-studio"
name = "Project Studio"
kind = "native"
entry = "project-studio"

[[workbench.providers]]
id = "shared-render"
type = "http"
url = "https://render.example.com"
`), 0o644); err != nil {
		t.Fatal(err)
	}

	cfg, err := LoadForRoot(project)
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.Workbench.Plugins) != 2 {
		t.Fatalf("workbench plugins = %+v, want global + project", cfg.Workbench.Plugins)
	}
	if len(cfg.Workbench.Providers) != 1 || cfg.Workbench.Providers[0].Type != "http" {
		t.Fatalf("workbench providers = %+v, want project override", cfg.Workbench.Providers)
	}
}

func boolPtr(v bool) *bool { return &v }
