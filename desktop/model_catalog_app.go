package main

import (
	"context"
	"fmt"
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

type modelCatalogProvider struct {
	name       string
	namespaces map[string]bool
	curated    bool
}

type modelCatalogProviderProbe struct {
	key     string
	curated bool
}

type desktopModelResolution struct {
	entry         *config.ProviderEntry
	ref           string
	fallback      bool
	allowUnlisted bool
}

// RefreshModelsForTab reconciles the configured chat picker with each
// provider's live /models catalog. A successful catalog response removes stale
// non-current entries and adds newly discovered models when the provider
// identity is unambiguous; the current entry stays visible with an unavailable
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
	probes, providerProbes := modelCatalogProbes(cfg)
	if len(probes) == 0 {
		return configured
	}
	outcomesByProbe := a.fetchModelCatalogs(workspaceRoot, probes)
	return reconcileModelCatalog(configured, providerProbes, outcomesByProbe)
}

func modelCatalogProbes(cfg *config.Config) (map[string]config.ProviderEntry, map[string]modelCatalogProviderProbe) {
	access := providerAccessSet(cfg.Desktop.ProviderAccess)
	probes := map[string]config.ProviderEntry{}
	providerProbes := map[string]modelCatalogProviderProbe{}
	for i := range cfg.Providers {
		provider := cfg.Providers[i]
		if !modelProviderAccessAllowed(access, provider.Name) || !provider.Configured() || len(provider.ChatModelList()) == 0 {
			continue
		}
		key := modelCatalogProbeKey(provider)
		if _, exists := probes[key]; !exists {
			probes[key] = provider
		}
		providerProbes[provider.Name] = modelCatalogProviderProbe{
			key:     key,
			curated: cfg.IsBundledXiguCatalogProvider(provider.Name),
		}
	}
	return probes, providerProbes
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

func reconcileModelCatalog(configured []ModelInfo, providerProbes map[string]modelCatalogProviderProbe, outcomesByProbe map[string]modelCatalogProbeOutcome) []ModelInfo {
	refreshed := reconcileConfiguredCatalog(configured, providerProbes, outcomesByProbe)
	return appendDiscoveredCatalogModels(refreshed, configured, providerProbes, outcomesByProbe)
}

func reconcileConfiguredCatalog(configured []ModelInfo, providerProbes map[string]modelCatalogProviderProbe, outcomesByProbe map[string]modelCatalogProbeOutcome) []ModelInfo {
	refreshed := make([]ModelInfo, 0, len(configured))
	for _, model := range configured {
		probe := providerProbes[model.Provider]
		outcome, ok := outcomesByProbe[probe.key]
		if updated, keep := reconcileConfiguredModel(model, outcome, ok); keep {
			refreshed = append(refreshed, updated)
		}
	}
	return refreshed
}

func reconcileConfiguredModel(model ModelInfo, outcome modelCatalogProbeOutcome, probed bool) (ModelInfo, bool) {
	if config.IsLegacyBundledXiguModel(model.Provider, model.Model) {
		return unavailableCurrentCatalogModel(model, "该模型路由已更名，请切换到可用模型。")
	}
	if !config.IsLikelyChatModel(model.Model) {
		return unavailableCurrentCatalogModel(model, "当前模型不支持文本对话，请切换到聊天模型。")
	}
	if !probed || outcome.err != nil {
		model.Availability = "unknown"
		model.UnavailableReason = "模型网关目录刷新失败，当前显示静态配置。"
		return model, true
	}
	if containsModelID(outcome.modelIDs, model.Model) {
		model.Availability = "available"
		model.UnavailableReason = ""
		return model, true
	}
	return unavailableCurrentCatalogModel(model, "模型网关当前未发布此模型，请切换到可用模型。")
}

func unavailableCurrentCatalogModel(model ModelInfo, reason string) (ModelInfo, bool) {
	if !model.Current {
		return model, false
	}
	model.Availability = "unavailable"
	model.UnavailableReason = reason
	return model, true
}

func appendDiscoveredCatalogModels(refreshed, configured []ModelInfo, providerProbes map[string]modelCatalogProviderProbe, outcomesByProbe map[string]modelCatalogProbeOutcome) []ModelInfo {
	seenModels := catalogModelPairs(refreshed)
	providersByProbe := catalogProvidersByProbe(configured, providerProbes)
	visitedProbes := map[string]bool{}
	for _, configuredModel := range configured {
		probeKey := providerProbes[configuredModel.Provider].key
		if probeKey == "" || visitedProbes[probeKey] {
			continue
		}
		visitedProbes[probeKey] = true
		outcome, ok := outcomesByProbe[probeKey]
		if !ok || outcome.err != nil {
			continue
		}
		refreshed = appendLiveCatalogModels(refreshed, seenModels, providersByProbe[probeKey], outcome.modelIDs)
	}
	return refreshed
}

func appendLiveCatalogModels(refreshed []ModelInfo, seenModels map[string]bool, providers []modelCatalogProvider, liveModels []string) []ModelInfo {
	for _, liveModel := range liveModels {
		liveModel = strings.TrimSpace(liveModel)
		if !config.IsLikelyChatModel(liveModel) {
			continue
		}
		for _, providerName := range liveCatalogProviders(providers, liveModel) {
			if config.IsLegacyBundledXiguModel(providerName, liveModel) {
				continue
			}
			pairKey := modelCatalogPairKey(providerName, liveModel)
			if seenModels[pairKey] {
				continue
			}
			seenModels[pairKey] = true
			refreshed = append(refreshed, ModelInfo{
				Ref:          providerName + "/" + liveModel,
				Provider:     providerName,
				Model:        liveModel,
				Availability: "available",
			})
		}
	}
	return refreshed
}

func catalogModelPairs(models []ModelInfo) map[string]bool {
	seenModels := make(map[string]bool, len(models))
	for _, model := range models {
		seenModels[modelCatalogPairKey(model.Provider, model.Model)] = true
	}
	return seenModels
}

func catalogProvidersByProbe(configured []ModelInfo, providerProbes map[string]modelCatalogProviderProbe) map[string][]modelCatalogProvider {
	providersByProbe := map[string][]modelCatalogProvider{}
	providerIndexes := map[string]int{}
	for _, model := range configured {
		probe := providerProbes[model.Provider]
		if probe.key == "" {
			continue
		}
		indexCatalogProvider(providersByProbe, providerIndexes, probe, model)
	}
	return providersByProbe
}

func indexCatalogProvider(providersByProbe map[string][]modelCatalogProvider, providerIndexes map[string]int, probe modelCatalogProviderProbe, model ModelInfo) {
	providerKey := modelCatalogPairKey(probe.key, model.Provider)
	index, exists := providerIndexes[providerKey]
	if !exists {
		index = len(providersByProbe[probe.key])
		providerIndexes[providerKey] = index
		providersByProbe[probe.key] = append(providersByProbe[probe.key], modelCatalogProvider{
			name:       model.Provider,
			namespaces: map[string]bool{},
			curated:    probe.curated,
		})
	}
	if namespace := modelCatalogNamespace(model.Model); namespace != "" {
		providersByProbe[probe.key][index].namespaces[namespace] = true
	}
}

func liveCatalogProviders(providers []modelCatalogProvider, liveModel string) []string {
	discoverable := discoverableCatalogProviders(providers)
	for _, provider := range discoverable {
		if provider.name == liveModel {
			return []string{provider.name}
		}
	}
	liveNamespace := modelCatalogNamespace(liveModel)
	namespaceMatches := []string{}
	for _, provider := range discoverable {
		if liveNamespace != "" && provider.namespaces[liveNamespace] {
			namespaceMatches = append(namespaceMatches, provider.name)
		}
	}
	if len(namespaceMatches) == 1 {
		return namespaceMatches
	}
	// A single namespaced provider must not absorb unrelated models merely
	// because it is the only provider using this gateway. That would make a
	// qwen-gpu4 provider expose glm-primary (and other) catalog entries.
	if len(discoverable) == 1 && len(discoverable[0].namespaces) == 0 {
		return []string{discoverable[0].name}
	}
	return nil
}

func discoverableCatalogProviders(providers []modelCatalogProvider) []modelCatalogProvider {
	discoverable := make([]modelCatalogProvider, 0, len(providers))
	for _, provider := range providers {
		if !provider.curated {
			discoverable = append(discoverable, provider)
		}
	}
	return discoverable
}

func modelCatalogPairKey(provider, model string) string {
	return provider + "\x00" + model
}

func modelCatalogNamespace(model string) string {
	prefix, _, ok := strings.Cut(strings.TrimSpace(model), "/")
	if !ok {
		return ""
	}
	return strings.TrimSpace(prefix)
}

func resolveModelCatalogSelection(cfg *config.Config, ref string, models []ModelInfo) (*config.ProviderEntry, bool) {
	if entry, ok := cfg.ResolveModel(ref); ok {
		if config.IsLegacyBundledXiguModel(entry.Name, entry.Model) {
			return nil, false
		}
		return entry, true
	}
	for _, model := range models {
		if model.Ref != ref || model.Availability != "available" {
			continue
		}
		return cfg.ResolveExplicitProviderModel(ref)
	}
	return nil, false
}

func (a *App) validateUnlistedCatalogModel(cfg *config.Config, workspaceRoot, ref string) bool {
	if _, ok := cfg.ResolveModel(ref); ok {
		return false
	}
	entry, ok := cfg.ResolveExplicitProviderModel(ref)
	if !ok || config.IsLegacyBundledXiguModel(entry.Name, entry.Model) || !config.IsLikelyChatModel(entry.Model) || !modelProviderAccessAllowed(providerAccessSet(cfg.Desktop.ProviderAccess), entry.Name) {
		return false
	}
	entry.ResolveAPIKeyForRoot(workspaceRoot)
	if !entry.Configured() {
		return false
	}
	ctx, cancel := context.WithTimeout(a.reqCtx(), modelCatalogRefreshTimeout)
	defer cancel()
	modelIDs, err := entry.FetchModels(ctx)
	if err != nil || !containsModelID(modelIDs, entry.Model) {
		return false
	}
	providers := liveCatalogProvidersForProbe(cfg, workspaceRoot, modelCatalogProbeKey(*entry))
	for _, providerName := range liveCatalogProviders(providers, entry.Model) {
		if providerName == entry.Name {
			return true
		}
	}
	return false
}

func liveCatalogProvidersForProbe(cfg *config.Config, workspaceRoot, probeKey string) []modelCatalogProvider {
	access := providerAccessSet(cfg.Desktop.ProviderAccess)
	providers := []modelCatalogProvider{}
	for i := range cfg.Providers {
		provider := &cfg.Providers[i]
		provider.ResolveAPIKeyForRoot(workspaceRoot)
		if !modelProviderAccessAllowed(access, provider.Name) || !provider.Configured() || modelCatalogProbeKey(*provider) != probeKey {
			continue
		}
		models := provider.ChatModelList()
		if len(models) == 0 {
			continue
		}
		catalogProvider := modelCatalogProvider{
			name:       provider.Name,
			namespaces: map[string]bool{},
			curated:    cfg.IsBundledXiguCatalogProvider(provider.Name),
		}
		for _, model := range models {
			if namespace := modelCatalogNamespace(model); namespace != "" {
				catalogProvider.namespaces[namespace] = true
			}
		}
		providers = append(providers, catalogProvider)
	}
	return providers
}

func (a *App) resolveDesktopModelForRebuild(workspaceRoot, ref string) (desktopModelResolution, error) {
	cfg, err := config.LoadForRoot(workspaceRoot)
	if err != nil {
		return desktopModelResolution{}, err
	}
	ref = strings.TrimSpace(ref)
	if ref == "" {
		ref = cfg.DefaultModel
	}
	config.NormalizeLegacyMimoCustomProvidersForRefs(cfg, ref)
	access := providerAccessSet(cfg.Desktop.ProviderAccess)
	if entry, ok := cfg.ResolveModel(ref); ok {
		if modelProviderAccessAllowed(access, entry.Name) && !config.IsLegacyBundledXiguModel(entry.Name, entry.Model) {
			return desktopModelResolution{entry: entry, ref: entry.Name + "/" + entry.Model}, nil
		}
	}
	if a.validateUnlistedCatalogModel(cfg, workspaceRoot, ref) {
		entry, _ := cfg.ResolveExplicitProviderModel(ref)
		return desktopModelResolution{entry: entry, ref: entry.Name + "/" + entry.Model, allowUnlisted: true}, nil
	}
	resolved, fallback, ok := cfg.ResolveModelWithFallback(ref)
	if !ok {
		return desktopModelResolution{}, fmt.Errorf("unknown model %q", ref)
	}
	entry, ok := cfg.ResolveModel(resolved)
	if !ok || !modelProviderAccessAllowed(access, entry.Name) || config.IsLegacyBundledXiguModel(entry.Name, entry.Model) {
		if fallbackEntry, fallbackRef, found := resolveAccessibleDesktopFallback(cfg, ref, access); found {
			return desktopModelResolution{entry: fallbackEntry, ref: fallbackRef, fallback: true}, nil
		}
		return desktopModelResolution{}, fmt.Errorf("unknown model %q", resolved)
	}
	return desktopModelResolution{entry: entry, ref: resolved, fallback: fallback}, nil
}

func resolveAccessibleDesktopFallback(cfg *config.Config, ref string, access map[string]bool) (*config.ProviderEntry, string, bool) {
	defaultRef := strings.TrimSpace(cfg.DefaultModel)
	if defaultRef != "" && defaultRef != strings.TrimSpace(ref) {
		if entry, ok := cfg.ResolveModel(defaultRef); ok && modelProviderAccessAllowed(access, entry.Name) && !config.IsLegacyBundledXiguModel(entry.Name, entry.Model) {
			return entry, entry.Name + "/" + entry.Model, true
		}
	}
	for i := range cfg.Providers {
		provider := &cfg.Providers[i]
		if !modelProviderAccessAllowed(access, provider.Name) || len(provider.ModelList()) == 0 || !provider.Configured() {
			continue
		}
		fallbackRef := provider.Name + "/" + provider.DefaultModel()
		if entry, ok := cfg.ResolveModel(fallbackRef); ok && !config.IsLegacyBundledXiguModel(entry.Name, entry.Model) {
			return entry, fallbackRef, true
		}
	}
	return nil, "", false
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
