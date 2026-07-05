package permission

import "voltui/internal/shellsafe"

func normalizeBashSafeRedirectsForMatch(subject string) (string, bool) {
	return shellsafe.NormalizeBashSafeRedirectsForMatch(subject)
}
