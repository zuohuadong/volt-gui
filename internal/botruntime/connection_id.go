package botruntime

import (
	"strings"

	"voltui/internal/config"
)

// ConnectionRuntimeID returns the stable runtime identifier for a bot connection.
// It prefers the explicit ID, falls back to provider-domain, then provider alone.
func ConnectionRuntimeID(conn config.BotConnectionConfig) string {
	if id := strings.TrimSpace(conn.ID); id != "" {
		return id
	}
	provider := strings.TrimSpace(conn.Provider)
	domain := strings.TrimSpace(conn.Domain)
	if provider == "" {
		return ""
	}
	if domain == "" {
		return provider
	}
	return provider + "-" + domain
}
