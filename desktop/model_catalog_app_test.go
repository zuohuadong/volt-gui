package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sync/atomic"
	"testing"

	"voltui/internal/config"
)

func TestRefreshModelsForTabUsesLiveProviderCatalog(t *testing.T) {
	isolateDesktopUserDirs(t)
	setDesktopTestCredential(t, "LOCAL_API_KEY", "sk-test")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/models" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"chat-model"},{"id":"image-gpu5"}]}`))
	}))
	defer server.Close()

	writeModelCatalogTestConfig(t, server.URL+"/v1")
	app := modelCatalogTestApp("local/chat-model")

	models := app.RefreshModelsForTab("tab")
	if len(models) != 1 || models[0].Ref != "local/chat-model" || models[0].Availability != "available" {
		t.Fatalf("RefreshModelsForTab() = %+v, want only live chat model", models)
	}
}

func TestRefreshModelsForTabProbesSharedGatewayOnce(t *testing.T) {
	isolateDesktopUserDirs(t)
	setDesktopTestCredential(t, "LOCAL_API_KEY", "sk-test")

	var requestCount atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		requestCount.Add(1)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"chat-model"}]}`))
	}))
	defer server.Close()

	writeSharedModelCatalogTestConfig(t, server.URL+"/v1")
	models := modelCatalogTestApp("local/chat-model").RefreshModelsForTab("tab")
	if requestCount.Load() != 1 {
		t.Fatalf("model catalog requests = %d, want 1", requestCount.Load())
	}
	if len(models) != 2 {
		t.Fatalf("RefreshModelsForTab() = %+v, want one model for each provider", models)
	}
}

func TestRefreshModelsForTabAddsNewLiveModelForProviderNamespace(t *testing.T) {
	isolateDesktopUserDirs(t)
	setDesktopTestCredential(t, "LOCAL_API_KEY", "sk-test")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"qwen-gpu4/new-model"}]}`))
	}))
	defer server.Close()

	if err := os.MkdirAll(filepath.Dir(config.UserConfigPath()), 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	cfg := config.Default()
	cfg.DefaultModel = "qwen-thinking/qwen-gpu4/old-model"
	cfg.Desktop.ProviderAccess = []string{"qwen-thinking", "glm-5.2"}
	cfg.Providers = []config.ProviderEntry{
		{
			Name: "qwen-thinking", Kind: "openai", BaseURL: server.URL + "/v1",
			Models: []string{"qwen-gpu4/old-model"}, Default: "qwen-gpu4/old-model", APIKeyEnv: "LOCAL_API_KEY",
		},
		{
			Name: "glm-5.2", Kind: "openai", BaseURL: server.URL + "/v1",
			Models: []string{"glm-primary/old-model"}, Default: "glm-primary/old-model", APIKeyEnv: "LOCAL_API_KEY",
		},
	}
	if err := cfg.SaveTo(config.UserConfigPath()); err != nil {
		t.Fatalf("save config: %v", err)
	}

	models := modelCatalogTestApp("qwen-thinking/qwen-gpu4/old-model").RefreshModelsForTab("tab")
	var found ModelInfo
	for _, model := range models {
		if model.Ref == "qwen-thinking/qwen-gpu4/new-model" {
			found = model
			break
		}
	}
	if found.Availability != "available" || found.Provider != "qwen-thinking" {
		t.Fatalf("new live model = %+v, want available qwen-thinking entry", found)
	}
}

func TestReconcileModelCatalogDoesNotCrossSingleProviderNamespace(t *testing.T) {
	configured := []ModelInfo{{
		Ref:      "qwen-thinking/qwen-gpu4/chat-model",
		Provider: "qwen-thinking",
		Model:    "qwen-gpu4/chat-model",
	}}
	probeKeys := map[string]string{"qwen-thinking": "gateway"}
	outcomes := map[string]modelCatalogProbeOutcome{
		"gateway": {modelIDs: []string{
			"qwen-gpu4/chat-model",
			"glm-primary/glm-5.2-nvfp4",
			"glm-5.2",
		}},
	}

	models := reconcileModelCatalog(configured, probeKeys, outcomes)
	if len(models) != 1 || models[0].Ref != configured[0].Ref || models[0].Availability != "available" {
		t.Fatalf("reconciled catalog = %+v, want only the qwen-gpu4 model", models)
	}
}

func TestReconcileModelCatalogMapsBareModelToMatchingProviderName(t *testing.T) {
	configured := []ModelInfo{
		{Ref: "glm-5.2/glm-primary/glm-5.2-nvfp4", Provider: "glm-5.2", Model: "glm-primary/glm-5.2-nvfp4"},
		{Ref: "qwen-thinking/qwen-gpu4/chat-model", Provider: "qwen-thinking", Model: "qwen-gpu4/chat-model"},
	}
	probeKeys := map[string]string{"glm-5.2": "gateway", "qwen-thinking": "gateway"}
	outcomes := map[string]modelCatalogProbeOutcome{
		"gateway": {modelIDs: []string{"glm-5.2", "glm-primary/glm-5.2-nvfp4", "qwen-gpu4/chat-model"}},
	}

	models := reconcileModelCatalog(configured, probeKeys, outcomes)
	for _, model := range models {
		if model.Ref == "glm-5.2/glm-5.2" && model.Availability == "available" {
			return
		}
		if model.Ref == "qwen-thinking/glm-5.2" {
			t.Fatalf("bare GLM model mapped to qwen provider: %+v", model)
		}
	}
	t.Fatalf("bare GLM model missing from reconciled catalog: %+v", models)
}

func TestReconcileModelCatalogSkipsAmbiguousNamespaceModel(t *testing.T) {
	configured := []ModelInfo{
		{Ref: "relay-a/qwen-gpu4/old-a", Provider: "relay-a", Model: "qwen-gpu4/old-a"},
		{Ref: "relay-b/qwen-gpu4/old-b", Provider: "relay-b", Model: "qwen-gpu4/old-b"},
	}
	probeKeys := map[string]string{"relay-a": "gateway", "relay-b": "gateway"}
	outcomes := map[string]modelCatalogProbeOutcome{
		"gateway": {modelIDs: []string{"qwen-gpu4/new-model"}},
	}

	models := reconcileModelCatalog(configured, probeKeys, outcomes)
	for _, model := range models {
		if model.Model == "qwen-gpu4/new-model" {
			t.Fatalf("ambiguous live model was added: %+v", model)
		}
	}
}

func TestResolveModelCatalogSelectionAllowsValidatedLiveModel(t *testing.T) {
	cfg := config.Default()
	cfg.Providers = []config.ProviderEntry{{
		Name: "qwen-thinking", Kind: "openai", BaseURL: "http://127.0.0.1:9010/v1",
		Model: "qwen-gpu4/old-model", APIKeyEnv: "LOCAL_API_KEY",
	}}
	ref := "qwen-thinking/qwen-gpu4/live-model"
	entry, ok := resolveModelCatalogSelection(cfg, ref, []ModelInfo{{Ref: ref, Availability: "available"}})
	if !ok || entry.Name != "qwen-thinking" || entry.Model != "qwen-gpu4/live-model" {
		t.Fatalf("resolved live model = %+v, ok=%v", entry, ok)
	}
}

func TestReconcileModelCatalogKeepsLegacyCurrentModelUnavailable(t *testing.T) {
	configured := []ModelInfo{{
		Ref:      "qwen-thinking/qwen-gpu4/step3p7-flash",
		Provider: "qwen-thinking",
		Model:    "qwen-gpu4/step3p7-flash",
		Current:  true,
	}}
	probeKeys := map[string]string{"qwen-thinking": "gateway"}
	outcomes := map[string]modelCatalogProbeOutcome{
		"gateway": {modelIDs: []string{"qwen-gpu4/step3p7-flash"}},
	}

	models := reconcileModelCatalog(configured, probeKeys, outcomes)
	if len(models) != 1 || models[0].Availability != "unavailable" || models[0].UnavailableReason == "" {
		t.Fatalf("legacy current model = %+v, want one unavailable entry", models)
	}
}

func TestReconcileModelCatalogSkipsLegacyDiscoveredModel(t *testing.T) {
	configured := []ModelInfo{{
		Ref:      "qwen-thinking/qwen-gpu4/old-model",
		Provider: "qwen-thinking",
		Model:    "qwen-gpu4/old-model",
	}}
	probeKeys := map[string]string{"qwen-thinking": "gateway"}
	outcomes := map[string]modelCatalogProbeOutcome{
		"gateway": {modelIDs: []string{"qwen-gpu4/step3p7-flash"}},
	}

	if models := reconcileModelCatalog(configured, probeKeys, outcomes); len(models) != 0 {
		t.Fatalf("legacy live model was rediscovered: %+v", models)
	}
}

func TestResolveModelCatalogSelectionRejectsLegacyModel(t *testing.T) {
	cfg := config.Default()
	cfg.Providers = []config.ProviderEntry{{
		Name: "qwen-thinking", Kind: "openai", BaseURL: "http://127.0.0.1:9010/v1",
		Model: "qwen-gpu4/step3p7-flash", APIKeyEnv: "LOCAL_API_KEY",
	}}
	ref := "qwen-thinking/qwen-gpu4/step3p7-flash"
	if entry, ok := resolveModelCatalogSelection(cfg, ref, []ModelInfo{{Ref: ref, Availability: "available"}}); ok || entry != nil {
		t.Fatalf("legacy model resolved: %+v", entry)
	}
}

func TestResolveAccessibleDesktopFallbackSkipsLegacyModel(t *testing.T) {
	cfg := config.Default()
	cfg.DefaultModel = "qwen-thinking/qwen-gpu4/step3p7-flash"
	cfg.Providers = []config.ProviderEntry{
		{
			Name: "qwen-thinking", Kind: "openai", BaseURL: "http://127.0.0.1:9010/v1",
			Model: "qwen-gpu4/step3p7-flash", APIKeyEnv: "LOCAL_API_KEY",
		},
		{
			Name: "healthy", Kind: "openai", BaseURL: "http://127.0.0.1:9011/v1",
			Model: "healthy-model", APIKeyEnv: "LOCAL_API_KEY",
		},
	}

	entry, ref, ok := resolveAccessibleDesktopFallback(cfg, "qwen-thinking/qwen-gpu4/step3p7-flash", map[string]bool{
		"qwen-thinking": true,
		"healthy":       true,
	})
	if !ok || ref != "healthy/healthy-model" || entry == nil || entry.Name != "healthy" {
		t.Fatalf("fallback = entry:%+v ref:%q ok:%v, want healthy model", entry, ref, ok)
	}
}

func TestResolveModelCatalogSelectionRejectsUnvalidatedLiveModel(t *testing.T) {
	cfg := config.Default()
	ref := "qwen-thinking/qwen-gpu4/unverified-model"
	models := []ModelInfo{{Ref: ref, Availability: "unknown"}}
	if entry, ok := resolveModelCatalogSelection(cfg, ref, models); ok || entry != nil {
		t.Fatalf("unverified live model resolved: %+v", entry)
	}
}

func TestResolveDesktopModelForRebuildRequiresLiveCatalog(t *testing.T) {
	isolateDesktopUserDirs(t)
	setDesktopTestCredential(t, "LOCAL_API_KEY", "sk-test")

	var response atomic.Value
	var fail atomic.Bool
	response.Store(`{"data":[{"id":"qwen-gpu4/live-model"}]}`)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if fail.Load() {
			http.Error(w, "catalog unavailable", http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(response.Load().(string)))
	}))
	defer server.Close()

	if err := os.MkdirAll(filepath.Dir(config.UserConfigPath()), 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	cfg := config.Default()
	cfg.DefaultModel = "qwen-thinking/qwen-gpu4/old-model"
	cfg.Desktop.ProviderAccess = []string{"qwen-thinking", "glm-5.2"}
	cfg.Providers = []config.ProviderEntry{
		{
			Name: "qwen-thinking", Kind: "openai", BaseURL: server.URL + "/v1",
			Models: []string{"qwen-gpu4/old-model"}, Default: "qwen-gpu4/old-model", APIKeyEnv: "LOCAL_API_KEY",
		},
		{
			Name: "glm-5.2", Kind: "openai", BaseURL: server.URL + "/v1",
			Models: []string{"glm-primary/old-model"}, Default: "glm-primary/old-model", APIKeyEnv: "LOCAL_API_KEY",
		},
	}
	if err := cfg.SaveTo(config.UserConfigPath()); err != nil {
		t.Fatalf("save config: %v", err)
	}

	app := modelCatalogTestApp("qwen-thinking/qwen-gpu4/old-model")
	loaded, err := config.LoadForRoot("")
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	ref := "qwen-thinking/qwen-gpu4/live-model"
	resolution, err := app.resolveDesktopModelForRebuild("", ref)
	if err != nil {
		t.Fatalf("resolve live rebuild model: %v", err)
	}
	if resolution.fallback || !resolution.allowUnlisted || resolution.ref != ref {
		t.Fatalf("live rebuild resolution = %+v", resolution)
	}

	response.Store(`{"data":[{"id":"glm-primary/live-model"}]}`)
	spoofedRef := "qwen-thinking/glm-primary/live-model"
	spoofedEntry, ok := loaded.ResolveExplicitProviderModel(spoofedRef)
	if !ok {
		t.Fatal("resolve spoofed explicit provider/model")
	}
	providers := liveCatalogProvidersForProbe(loaded, "", modelCatalogProbeKey(*spoofedEntry))
	if mapped := liveCatalogProviders(providers, spoofedEntry.Model); len(mapped) != 1 || mapped[0] != "glm-5.2" {
		probeKeys := map[string]string{}
		for _, provider := range loaded.Providers {
			probeKeys[provider.Name] = modelCatalogProbeKey(provider)
		}
		t.Fatalf("live model provider mapping = %+v from providers %+v; probe keys = %q", mapped, providers, probeKeys)
	}
	resolution, err = app.resolveDesktopModelForRebuild("", spoofedRef)
	if err != nil {
		t.Fatalf("resolve mismatched provider fallback: %v", err)
	}
	if !resolution.fallback || resolution.allowUnlisted || resolution.ref != "qwen-thinking/qwen-gpu4/old-model" {
		t.Fatalf("mismatched provider resolution = %+v", resolution)
	}
	response.Store(`{"data":[{"id":"qwen-gpu4/live-model"}]}`)

	loaded.Desktop.ProviderAccess = []string{"other-provider"}
	if app.validateUnlistedCatalogModel(loaded, "", ref) {
		t.Fatal("live model remained trusted after provider access removal")
	}

	fail.Store(true)
	resolution, err = app.resolveDesktopModelForRebuild("", ref)
	if err != nil {
		t.Fatalf("resolve rebuild fallback: %v", err)
	}
	if !resolution.fallback || resolution.allowUnlisted || resolution.ref != "qwen-thinking/qwen-gpu4/old-model" {
		t.Fatalf("failed live rebuild resolution = %+v", resolution)
	}

	fail.Store(false)
	response.Store(`{"data":[]}`)
	resolution, err = app.resolveDesktopModelForRebuild("", ref)
	if err != nil || !resolution.fallback || resolution.allowUnlisted {
		t.Fatalf("removed live rebuild resolution = %+v, err=%v", resolution, err)
	}
}

func TestResolveDesktopModelForRebuildRejectsRemovedProviderAccess(t *testing.T) {
	isolateDesktopUserDirs(t)
	setDesktopTestCredential(t, "LOCAL_API_KEY", "sk-test")
	if err := os.MkdirAll(filepath.Dir(config.UserConfigPath()), 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	cfg := config.Default()
	cfg.DefaultModel = "allowed/allowed-model"
	cfg.Desktop.ProviderAccess = []string{"allowed"}
	cfg.Providers = []config.ProviderEntry{
		{Name: "allowed", Kind: "openai", BaseURL: "https://allowed.example/v1", Models: []string{"old-model", "allowed-model"}, Default: "allowed-model", APIKeyEnv: "LOCAL_API_KEY"},
		{Name: "removed", Kind: "openai", BaseURL: "https://removed.example/v1", Model: "removed-model", APIKeyEnv: "LOCAL_API_KEY"},
	}
	if err := cfg.SaveTo(config.UserConfigPath()); err != nil {
		t.Fatalf("save config: %v", err)
	}

	resolution, err := modelCatalogTestApp("removed/removed-model").resolveDesktopModelForRebuild("", "removed/removed-model")
	if err != nil {
		t.Fatalf("resolve removed provider model: %v", err)
	}
	if !resolution.fallback || resolution.allowUnlisted || resolution.ref != "allowed/allowed-model" || resolution.entry.Model != "allowed-model" {
		t.Fatalf("removed provider resolution = %+v", resolution)
	}
}

func TestRefreshModelsForTabKeepsRemovedCurrentModelUnavailable(t *testing.T) {
	isolateDesktopUserDirs(t)
	setDesktopTestCredential(t, "LOCAL_API_KEY", "sk-test")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"chat-model"}]}`))
	}))
	defer server.Close()

	writeModelCatalogTestConfig(t, server.URL+"/v1")
	app := modelCatalogTestApp("local/image-gpu5")

	models := app.RefreshModelsForTab("tab")
	if len(models) != 2 {
		t.Fatalf("RefreshModelsForTab() = %+v, want live chat model and removed current model", models)
	}
	var current ModelInfo
	for _, model := range models {
		if model.Current {
			current = model
		}
	}
	if current.Ref != "local/image-gpu5" || current.Availability != "unavailable" {
		t.Fatalf("removed current model = %+v, want unavailable image model", current)
	}
}

func TestRefreshModelsForTabKeepsPublishedNonChatCurrentModelUnavailable(t *testing.T) {
	isolateDesktopUserDirs(t)
	setDesktopTestCredential(t, "LOCAL_API_KEY", "sk-test")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":[{"id":"chat-model"},{"id":"image-gpu5"}]}`))
	}))
	defer server.Close()

	writeModelCatalogTestConfig(t, server.URL+"/v1")
	models := modelCatalogTestApp("local/image-gpu5").RefreshModelsForTab("tab")

	if len(models) != 2 {
		t.Fatalf("RefreshModelsForTab() = %+v, want live chat model and current image model", models)
	}
	foundCurrent := false
	for _, model := range models {
		if !model.Current {
			continue
		}
		foundCurrent = true
		if model.Ref != "local/image-gpu5" || model.Availability != "unavailable" {
			t.Fatalf("published current non-chat model = %+v, want unavailable image model", model)
		}
	}
	if !foundCurrent {
		t.Fatalf("RefreshModelsForTab() = %+v, want a current image model", models)
	}
}

func TestRefreshModelsForTabRetainsStaticModelsWhenProbeFails(t *testing.T) {
	isolateDesktopUserDirs(t)
	setDesktopTestCredential(t, "LOCAL_API_KEY", "sk-test")
	writeModelCatalogTestConfig(t, "http://127.0.0.1:1/v1")
	app := modelCatalogTestApp("local/chat-model")

	models := app.RefreshModelsForTab("tab")
	if len(models) != 1 || models[0].Availability != "unknown" {
		t.Fatalf("RefreshModelsForTab() = %+v, want static chat model with unknown status", models)
	}
}

func writeModelCatalogTestConfig(t *testing.T, baseURL string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(config.UserConfigPath()), 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	cfg := config.Default()
	cfg.DefaultModel = "local/chat-model"
	cfg.Desktop.ProviderAccess = []string{"local"}
	cfg.Providers = []config.ProviderEntry{{
		Name: "local", Kind: "openai", BaseURL: baseURL,
		Models: []string{"chat-model", "image-gpu5"}, Default: "chat-model", APIKeyEnv: "LOCAL_API_KEY",
	}}
	if err := cfg.SaveTo(config.UserConfigPath()); err != nil {
		t.Fatalf("save config: %v", err)
	}
}

func writeSharedModelCatalogTestConfig(t *testing.T, baseURL string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(config.UserConfigPath()), 0o755); err != nil {
		t.Fatalf("mkdir config dir: %v", err)
	}
	cfg := config.Default()
	cfg.DefaultModel = "local/chat-model"
	cfg.Desktop.ProviderAccess = []string{"local", "backup"}
	cfg.Providers = []config.ProviderEntry{
		{Name: "local", Kind: "openai", BaseURL: baseURL, Model: "chat-model", APIKeyEnv: "LOCAL_API_KEY"},
		{Name: "backup", Kind: "openai", BaseURL: baseURL, Model: "chat-model", APIKeyEnv: "LOCAL_API_KEY"},
	}
	if err := cfg.SaveTo(config.UserConfigPath()); err != nil {
		t.Fatalf("save config: %v", err)
	}
}

func modelCatalogTestApp(model string) *App {
	app := NewApp()
	app.ctx = context.Background()
	tab := &WorkspaceTab{ID: "tab", Scope: "global", Ready: true, model: model}
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID
	return app
}
