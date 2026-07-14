package main

import "strings"

// normalizeBotConnectionToolApprovalOverride preserves an empty per-connection
// value because it means "inherit the global bot mode". Explicit values still
// use the shared compatibility normalization.
func normalizeBotConnectionToolApprovalOverride(mode string) string {
	if strings.TrimSpace(mode) == "" {
		return ""
	}
	return normalizeBotConnectionToolApprovalMode(mode)
}
