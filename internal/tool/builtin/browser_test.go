package builtin

import (
	"context"
	"encoding/json"
	"io"
	"os"
	"strings"
	"testing"
	"time"
)

func TestBrowserNavigateNameAndReadOnly(t *testing.T) {
	var bn browserNavigate
	if bn.Name() != "browser_navigate" {
		t.Errorf("Name() = %q, want %q", bn.Name(), "browser_navigate")
	}
	if !bn.ReadOnly() {
		t.Error("ReadOnly() = false, want true")
	}
}

func TestBrowserNavigateSchemaHasURLAndWait(t *testing.T) {
	var bn browserNavigate
	var schema struct {
		Properties map[string]struct {
			Type string `json:"type"`
		} `json:"properties"`
		Required []string `json:"required"`
	}
	if err := json.Unmarshal(bn.Schema(), &schema); err != nil {
		t.Fatalf("schema is not valid JSON: %v", err)
	}
	if _, ok := schema.Properties["url"]; !ok {
		t.Error("schema missing url property")
	}
	if _, ok := schema.Properties["wait"]; !ok {
		t.Error("schema missing wait property")
	}
	if len(schema.Required) != 1 || schema.Required[0] != "url" {
		t.Fatalf("required = %v, want [url]", schema.Required)
	}
}

func TestBrowserNavigateRejectsEmptyURL(t *testing.T) {
	var bn browserNavigate
	_, err := bn.Execute(context.Background(), json.RawMessage(`{"url":""}`))
	if err == nil {
		t.Fatal("expected empty URL error")
	}
}

func TestBrowserNavigateRejectsNonHTTPURL(t *testing.T) {
	var bn browserNavigate
	_, err := bn.Execute(context.Background(), json.RawMessage(`{"url":"file:///etc/passwd"}`))
	if err == nil || !strings.Contains(err.Error(), "http(s)") {
		t.Fatalf("expected http(s) error, got %v", err)
	}
}

func TestBrowserNavigateNoBrowserIsGraceful(t *testing.T) {
	t.Setenv("VOLTUI_BROWSER_PATH", "/nonexistent/chromium-does-not-exist")

	var bn browserNavigate
	out, err := bn.Execute(context.Background(), json.RawMessage(`{"url":"https://example.com","wait":99999}`))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !strings.Contains(out, "no browser found") {
		t.Fatalf("expected no-browser message, got %q", out)
	}
}

func TestFindBrowserBinExplicit(t *testing.T) {
	tmp := t.TempDir()
	bin := tmp + "/my-chrome"
	if err := os.WriteFile(bin, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	t.Setenv("VOLTUI_BROWSER_PATH", bin)

	got, err := findBrowserBin()
	if err != nil {
		t.Fatalf("findBrowserBin: %v", err)
	}
	if got != bin {
		t.Fatalf("findBrowserBin() = %q, want %q", got, bin)
	}
}

func TestFindBrowserBinExplicitNotFound(t *testing.T) {
	t.Setenv("VOLTUI_BROWSER_PATH", "/no/such/browser")
	if _, err := findBrowserBin(); err == nil {
		t.Fatal("expected error for nonexistent VOLTUI_BROWSER_PATH")
	}
}

func TestIsBrowserBin(t *testing.T) {
	tmp := t.TempDir()

	exe := tmp + "/chrome"
	if err := os.WriteFile(exe, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatal(err)
	}
	if !isBrowserBin(exe) {
		t.Fatal("executable file should be detected")
	}

	noExe := tmp + "/readme"
	if err := os.WriteFile(noExe, []byte("readme"), 0o644); err != nil {
		t.Fatal(err)
	}
	if isBrowserBin(noExe) {
		t.Fatal("non-executable file should not be detected")
	}

	if isBrowserBin(tmp) {
		t.Fatal("directory should not be detected")
	}
	if isBrowserBin(tmp + "/missing") {
		t.Fatal("missing path should not be detected")
	}
}

func TestReadDevToolsURL(t *testing.T) {
	input := strings.NewReader("noise\nDevTools listening on ws://127.0.0.1:12345/devtools/browser/abc\n")
	got, err := readDevToolsURL(context.Background(), input)
	if err != nil {
		t.Fatalf("readDevToolsURL: %v", err)
	}
	want := "ws://127.0.0.1:12345/devtools/browser/abc"
	if got != want {
		t.Fatalf("readDevToolsURL() = %q, want %q", got, want)
	}
}

func TestReadDevToolsURLClosedBeforeEndpoint(t *testing.T) {
	_, err := readDevToolsURL(context.Background(), strings.NewReader("noise only\n"))
	if err == nil {
		t.Fatal("expected error when stderr closes before endpoint")
	}
}

func TestReadDevToolsURLContextCancel(t *testing.T) {
	reader, writer := io.Pipe()
	defer writer.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Millisecond)
	defer cancel()

	_, err := readDevToolsURL(ctx, reader)
	if err == nil {
		t.Fatal("expected context timeout")
	}
}

func TestParseRuntimeString(t *testing.T) {
	got, err := parseRuntimeString(json.RawMessage(`{"result":{"type":"string","value":"Hello"}}`))
	if err != nil {
		t.Fatalf("parseRuntimeString: %v", err)
	}
	if got != "Hello" {
		t.Fatalf("parseRuntimeString() = %q, want Hello", got)
	}
}

func TestParseRuntimeStringUndefined(t *testing.T) {
	got, err := parseRuntimeString(json.RawMessage(`{"result":{"type":"undefined"}}`))
	if err != nil {
		t.Fatalf("parseRuntimeString: %v", err)
	}
	if got != "" {
		t.Fatalf("parseRuntimeString() = %q, want empty string", got)
	}
}

func TestParseRuntimeStringException(t *testing.T) {
	_, err := parseRuntimeString(json.RawMessage(`{"exceptionDetails":{"text":"boom"}}`))
	if err == nil {
		t.Fatal("expected exception error")
	}
}

func TestTruncate(t *testing.T) {
	if got := truncate("abc", 5); got != "abc" {
		t.Fatalf("truncate short = %q, want abc", got)
	}
	if got := truncate("abcdefghij", 5); got != "abcde..." {
		t.Fatalf("truncate long = %q, want abcde...", got)
	}
}
