package builtin

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

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

type fakeBrowserEvaluator struct {
	result json.RawMessage
	err    error
	expr   string
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
	}, tool.BrowserCredential{Username: "alice", Password: secret})
	if err == nil || strings.Contains(err.Error(), secret) {
		t.Fatalf("login error leaked password: %v", err)
	}
	if got := redactBrowserSecret("welcome "+secret, secret); strings.Contains(got, secret) {
		t.Fatalf("browser output leaked password: %q", got)
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
