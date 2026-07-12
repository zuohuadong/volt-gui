package control

import (
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"

	"voltui/internal/i18n"
	"voltui/internal/provider"
	"voltui/internal/secrets"
)

// explainError maps a provider HTTP failure to an actionable, localized message
// so the turn-done error the UI shows is never a bare status code or silent
// failure. Unknown errors (and nil) pass through unchanged.
func explainError(err error) error {
	if err == nil {
		return nil
	}
	if provider.IsStreamInterrupted(err) {
		return fmt.Errorf("model stream interrupted after recovery attempts: %s. The partial response was kept; retry or ask VoltUI to continue", err.Error())
	}
	if provider.IsConnReset(err) {
		return fmt.Errorf("model stream disconnected before completion after retry attempts: %s. Check the provider/proxy connection, then retry or ask VoltUI to continue", err.Error())
	}
	var apiErr *provider.APIError
	if errors.As(err, &apiErr) {
		msg := i18n.M.ProviderStatusMessage(apiErr.Status)
		if msg == "" {
			return err
		}
		if reason := apiErrorReason(apiErr); reason != "" {
			return fmt.Errorf("%s\n%s", msg, reason)
		}
		return errors.New(msg)
	}
	var authErr *provider.AuthError
	if errors.As(err, &authErr) {
		msg := i18n.M.ProviderErrAuth
		if authErr.HasKey {
			msg = i18n.M.ProviderErrAuthRejected
		}
		switch {
		case authErr.KeyEnv != "" && authErr.KeySource != "":
			msg = fmt.Sprintf("%s (%s from %s)", msg, authErr.KeyEnv, authErr.KeySource)
		case authErr.KeyEnv != "":
			msg = fmt.Sprintf("%s (%s)", msg, authErr.KeyEnv)
		}
		// Relay gateways explain why authentication failed in the body (for
		// example, an expired token or a model-entitlement problem). Auth
		// bodies can also echo credentials, so redact them before display.
		if reason := redactAuthReason(providerBodyReason(authErr.Body)); reason != "" {
			return fmt.Errorf("%s\n%s", msg, reason)
		}
		return errors.New(msg)
	}
	return err
}

// apiErrorReason returns the provider's verbatim reason for a failed request —
// the localized line names the category, while the body names the actual cause
// (context-length exceeded, unpaired tool_calls, or a relay's unavailable
// upstream channel). Relay gateways use 402/429/5xx bodies for actionable
// diagnostics too, so every mapped status may append its body reason.
func apiErrorReason(e *provider.APIError) string {
	return providerBodyReason(e.Body)
}

// Auth failure bodies are where providers most often echo credentials. A
// partially masked tail ("****ae54") still narrows the credential, so collapse
// the entire fragment before passing a display error to the UI.
var (
	maskedFragmentRe = regexp.MustCompile(`[A-Za-z0-9._-]*\*{2,}[A-Za-z0-9._-]*`)
	// credContextRe catches prose forms not covered by secrets.Redact, such as
	// "api key: <value>". Values in this context are credentials regardless of
	// whether they have digits or a known provider prefix.
	credContextRe = regexp.MustCompile(`(?i)\b(api[ _-]?key|access[ _-]?key|secret|token|authorization|bearer|credential)s?\b(['"]?\s*[:=]?\s*['"]?)([A-Za-z0-9._~+/-]{12,})`)
	// keyTokenRe is the no-context fallback. It leaves long single-case
	// identifiers readable, but masks digit-bearing or mixed-case opaque tokens.
	keyTokenRe = regexp.MustCompile(`[A-Za-z0-9_-]{16,}`)
	digitRe    = regexp.MustCompile(`[0-9]`)
)

// redactAuthReason removes credentials from an auth-failure reason before it
// is shown to a user. The layered redaction handles known provider keys and
// bearer/JWT forms, credential prose, masked fragments, then opaque token
// fallbacks. It is intentionally limited to 401/403 bodies: request schema
// errors can legitimately contain long identifiers that must remain visible.
func redactAuthReason(s string) string {
	if s == "" {
		return s
	}
	s = secrets.Redact(s)
	s = credContextRe.ReplaceAllString(s, "${1}${2}****")
	s = maskedFragmentRe.ReplaceAllString(s, "****")
	return keyTokenRe.ReplaceAllStringFunc(s, func(tok string) string {
		mixedCase := strings.ToLower(tok) != tok && strings.ToUpper(tok) != tok
		if digitRe.MatchString(tok) || mixedCase {
			return "****"
		}
		return tok
	})
}

// providerBodyReason pulls the human reason from an OpenAI/Anthropic-shaped error
// body ({"error":{"message":…}}), falling back to the trimmed raw body.
func providerBodyReason(body string) string {
	if body == "" {
		return ""
	}
	var parsed struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if json.Unmarshal([]byte(body), &parsed) == nil && parsed.Error.Message != "" {
		return clampRunes(parsed.Error.Message, 800)
	}
	return clampRunes(body, 800)
}

func clampRunes(s string, max int) string {
	r := []rune(s)
	if len(r) <= max {
		return s
	}
	return string(r[:max]) + "…"
}
