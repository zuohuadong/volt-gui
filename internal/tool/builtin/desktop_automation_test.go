package builtin

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"voltui/internal/browserauth"
	"voltui/internal/tool"
)

func TestDesktopAutomationToolsRegisteredAndGated(t *testing.T) {
	for _, tc := range []struct {
		name string
		tool interface {
			Name() string
			ReadOnly() bool
			Schema() json.RawMessage
		}
	}{
		{"desktop_screenshot", desktopScreenshot{}},
		{"desktop_mouse", desktopMouse{}},
		{"desktop_keyboard", desktopKeyboard{}},
		{"browser_control", browserControl{}},
	} {
		if tc.tool.Name() != tc.name {
			t.Fatalf("%T Name() = %q, want %q", tc.tool, tc.tool.Name(), tc.name)
		}
		if tc.tool.ReadOnly() {
			t.Fatalf("%s must not be read-only; it needs the permission gate", tc.name)
		}
		var schema map[string]any
		if err := json.Unmarshal(tc.tool.Schema(), &schema); err != nil {
			t.Fatalf("%s schema is not valid JSON: %v", tc.name, err)
		}
	}
}

func TestDesktopMouseRejectsInvalidAction(t *testing.T) {
	_, err := desktopMouse{}.Execute(context.Background(), json.RawMessage(`{"action":"teleport"}`))
	if err == nil || !strings.Contains(err.Error(), "action must be") {
		t.Fatalf("expected invalid action error, got %v", err)
	}
}

func TestDesktopKeyboardValidatesRequiredFields(t *testing.T) {
	_, err := desktopKeyboard{}.Execute(context.Background(), json.RawMessage(`{"action":"type"}`))
	if err == nil || !strings.Contains(err.Error(), "text is required") {
		t.Fatalf("expected missing text error, got %v", err)
	}
	_, err = desktopKeyboard{}.Execute(context.Background(), json.RawMessage(`{"action":"press"}`))
	if err == nil || !strings.Contains(err.Error(), "key is required") {
		t.Fatalf("expected missing key error, got %v", err)
	}
}

func TestBrowserControlNoBrowserIsGraceful(t *testing.T) {
	t.Setenv("VOLTUI_BROWSER_PATH", "/nonexistent/chromium-does-not-exist")

	out, err := browserControl{}.Execute(context.Background(), json.RawMessage(`{"url":"https://example.com"}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "no browser found") {
		t.Fatalf("expected no-browser message, got %q", out)
	}
}

func TestBrowserControlRejectsNonHTTPURL(t *testing.T) {
	_, err := browserControl{}.Execute(context.Background(), json.RawMessage(`{"url":"file:///etc/passwd"}`))
	if err == nil || !strings.Contains(err.Error(), "http(s)") {
		t.Fatalf("expected http(s) error, got %v", err)
	}
}

func TestBrowserControlLoginSchemaContainsSelectorsButNoCredentialFields(t *testing.T) {
	var schema struct {
		Properties map[string]struct {
			Properties map[string]json.RawMessage `json:"properties"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(browserControl{}.Schema(), &schema); err != nil {
		t.Fatal(err)
	}
	login, ok := schema.Properties["login"]
	if !ok {
		t.Fatal("schema missing login object")
	}
	for _, selector := range []string{"username_selector", "password_selector", "submit_selector", "verification", "post_submit_wait_ms"} {
		if _, ok := login.Properties[selector]; !ok {
			t.Errorf("login schema missing %s", selector)
		}
	}
	for _, secret := range []string{"username", "password", "credential"} {
		if _, ok := login.Properties[secret]; ok {
			t.Errorf("login schema must not expose %q field", secret)
		}
	}
}

func TestBrowserControlLoginWithoutProviderFailsClosed(t *testing.T) {
	t.Setenv("VOLTUI_BROWSER_PATH", "/nonexistent/chromium-does-not-exist")
	_, err := browserControl{}.Execute(context.Background(), json.RawMessage(`{
		"url":"https://example.com/login",
		"login":{"username_selector":"#user","password_selector":"#pass","submit_selector":"button","verification":"never"}
	}`))
	if err == nil || !strings.Contains(err.Error(), "interactive browser login") {
		t.Fatalf("login without provider error = %v", err)
	}
}

func TestBrowserControlSecureLoginRejectsScreenshotArtifacts(t *testing.T) {
	t.Setenv("VOLTUI_BROWSER_PATH", "/nonexistent/chromium-does-not-exist")
	provider := &browserInteractionStub{credential: tool.BrowserCredential{Username: "alice", Password: "secret"}}
	ctx := tool.WithBrowserInteractionProvider(context.Background(), provider)
	_, err := browserControl{}.Execute(ctx, json.RawMessage(`{
		"url":"https://example.com/login",
		"login":{"username_selector":"#user","password_selector":"#pass","submit_selector":"button","verification":"never"},
		"screenshot_path":"login.png"
	}`))
	if err == nil || !strings.Contains(err.Error(), "screenshot") {
		t.Fatalf("secure login screenshot error = %v", err)
	}
}

type fakeBrowserEvaluator struct {
	result json.RawMessage
	err    error
	expr   string
}

type sequenceBrowserEvaluator struct {
	results []json.RawMessage
	errs    []error
	index   int
}

func (s *sequenceBrowserEvaluator) evaluateValue(context.Context, string) (json.RawMessage, error) {
	index := s.index
	s.index++
	if index < len(s.errs) && s.errs[index] != nil {
		return nil, s.errs[index]
	}
	if index < len(s.results) {
		return s.results[index], nil
	}
	return json.RawMessage(`{"visibleText":"","attributes":[]}`), nil
}

type browserInteractionStub struct {
	credential tool.BrowserCredential
	requests   []tool.BrowserCredentialRequest
}

func (s *browserInteractionStub) RequestBrowserCredential(_ context.Context, req tool.BrowserCredentialRequest) (tool.BrowserCredential, error) {
	s.requests = append(s.requests, req)
	return s.credential, nil
}

func (*browserInteractionStub) WaitBrowserVerification(context.Context, tool.BrowserVerificationRequest) (bool, error) {
	return true, nil
}

func TestBrowserControlSecureLoginEndToEnd(t *testing.T) {
	if _, err := findBrowserBin(); err != nil {
		t.Skipf("browser unavailable: %v", err)
	}
	const secret = "browser-e2e-secret"
	loginServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`<!doctype html><html><body>
<input id="user"><input id="pass" type="password"><button id="login" onclick="document.body.innerText = document.querySelector('#user').value === 'alice' && document.querySelector('#pass').value === 'browser-e2e-secret' ? 'signed in dashboard' : 'login failed'">Login</button>
</body></html>`))
	}))
	defer loginServer.Close()
	redirectServer := httptest.NewServer(http.RedirectHandler(loginServer.URL+"/login", http.StatusFound))
	defer redirectServer.Close()
	provider := &browserInteractionStub{credential: tool.BrowserCredential{Username: "alice", Password: secret}}
	ctx := tool.WithBrowserInteractionProvider(context.Background(), provider)
	args, _ := json.Marshal(map[string]any{
		"url": redirectServer.URL,
		"login": map[string]any{
			"username_selector": "#user", "password_selector": "#pass", "submit_selector": "#login",
			"verification": "never", "post_submit_wait_ms": 100,
		},
	})
	out, err := browserControl{}.Execute(ctx, args)
	if err != nil {
		t.Fatalf("browser secure login: %v", err)
	}
	if !strings.Contains(out, "signed in dashboard") || strings.Contains(out, secret) {
		t.Fatalf("browser secure login output = %q", out)
	}
	wantOrigin, err := browserauth.NormalizeOrigin(loginServer.URL)
	if err != nil {
		t.Fatal(err)
	}
	if len(provider.requests) != 1 || provider.requests[0].Origin != wantOrigin || provider.requests[0].URL != loginServer.URL+"/login" {
		t.Fatalf("credential requests = %#v", provider.requests)
	}
}

func (f *fakeBrowserEvaluator) evaluateValue(_ context.Context, expr string) (json.RawMessage, error) {
	f.expr = expr
	return f.result, f.err
}

func TestBrowserLoginHelperAndOutputNeverLeakPassword(t *testing.T) {
	const secret = "login-helper-secret"
	fake := &fakeBrowserEvaluator{err: errors.New("runtime rejected " + secret)}
	err := performBrowserLogin(context.Background(), fake, browserLoginRequest{
		UsernameSelector: "#user", PasswordSelector: "#pass", SubmitSelector: "button",
	}, tool.BrowserCredential{Username: "alice", Password: secret}, "https://example.com:443")
	if err == nil || strings.Contains(err.Error(), secret) {
		t.Fatalf("login error leaked password: %v", err)
	}
	if !strings.Contains(fake.expr, "location.protocol") || !strings.Contains(fake.expr, "https://example.com:443") {
		t.Fatalf("login expression lacks exact-origin guard: %s", fake.expr)
	}
	if !strings.Contains(fake.expr, `password.type !== "password"`) {
		t.Fatalf("login expression does not require a password input: %s", fake.expr)
	}
	if got := redactBrowserSecret("welcome "+secret, secret); strings.Contains(got, secret) {
		t.Fatalf("browser output leaked password: %q", got)
	}
}

func TestBrowserVerificationPollingDetectsSlowChallengeAndFailsClosedOnInspectionError(t *testing.T) {
	slow := &sequenceBrowserEvaluator{results: []json.RawMessage{
		json.RawMessage(`{"visibleText":"Signing in","attributes":[]}`),
		json.RawMessage(`{"visibleText":"请输入验证码","attributes":["one-time-code"]}`),
	}}
	needed, reason := pollBrowserVerification(context.Background(), slow, 30*time.Millisecond, time.Millisecond)
	if !needed || reason == "" {
		t.Fatalf("slow verification result = %v, %q", needed, reason)
	}

	broken := &fakeBrowserEvaluator{err: errors.New("runtime unavailable")}
	needed, reason = pollBrowserVerification(context.Background(), broken, 5*time.Millisecond, time.Millisecond)
	if !needed || !strings.Contains(reason, "无法确认") {
		t.Fatalf("inspection failure result = %v, %q", needed, reason)
	}
}

func TestBrowserVerificationDetection(t *testing.T) {
	tests := []struct {
		name    string
		signals browserVerificationSignals
		want    bool
	}{
		{name: "one time autocomplete", signals: browserVerificationSignals{Attributes: []string{"one-time-code"}}, want: true},
		{name: "Chinese verification", signals: browserVerificationSignals{VisibleText: "请输入验证码完成登录"}, want: true},
		{name: "MFA field", signals: browserVerificationSignals{Attributes: []string{"mfa_code"}}, want: true},
		{name: "ordinary page", signals: browserVerificationSignals{VisibleText: "Welcome to the dashboard"}, want: false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got, _ := detectBrowserVerification(tc.signals)
			if got != tc.want {
				t.Fatalf("detectBrowserVerification(%#v) = %v, want %v", tc.signals, got, tc.want)
			}
		})
	}
}
