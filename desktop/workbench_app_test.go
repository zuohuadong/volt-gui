package main

import (
	"os"
	"path/filepath"
	"testing"

	"voltui/internal/config"
	"voltui/internal/workbench"
)

func TestWorkbenchBindingsExposeConfigAndJobs(t *testing.T) {
	isolateDesktopUserDirs(t)
	root := t.TempDir()
	cfg := `[[workbench.plugins]]
id = "content-studio"
name = "Content Studio"
kind = "native"
entry = "content-studio"
capabilities = ["presentation", "poster", "video"]
provider_ids = ["asset-mcp"]

[[workbench.providers]]
id = "asset-mcp"
type = "mcp"
server = "internal-assets"
capabilities = ["image-search"]
headers = { Authorization = "Bearer ${ASSET_TOKEN}" }
env = { ASSET_TOKEN = "${ASSET_TOKEN}" }
`
	if err := os.WriteFile(filepath.Join(root, "voltui.toml"), []byte(cfg), 0o644); err != nil {
		t.Fatalf("write config: %v", err)
	}

	app := NewApp()
	tab := testTab("workbench", root)
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID

	plugins := app.WorkbenchPlugins()
	contentStudio, ok := findWorkbenchPlugin(plugins, "content-studio")
	if len(plugins) != 2 || !ok || !contentStudio.Enabled {
		t.Fatalf("WorkbenchPlugins = %+v", plugins)
	}
	if cloudflareDrop, ok := findWorkbenchPlugin(plugins, cloudflareDropPluginID); !ok || cloudflareDrop.Enabled {
		t.Fatalf("WorkbenchPlugins Cloudflare Drop = %+v", plugins)
	}
	providers := app.WorkbenchProviders()
	if len(providers) != 1 || providers[0].ID != "asset-mcp" || len(providers[0].HeaderKeys) != 1 || providers[0].HeaderKeys[0] != "Authorization" {
		t.Fatalf("WorkbenchProviders = %+v", providers)
	}
	if len(providers[0].EnvKeys) != 1 || providers[0].EnvKeys[0] != "ASSET_TOKEN" {
		t.Fatalf("WorkbenchProviders env keys = %+v", providers[0].EnvKeys)
	}

	job, err := app.CreateWorkbenchJob(workbench.CreateJobInput{
		PluginID: "content-studio",
		Kind:     "presentation",
		Scenario: "发布会",
		Mode:     "manual",
		Steps: []workbench.CreateStepInput{
			{ID: "outline", Name: "Outline"},
			{ID: "layout", Name: "Layout"},
			{ID: "visuals", Name: "Visuals"},
		},
	})
	if err != nil {
		t.Fatalf("CreateWorkbenchJob: %v", err)
	}
	if job.PluginID != "content-studio" || job.CurrentStep != "outline" {
		t.Fatalf("job = %+v", job)
	}
	updated, err := app.UpdateWorkbenchStep(job.ID, "outline", workbench.UpdateStepInput{Status: workbench.StatusDone, Output: map[string]any{"slides": float64(10)}})
	if err != nil {
		t.Fatalf("UpdateWorkbenchStep: %v", err)
	}
	if updated.CurrentStep != "layout" || updated.Steps[0].Output["slides"] != float64(10) {
		t.Fatalf("updated job = %+v", updated)
	}
	withArtifact, err := app.AddWorkbenchArtifact(job.ID, workbench.ArtifactInput{Kind: "pptx", Name: "deck.pptx", Path: "outputs/deck.pptx"})
	if err != nil {
		t.Fatalf("AddWorkbenchArtifact: %v", err)
	}
	if len(withArtifact.Artifacts) != 1 {
		t.Fatalf("artifacts = %+v", withArtifact.Artifacts)
	}
	jobs := app.ListWorkbenchJobs()
	if len(jobs) != 1 || jobs[0].ID != job.ID {
		t.Fatalf("ListWorkbenchJobs = %+v", jobs)
	}
	artifactDir, err := app.WorkbenchArtifactDir(job.ID)
	if err != nil {
		t.Fatalf("WorkbenchArtifactDir: %v", err)
	}
	if filepath.Dir(artifactDir) != filepath.Join(root, ".voltui", "workbench", "artifacts") {
		t.Fatalf("artifact dir = %q", artifactDir)
	}
}

func TestWorkbenchBindingsFallbackWhenConfigMissing(t *testing.T) {
	isolateDesktopUserDirs(t)
	cfg := config.LoadForEdit(config.UserConfigPath())
	if err := cfg.SaveTo(config.UserConfigPath()); err != nil {
		t.Fatalf("save user config: %v", err)
	}
	app := NewApp()
	if got := app.WorkbenchPlugins(); len(got) != 1 || got[0].ID != cloudflareDropPluginID || got[0].Enabled {
		t.Fatalf("WorkbenchPlugins = %+v, want default-disabled Cloudflare Drop plugin", got)
	}
	if got := app.ListWorkbenchJobs(); len(got) != 0 {
		t.Fatalf("ListWorkbenchJobs = %+v, want empty", got)
	}
}

func TestWorkbenchPluginSavePersistsEnabledState(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()

	input := WorkbenchPluginInput{
		ID:           "contract-review",
		Name:         "Contract Review",
		Kind:         "native",
		Entry:        "contract-review",
		Version:      "v1.2.0",
		Capabilities: []string{"review", "risk-check"},
		ProviderIDs:  []string{"legal-mcp"},
		Config:       map[string]string{"permission": "workspace"},
		Enabled:      true,
	}
	if err := app.SaveWorkbenchPlugin(input); err != nil {
		t.Fatalf("SaveWorkbenchPlugin create: %v", err)
	}
	plugins := app.WorkbenchPlugins()
	if len(plugins) != 2 {
		t.Fatalf("WorkbenchPlugins length = %d, want 2: %+v", len(plugins), plugins)
	}
	plugin, ok := findWorkbenchPlugin(plugins, input.ID)
	if !ok {
		t.Fatalf("WorkbenchPlugins missing saved plugin: %+v", plugins)
	}
	if plugin.ID != input.ID || plugin.Name != input.Name || !plugin.Enabled {
		t.Fatalf("WorkbenchPlugins saved plugin = %+v", plugin)
	}
	if len(plugin.Capabilities) != 2 || plugin.Capabilities[1] != "risk-check" {
		t.Fatalf("WorkbenchPlugins capabilities = %+v", plugin.Capabilities)
	}
	if plugin.Config["permission"] != "workspace" {
		t.Fatalf("WorkbenchPlugins config = %+v", plugin.Config)
	}

	input.Enabled = false
	input.Version = "v1.2.1"
	if err := app.SaveWorkbenchPlugin(input); err != nil {
		t.Fatalf("SaveWorkbenchPlugin update: %v", err)
	}
	plugins = app.WorkbenchPlugins()
	if len(plugins) != 2 {
		t.Fatalf("WorkbenchPlugins after update length = %d, want 2: %+v", len(plugins), plugins)
	}
	plugin, ok = findWorkbenchPlugin(plugins, input.ID)
	if !ok || plugin.Enabled || plugin.Version != "v1.2.1" {
		t.Fatalf("WorkbenchPlugins updated plugin = %+v", plugins)
	}
}

func findWorkbenchPlugin(plugins []workbench.Plugin, id string) (workbench.Plugin, bool) {
	for _, plugin := range plugins {
		if plugin.ID == id {
			return plugin, true
		}
	}
	return workbench.Plugin{}, false
}
