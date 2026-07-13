package main

import (
	"testing"

	"voltui/internal/event"
)

func TestToWireBrowserPromptsContainMetadataOnly(t *testing.T) {
	for _, tc := range []struct {
		kind event.Kind
		want string
	}{
		{kind: event.BrowserCredentialRequest, want: "browser_credential_request"},
		{kind: event.BrowserVerificationRequest, want: "browser_verification_request"},
	} {
		t.Run(tc.want, func(t *testing.T) {
			wire := toWire(event.Event{Kind: tc.kind, BrowserPrompt: event.BrowserPrompt{
				ID: "browser-1", Origin: "https://example.com:443", URL: "https://example.com/login", Reason: "需要登录",
			}})
			if wire.Kind != tc.want || wire.BrowserPrompt == nil {
				t.Fatalf("wire browser prompt = %#v", wire)
			}
			if wire.BrowserPrompt.ID != "browser-1" || wire.BrowserPrompt.Origin != "https://example.com:443" {
				t.Fatalf("wire browser prompt metadata = %#v", wire.BrowserPrompt)
			}
		})
	}
}
