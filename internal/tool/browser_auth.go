package tool

import "context"

// BrowserCredentialRequest contains only non-secret metadata for a browser
// login. Origin must be the canonical exact origin (scheme + host + port).
type BrowserCredentialRequest struct {
	Origin string
	URL    string
	Reason string
}

// BrowserCredential is an in-process secret carrier. Every field is excluded
// from JSON so tool arguments, events, transcripts, and logs cannot serialize
// the credential accidentally.
type BrowserCredential struct {
	Username string `json:"-"`
	Password string `json:"-"`
	Save     bool   `json:"-"`
}

// BrowserVerificationRequest asks the host to let the user finish an MFA,
// CAPTCHA, QR-code, or similar browser-only verification step.
type BrowserVerificationRequest struct {
	Origin string
	URL    string
	Reason string
}

// BrowserInteractionProvider is supplied through the tool-call context by an
// interactive host. Headless sessions deliberately omit it and fail closed.
type BrowserInteractionProvider interface {
	RequestBrowserCredential(context.Context, BrowserCredentialRequest) (BrowserCredential, error)
	WaitBrowserVerification(context.Context, BrowserVerificationRequest) (bool, error)
}

type browserInteractionProviderContextKey struct{}

func WithBrowserInteractionProvider(ctx context.Context, provider BrowserInteractionProvider) context.Context {
	if ctx == nil || provider == nil {
		return ctx
	}
	return context.WithValue(ctx, browserInteractionProviderContextKey{}, provider)
}

func BrowserInteractionProviderFrom(ctx context.Context) (BrowserInteractionProvider, bool) {
	if ctx == nil {
		return nil, false
	}
	provider, ok := ctx.Value(browserInteractionProviderContextKey{}).(BrowserInteractionProvider)
	return provider, ok && provider != nil
}
