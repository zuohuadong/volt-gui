package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWriteDesktopStartupErrorUsesUserStateDirectory(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("REASONIX_STATE_HOME", stateDir)
	logPath := writeDesktopStartupError(errors.New("webview unavailable"))
	if want := filepath.Join(stateDir, "logs", "desktop-startup.log"); logPath != want {
		t.Fatalf("log path = %q, want %q", logPath, want)
	}
	contents, err := os.ReadFile(logPath)
	if err != nil || !strings.Contains(string(contents), "webview unavailable") {
		t.Fatalf("log contents = %q, err = %v", contents, err)
	}
}
