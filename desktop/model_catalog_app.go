package main

import (
	"context"
	"sort"
	"strings"
	"time"

	"voltui/internal/config"
)

const modelCatalogRefreshTimeout = 8 * time.Second

type modelCatalogProbeOutcome struct {
	key      string
	modelIDs []string
	err      error
}

// RefreshModelsForTab reconciles the configured chat picker with each
// provider's live /models catalog. A successful catalog response removes stale
// non-current entries; the current entry stays visible with an unavailable
// marker so the user can switch away. Probe failures retain the static list and
// explicitly report unknown status instead of presenting stale data as healthy.
func (a *App) RefreshModelsForTab(tabID string) []ModelInfo {
	configured := a.ModelsForTab(tabID)
	if len(configured) == 0 {
		return []ModelInfo{}
	}

	workspaceRoot := ""
	a.mu.RLock()
	if tab := a.tabByIDLocked(tabID); tab != nil {
		workspaceRoot = tab.WorkspaceRoot
	}
	a.mu.RUnlock()
	cfg, err := config.LoadForRoot(workspaceRoot)
	if err != nil {
		return markModelCatalogUnknown(configured, "模型目录暂时无法读取，当前显示静态配置。")
	}
	probes, providerProbeKeys := modelCatalogProbes(cfg)
	if len(probes) == 0 {
		return configured
	}
	outcomesByProbe := a.fetchModelCatalogs(workspaceRoot, probes)
	return reconcileModelCatalog(configured, providerProbeKeys, outcomesByProbe)
}

func modelCatalogProbes(cfg *config.Config) (map[string]config.ProviderEntry, map[string]string) {
	access := providerAccessSet(cfg.Desktop.ProviderAccess)
	probes := map[string]config.ProviderEntry{}
	providerProbeKeys := map[string]string{}
	for i := range cfg.Providers {
		provider := cfg.Providers[i]
		if !modelProviderAccessAllowed(access, provider.Name) || !provider.Configured() || len(provider.ChatModelList()) == 0 {
			continue
		}
		key := modelCatalogProbeKey(provider)
		if _, exists := probes[key]; !exists {
			probes[key] = provider
		}
		providerProbeKeys[provider.Name] = key
	}
	return probes, providerProbeKeys
}

func (a *App) fetchModelCatalogs(workspaceRoot string, probes map[string]config.ProviderEntry) map[string]modelCatalogProbeOutcome {
	outcomes := make(chan modelCatalogProbeOutcome, len(probes))
	for key, entry := range probes {
		go func(key string, entry config.ProviderEntry) {
			entry.ResolveAPIKeyForRoot(workspaceRoot)
			ctx, cancel := context.WithTimeout(a.reqCtx(), modelCatalogRefreshTimeout)
			defer cancel()
			modelIDs, err := entry.FetchModels(ctx)
			outcomes <- modelCatalogProbeOutcome{key: key, modelIDs: modelIDs, err: err}
		}(key, entry)
	}
	outcomesByProbe := make(map[string]modelCatalogProbeOutcome, len(probes))
	for range probes {
		outcome := <-outcomes
		outcomesByProbe[outcome.key] = outcome
	}
	return outcomesByProbe
}

func reconcileModelCatalog(configured []ModelInfo, providerProbeKeys map[string]string, outcomesByProbe map[string]modelCatalogProbeOutcome) []ModelInfo {
	refreshed := make([]ModelInfo, 0, len(configured))
	for _, model := range configured {
		key := providerProbeKeys[model.Provider]
		outcome, ok := outcomesByProbe[key]
		if !ok || outcome.err != nil {
			model.Availability = "unknown"
			model.UnavailableReason = "模型网关目录刷新失败，当前显示静态配置。"
			refreshed = append(refreshed, model)
			continue
		}
		if containsModelID(outcome.modelIDs, model.Model) {
			model.Availability = "available"
			model.UnavailableReason = ""
			refreshed = append(refreshed, model)
			continue
		}
		if model.Current {
			model.Availability = "unavailable"
			model.UnavailableReason = "模型网关当前未发布此模型，请切换到可用模型。"
			refreshed = append(refreshed, model)
		}
	}
	return refreshed
}

func markModelCatalogUnknown(models []ModelInfo, reason string) []ModelInfo {
	out := make([]ModelInfo, len(models))
	for i, model := range models {
		model.Availability = "unknown"
		model.UnavailableReason = reason
		out[i] = model
	}
	return out
}

func containsModelID(models []string, target string) bool {
	for _, candidateModelID := range models {
		if strings.TrimSpace(candidateModelID) == strings.TrimSpace(target) {
			return true
		}
	}
	return false
}

func modelCatalogProbeKey(provider config.ProviderEntry) string {
	parts := []string{
		strings.TrimSpace(provider.Kind),
		strings.TrimSpace(provider.BaseURL),
		strings.TrimSpace(provider.ModelsURL),
		strings.TrimSpace(provider.APIKeyEnv),
	}
	if provider.AuthHeader {
		parts = append(parts, "auth-header")
	}
	keys := make([]string, 0, len(provider.Headers))
	for key := range provider.Headers {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		parts = append(parts, key+"="+provider.Headers[key])
	}
	return strings.Join(parts, "\x00")
}
