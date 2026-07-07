package builtin

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
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
