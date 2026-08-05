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
	currentVersionvoltRecovery := header.ConfigVersion >= defaultVersion && hasRetiredBundledvoltStep(&header)
	if header.ConfigVersion >= defaultVersion && !currentVersionvoltRecovery {
		return false, nil
	}
	cfg := LoadForEdit(path)
	changed := migrateRetiredBundledvoltStep(cfg)
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
	retiredvoltStepProvider = "qwen-thinking"
	retiredvoltStepModel    = "qwen-gpu4/step3p7-flash"
)

// IsRetiredBundledvoltModel reports the known unhealthy OEM Step route. The
// gateway can still advertise this model even though its chat-completion
// response places final text in reasoning_content and leaves content empty.
func IsRetiredBundledvoltModel(providerName, model string) bool {
	return strings.EqualFold(strings.TrimSpace(providerName), retiredvoltStepProvider) &&
		strings.TrimSpace(model) == retiredvoltStepModel
}

func migrateRetiredBundledvoltStep(c *Config) bool {
	if c == nil {
		return false
	}
	replacementRef, bundled := bundledvoltProviderDefaults()
	if replacementRef == "" || len(bundled) != 1 {
		return false
	}
	replacement := bundled[0]
	retiredIndex := retiredBundledvoltStepIndex(c, replacement)
	if retiredIndex < 0 {
		return false
	}
	configuredReplacement, replacementExists := c.Provider(replacementRef)
	if replacementExists && !sameBundledvoltRoute(*configuredReplacement, replacement) {
		return false
	}
	migrateRetiredvoltAgentRefs(c, replacementRef)
	migrateRetiredvoltBotRefs(c, replacementRef)
	c.Desktop.ProviderAccess = migrateRetiredvoltProviderAccess(c.Desktop.ProviderAccess, replacementRef)
	if replacementExists {
		c.Providers = append(c.Providers[:retiredIndex], c.Providers[retiredIndex+1:]...)
	} else {
		c.Providers[retiredIndex] = replacement
	}
	return true
}

func migrateRetiredvoltAgentRefs(c *Config, replacement string) {
	c.DefaultModel = migrateRetiredvoltModelRef(c.DefaultModel, replacement)
	c.Agent.PlannerModel = migrateRetiredvoltModelRef(c.Agent.PlannerModel, replacement)
	c.Agent.GuardianModel = migrateRetiredvoltModelRef(c.Agent.GuardianModel, replacement)
	c.Agent.RecoveryModel = migrateRetiredvoltModelRef(c.Agent.RecoveryModel, replacement)
	c.Agent.SubagentModel = migrateRetiredvoltModelRef(c.Agent.SubagentModel, replacement)
	for name, ref := range c.Agent.SubagentModels {
		c.Agent.SubagentModels[name] = migrateRetiredvoltModelRef(ref, replacement)
	}
}

func migrateRetiredvoltBotRefs(c *Config, replacement string) {
	c.Bot.Model = migrateRetiredvoltModelRef(c.Bot.Model, replacement)
	c.Bot.QQ.Model = migrateRetiredvoltModelRef(c.Bot.QQ.Model, replacement)
	for i := range c.Bot.Routes {
		c.Bot.Routes[i].Model = migrateRetiredvoltModelRef(c.Bot.Routes[i].Model, replacement)
	}
	for i := range c.Bot.Connections {
		c.Bot.Connections[i].Model = migrateRetiredvoltModelRef(c.Bot.Connections[i].Model, replacement)
	}
}

func hasRetiredBundledvoltStep(c *Config) bool {
	_, bundled := bundledvoltProviderDefaults()
	return len(bundled) == 1 && retiredBundledvoltStepIndex(c, bundled[0]) >= 0
}

func retiredBundledvoltStepIndex(c *Config, replacement ProviderEntry) int {
	if c == nil {
		return -1
	}
	for i := range c.Providers {
		entry := c.Providers[i]
		if IsRetiredBundledvoltModel(entry.Name, entry.Model) &&
			strings.EqualFold(strings.TrimSpace(entry.Kind), "openai") &&
			strings.TrimRight(strings.TrimSpace(entry.BaseURL), "/") == strings.TrimRight(replacement.BaseURL, "/") &&
			len(entry.Models) == 0 && strings.TrimSpace(entry.APIKeyEnv) == replacement.APIKeyEnv {
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

func migrateRetiredvoltModelRef(ref, replacement string) string {
	trimmed := strings.TrimSpace(ref)
	if trimmed == retiredvoltStepProvider || strings.HasPrefix(trimmed, retiredvoltStepProvider+"/") {
		return replacement
	}
	return ref
}

func migrateRetiredvoltProviderAccess(access []string, replacement string) []string {
	if access == nil {
		return nil
	}
	out := make([]string, 0, len(access))
	seen := make(map[string]struct{}, len(access))
	for _, name := range access {
		name = strings.TrimSpace(name)
		if name == retiredvoltStepProvider {
			name = replacement
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
