package config

// EffectiveToolCalling resolves the selected model's tool-call capability.
// Existing local providers omitted this metadata, so nil keeps their historical
// enabled behavior. A resolved per-model declaration takes precedence.
func EffectiveToolCalling(entry *ProviderEntry) bool {
	if entry == nil {
		return false
	}
	if entry.toolCallingOverride != nil {
		return *entry.toolCallingOverride
	}
	if entry.ToolCalling != nil {
		return *entry.ToolCalling
	}
	return true
}
