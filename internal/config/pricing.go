package config

import (
	"fmt"
	"os"
	"strings"

	"voltui/internal/provider"
)

func deepSeekV4FlashPrice() *provider.Pricing {
	return &provider.Pricing{CacheHit: 0.02, Input: 1, Output: 2, Currency: "¥"}
}

func deepSeekV4ProPrice() *provider.Pricing {
	return &provider.Pricing{CacheHit: 0.025, Input: 3, Output: 6, Currency: "¥"}
}

func deepSeekV4Prices() map[string]*provider.Pricing {
	return map[string]*provider.Pricing{
		"deepseek-v4-flash": deepSeekV4FlashPrice(),
		"deepseek-v4-pro":   deepSeekV4ProPrice(),
	}
}

func deepSeekV4FlashPriceUSD() *provider.Pricing {
	return &provider.Pricing{CacheHit: 0.0028, Input: 0.14, Output: 0.28, Currency: "$"}
}

func deepSeekV4ProPriceUSD() *provider.Pricing {
	return &provider.Pricing{CacheHit: 0.003625, Input: 0.435, Output: 0.87, Currency: "$"}
}

func deepSeekV4PricesUSD() map[string]*provider.Pricing {
	return map[string]*provider.Pricing{
		"deepseek-v4-flash": deepSeekV4FlashPriceUSD(),
		"deepseek-v4-pro":   deepSeekV4ProPriceUSD(),
	}
}

// DeepSeekV4PricesForLanguage keeps the settings/template call site stable while
// official DeepSeek defaults move to RMB. Persisted prices still win; this is
// only used for templates and missing-default backfills.
func DeepSeekV4PricesForLanguage(lang string) map[string]*provider.Pricing {
	_ = lang
	return deepSeekV4Prices()
}

func deepSeekV4PricesForConfig(c *Config) map[string]*provider.Pricing {
	_ = c
	return deepSeekV4Prices()
}

func deepSeekV4PriceForModel(lang, model string) *provider.Pricing {
	_ = lang
	return clonePricing(deepSeekV4Prices()[strings.TrimSpace(model)])
}

// DeepSeekOfficialPricingLanguage is retained for settings/template compatibility.
// Official DeepSeek providers now seed RMB prices by default; explicit user
// prices in config still override these defaults.
func (c *Config) DeepSeekOfficialPricingLanguage() string {
	_ = c
	return "zh"
}

// ApplyDeepSeekOfficialDefaultPricing refreshes built-in/official DeepSeek
// prices that still match known official defaults. Custom user prices are left
// untouched.
func (c *Config) ApplyDeepSeekOfficialDefaultPricing() {
	applyDeepSeekOfficialDefaultPricing(c)
}

func applyDeepSeekOfficialDefaultPricing(c *Config) {
	if c == nil {
		return
	}
	lang := c.DeepSeekOfficialPricingLanguage()
	for i := range c.Providers {
		p := &c.Providers[i]
		if officialProviderKind(p) != "deepseek" {
			continue
		}
		if isKnownDeepSeekOfficialPricing(p.Model, p.Price) {
			p.Price = deepSeekV4PriceForModel(lang, p.Model)
		}
		for model, price := range p.Prices {
			if isKnownDeepSeekOfficialPricing(model, price) {
				p.Prices[model] = deepSeekV4PriceForModel(lang, model)
			}
		}
	}
}

func mimoV25ProPrice() *provider.Pricing {
	return &provider.Pricing{CacheHit: 0.025, Input: 3, Output: 6, Currency: "¥"}
}

func mimoV25Price() *provider.Pricing {
	return &provider.Pricing{CacheHit: 0.02, Input: 1, Output: 2, Currency: "¥"}
}

func mimoV2FlashPrice() *provider.Pricing {
	return &provider.Pricing{CacheHit: 0.07, Input: 0.70, Output: 2.10, Currency: "¥"}
}

func mimoDomesticPrices(models []string) map[string]*provider.Pricing {
	prices := map[string]*provider.Pricing{}
	for _, model := range models {
		switch strings.TrimSpace(model) {
		case "mimo-v2.5-pro", "mimo-v2-pro":
			prices[model] = mimoV25ProPrice()
		case "mimo-v2.5", "mimo-v2-omni":
			prices[model] = mimoV25Price()
		case "mimo-v2-flash":
			prices[model] = mimoV2FlashPrice()
		}
	}
	return prices
}

func longCat20Price() *provider.Pricing {
	return &provider.Pricing{CacheHit: 0.04, Input: 2, Output: 8, Currency: "¥"}
}

func longCat20Prices(models []string) map[string]*provider.Pricing {
	prices := map[string]*provider.Pricing{}
	for _, model := range models {
		switch strings.TrimSpace(model) {
		case "LongCat-2.0":
			prices[model] = longCat20Price()
		}
	}
	return prices
}

const (
	deepSeekPricingResetConfigVersion      = 3
	windowsBashSandboxDefaultConfigVersion = 4
	retiredAutoPlanConfigVersion           = 5
	bundledvoltCatalogConfigVersion        = 6
)

// ApplyUserConfigUpgradesOnStartup applies one-time startup migrations. It
// intentionally runs from the desktop and CLI startup paths, not every config
// Load(), so user edits made after the upgrade are preserved.
func ApplyUserConfigUpgradesOnStartup(path string) (bool, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return false, nil
	}
	if _, err := os.Stat(path); err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	var header Config
	if _, err := decodeTOMLFile(path, &header); err != nil {
		return false, fmt.Errorf("config %s: %w", path, err)
	}
	defaultVersion := Default().ConfigVersion
	currentVersionvoltRecovery := header.ConfigVersion >= defaultVersion && hasLegacyBundledvoltRoutes(&header)
	if header.ConfigVersion >= defaultVersion && !currentVersionvoltRecovery {
		return false, nil
	}
	cfg := LoadForEdit(path)
	changed := migrateLegacyBundledvoltRoutes(cfg)
	if header.ConfigVersion < bundledvoltCatalogConfigVersion {
		changed = restoreBundledvoltCatalog(cfg) || changed
		// Mark every pre-v6 config once so a later user removal remains authoritative.
		changed = true
	}
	if header.ConfigVersion < deepSeekPricingResetConfigVersion {
		resetOfficialProviderPricingDefaults(cfg)
		changed = true
	}
	if shouldMarkWindowsBashSandboxDefaultUpgrade(header.ConfigVersion) {
		resetWindowsBashSandboxDefaultOnUpgrade(cfg)
		// Mark the Windows v4 migration even when the user was already on off,
		// so a later manual enforce choice is not treated as the old template default.
		changed = true
	}
	if header.ConfigVersion < retiredAutoPlanConfigVersion {
		normalizeRetiredAutoPlan(cfg)
		// Mark every older config as migrated even when Auto Plan was already off;
		// the v5 renderer removes both retired keys so older binaries also observe
		// the manual-only default after a downgrade.
		changed = true
	}
	if !changed {
		return false, nil
	}
	if header.ConfigVersion < defaultVersion {
		cfg.ConfigVersion = defaultVersion
	}
	if err := cfg.SaveTo(path); err != nil {
		return false, err
	}
	return true, nil
}

const (
	legacyvoltStepProvider = "qwen-thinking"
	legacyvoltStepModel    = "qwen-gpu4/step3p7-flash"
	legacyvoltGLMProvider  = "glm-5.2"
	legacyvoltGLMModel     = "glm-primary/glm-5.2-nvfp4"
	legacyvoltGLMModelV2   = "glm-5.2"
	// Pre-logical-name bundled provider: step → vlm.
	// (glm-5.2 already == legacyvoltGLMProvider, so no separate V2 constant.)
	legacyvoltStepProviderV2 = "step"
)

// IsLegacyBundledvoltModel reports OEM gateway routes that predate the current
// xllm/vlm logical-name catalog. Startup migration rewrites them to the
// canonical bundled providers instead of serving stale namespaced or
// pre-logical-name IDs.
func IsLegacyBundledvoltModel(providerName, model string) bool {
	model = strings.TrimSpace(model)
	switch strings.ToLower(strings.TrimSpace(providerName)) {
	case legacyvoltStepProvider:
		return model == legacyvoltStepModel
	case legacyvoltStepProviderV2:
		return model == legacyvoltStepModel || model == "step-3.7-flash/step-3.7-flash"
	case legacyvoltGLMProvider:
		return model == legacyvoltGLMModel || model == legacyvoltGLMModelV2 || model == "glm-5.2/glm-5.2"
	}
	return false
}

func migrateLegacyBundledvoltRoutes(c *Config) bool {
	if c == nil {
		return false
	}
	defaultRef, bundled := bundledvoltProviderDefaults()
	if defaultRef == "" || len(bundled) == 0 {
		return false
	}
	canonical := map[string]ProviderEntry{}
	for _, entry := range bundled {
		canonical[entry.Name] = entry
	}
	base := bundled[0]
	changed := false

	// Migrate legacy Step routes (qwen-thinking or pre-logical-name "step") → vlm.
	vlm := canonical["vlm"]
	stepLegacyProviders := []string{legacyvoltStepProvider, legacyvoltStepProviderV2}
	stepLegacyModels := []string{legacyvoltStepModel, "step-3.7-flash/step-3.7-flash"}
	for _, legacyName := range stepLegacyProviders {
		for _, legacyModel := range stepLegacyModels {
			index := legacyBundledvoltRouteIndex(c, legacyName, legacyModel, base)
			if index < 0 {
				continue
			}
			if existing, ok := c.Provider(vlm.Name); ok {
				if sameBundledvoltRoute(*existing, vlm) {
					migrateLegacyvoltAgentRefs(c, legacyName, vlm.Name)
					migrateLegacyvoltBotRefs(c, legacyName, vlm.Name)
					c.Desktop.ProviderAccess = migrateLegacyvoltProviderAccess(c.Desktop.ProviderAccess, legacyName, vlm.Name)
					c.Providers = append(c.Providers[:index], c.Providers[index+1:]...)
					changed = true
				}
			} else {
				migrateLegacyvoltAgentRefs(c, legacyName, vlm.Name)
				migrateLegacyvoltBotRefs(c, legacyName, vlm.Name)
				c.Desktop.ProviderAccess = migrateLegacyvoltProviderAccess(c.Desktop.ProviderAccess, legacyName, vlm.Name)
				c.Providers[index].Name = vlm.Name
				c.Providers[index].Model = vlm.Model
				changed = true
			}
			break // only one match per legacy name; provider slice shifted
		}
	}

	// Migrate legacy GLM routes (glm-primary namespaced or pre-logical-name "glm-5.2") → xllm.
	xllm := canonical["xllm"]
	glmLegacyProviders := []string{legacyvoltGLMProvider}
	glmLegacyModels := []string{legacyvoltGLMModel, legacyvoltGLMModelV2, "glm-5.2/glm-5.2"}
	for _, legacyName := range glmLegacyProviders {
		for _, legacyModel := range glmLegacyModels {
			index := legacyBundledvoltRouteIndex(c, legacyName, legacyModel, base)
			if index < 0 {
				continue
			}
			c.Providers[index].Name = xllm.Name
			c.Providers[index].Model = xllm.Model
			migrateLegacyvoltAgentRefs(c, legacyName, xllm.Name)
			migrateLegacyvoltBotRefs(c, legacyName, xllm.Name)
			c.Desktop.ProviderAccess = migrateLegacyvoltProviderAccess(c.Desktop.ProviderAccess, legacyName, xllm.Name)
			changed = true
			break
		}
	}
	return changed
}

func restoreBundledvoltCatalog(c *Config) bool {
	if c == nil {
		return false
	}
	_, bundled := bundledvoltProviderDefaults()
	if len(bundled) == 0 || !hasCurrentBundledvoltProvider(c, bundled) {
		return false
	}
	displayNamesChanged := backfillBundledvoltDisplayNames(c, bundled)
	providersAdded := appendMissingBundledvoltProviders(c, bundled)
	return displayNamesChanged || providersAdded
}

func backfillBundledvoltDisplayNames(c *Config, bundled []ProviderEntry) bool {
	changed := false
	for _, canonical := range bundled {
		configured, exists := c.Provider(canonical.Name)
		if !exists || !sameBundledvoltRoute(*configured, canonical) || configured.DisplayLabel() != "" {
			continue
		}
		configured.DisplayName = canonical.DisplayName
		changed = true
	}
	return changed
}

func appendMissingBundledvoltProviders(c *Config, bundled []ProviderEntry) bool {
	grantAccess := len(c.Desktop.ProviderAccess) > 0 && explicitBundledvoltProviderAccess(c.Desktop.ProviderAccess, bundled)
	changed := false
	for _, canonical := range bundled {
		if _, exists := c.Provider(canonical.Name); exists {
			continue
		}
		c.Providers = append(c.Providers, canonical)
		if grantAccess {
			c.Desktop.ProviderAccess = appendMissingProviderAccess(c.Desktop.ProviderAccess, canonical.Name)
		}
		changed = true
	}
	return changed
}

func hasCurrentBundledvoltProvider(c *Config, bundled []ProviderEntry) bool {
	for _, canonical := range bundled {
		configured, ok := c.Provider(canonical.Name)
		if ok && sameBundledvoltRoute(*configured, canonical) {
			return true
		}
	}
	return false
}

func explicitBundledvoltProviderAccess(access []string, bundled []ProviderEntry) bool {
	for _, allowed := range access {
		for _, canonical := range bundled {
			if strings.TrimSpace(allowed) == canonical.Name {
				return true
			}
		}
	}
	return false
}

func appendMissingProviderAccess(access []string, name string) []string {
	for _, allowed := range access {
		if strings.TrimSpace(allowed) == name {
			return access
		}
	}
	return append(access, name)
}

func migrateLegacyvoltAgentRefs(c *Config, from, to string) {
	c.DefaultModel = migrateLegacyvoltModelRef(c.DefaultModel, from, to)
	c.Agent.PlannerModel = migrateLegacyvoltModelRef(c.Agent.PlannerModel, from, to)
	c.Agent.GuardianModel = migrateLegacyvoltModelRef(c.Agent.GuardianModel, from, to)
	c.Agent.RecoveryModel = migrateLegacyvoltModelRef(c.Agent.RecoveryModel, from, to)
	c.Agent.SubagentModel = migrateLegacyvoltModelRef(c.Agent.SubagentModel, from, to)
	for name, ref := range c.Agent.SubagentModels {
		c.Agent.SubagentModels[name] = migrateLegacyvoltModelRef(ref, from, to)
	}
}

func migrateLegacyvoltBotRefs(c *Config, from, to string) {
	c.Bot.Model = migrateLegacyvoltModelRef(c.Bot.Model, from, to)
	c.Bot.QQ.Model = migrateLegacyvoltModelRef(c.Bot.QQ.Model, from, to)
	for i := range c.Bot.Routes {
		c.Bot.Routes[i].Model = migrateLegacyvoltModelRef(c.Bot.Routes[i].Model, from, to)
	}
	for i := range c.Bot.Connections {
		c.Bot.Connections[i].Model = migrateLegacyvoltModelRef(c.Bot.Connections[i].Model, from, to)
	}
}

func hasLegacyBundledvoltRoutes(c *Config) bool {
	_, bundled := bundledvoltProviderDefaults()
	if len(bundled) == 0 {
		return false
	}
	base := bundled[0]
	return legacyBundledvoltRouteIndex(c, legacyvoltStepProvider, legacyvoltStepModel, base) >= 0 ||
		legacyBundledvoltRouteIndex(c, legacyvoltStepProviderV2, "step-3.7-flash/step-3.7-flash", base) >= 0 ||
		legacyBundledvoltRouteIndex(c, legacyvoltGLMProvider, legacyvoltGLMModel, base) >= 0 ||
		legacyBundledvoltRouteIndex(c, legacyvoltGLMProvider, legacyvoltGLMModelV2, base) >= 0 ||
		legacyBundledvoltRouteIndex(c, legacyvoltGLMProvider, "glm-5.2/glm-5.2", base) >= 0
}

func legacyBundledvoltRouteIndex(c *Config, name, model string, base ProviderEntry) int {
	if c == nil {
		return -1
	}
	for i := range c.Providers {
		entry := c.Providers[i]
		if strings.EqualFold(strings.TrimSpace(entry.Name), name) &&
			strings.TrimSpace(entry.Model) == model &&
			strings.EqualFold(strings.TrimSpace(entry.Kind), "openai") &&
			strings.TrimRight(strings.TrimSpace(entry.BaseURL), "/") == strings.TrimRight(base.BaseURL, "/") &&
			len(entry.Models) == 0 && strings.TrimSpace(entry.APIKeyEnv) == base.APIKeyEnv {
			return i
		}
	}
	return -1
}

func sameBundledvoltRoute(got, want ProviderEntry) bool {
	return strings.TrimSpace(got.Name) == strings.TrimSpace(want.Name) &&
		strings.EqualFold(strings.TrimSpace(got.Kind), strings.TrimSpace(want.Kind)) &&
		strings.TrimRight(strings.TrimSpace(got.BaseURL), "/") == strings.TrimRight(strings.TrimSpace(want.BaseURL), "/") &&
		strings.TrimSpace(got.Model) == strings.TrimSpace(want.Model) &&
		len(got.Models) == 0 && strings.TrimSpace(got.APIKeyEnv) == strings.TrimSpace(want.APIKeyEnv)
}

func migrateLegacyvoltModelRef(ref, from, to string) string {
	trimmed := strings.TrimSpace(ref)
	if trimmed == from || strings.HasPrefix(trimmed, from+"/") {
		return to
	}
	return ref
}

func migrateLegacyvoltProviderAccess(access []string, from, to string) []string {
	if access == nil {
		return nil
	}
	out := make([]string, 0, len(access))
	seen := make(map[string]struct{}, len(access))
	for _, name := range access {
		name = strings.TrimSpace(name)
		if name == from {
			name = to
		}
		if name == "" {
			continue
		}
		if _, ok := seen[name]; ok {
			continue
		}
		seen[name] = struct{}{}
		out = append(out, name)
	}
	return out
}

// ResetOfficialProviderPricingOnUpgrade is retained for older call sites.
func ResetOfficialProviderPricingOnUpgrade(path string) (bool, error) {
	return ApplyUserConfigUpgradesOnStartup(path)
}

func shouldMarkWindowsBashSandboxDefaultUpgrade(fromVersion int) bool {
	return runtimeGOOS == "windows" && fromVersion < windowsBashSandboxDefaultConfigVersion
}

func resetWindowsBashSandboxDefaultOnUpgrade(c *Config) {
	if c == nil {
		return
	}
	if strings.TrimSpace(c.Sandbox.Bash) != "enforce" {
		return
	}
	c.Sandbox.Bash = "off"
}

func resetOfficialProviderPricingDefaults(c *Config) {
	if c == nil {
		return
	}
	for i := range c.Providers {
		p := &c.Providers[i]
		switch {
		case officialProviderKind(p) == "deepseek":
			resetDeepSeekOfficialPricing(p)
		}
	}
}

func resetDeepSeekOfficialPricing(p *ProviderEntry) {
	if p == nil {
		return
	}
	defaults := deepSeekV4Prices()
	p.Price = nil
	if strings.TrimSpace(p.Model) != "" && len(p.Models) == 0 {
		if price := defaults[strings.TrimSpace(p.Model)]; price != nil {
			p.Price = clonePricing(price)
			p.Prices = nil
			return
		}
	}
	if p.Prices == nil {
		p.Prices = map[string]*provider.Pricing{}
	}
	for model, price := range defaults {
		if p.HasModel(model) {
			p.Prices[model] = clonePricing(price)
		}
	}
}

func isKnownDeepSeekOfficialPricing(model string, price *provider.Pricing) bool {
	model = strings.TrimSpace(model)
	if model == "" || price == nil {
		return false
	}
	for _, prices := range []map[string]*provider.Pricing{deepSeekV4Prices(), deepSeekV4PricesUSD()} {
		if samePricing(price, prices[model]) {
			return true
		}
	}
	return false
}

func samePricing(a, b *provider.Pricing) bool {
	if a == nil || b == nil {
		return false
	}
	return a.CacheHit == b.CacheHit && a.Input == b.Input && a.Output == b.Output && a.Currency == b.Currency
}
