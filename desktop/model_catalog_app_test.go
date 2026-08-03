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
