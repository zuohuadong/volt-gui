package cli

import (
	"context"
	"io"
	"os"
	"path/filepath"
	"testing"

	tea "charm.land/bubbletea/v2"
)

const tinyPNGBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="

func clipboardCopyResultFromCmd(t *testing.T, cmd tea.Cmd) clipboardCopyMsg {
	t.Helper()
	if cmd == nil {
		t.Fatal("expected clipboard command")
	}
	message := cmd()
	if copyMessage, ok := clipboardCopyMessageFrom(message); ok {
		return copyMessage
	}
	t.Fatalf("clipboard command returned %T, want clipboardCopyMsg", message)
	return clipboardCopyMsg{}
}

func clipboardCopyMessageFrom(message tea.Msg) (clipboardCopyMsg, bool) {
	switch typedMessage := message.(type) {
	case clipboardCopyMsg:
		return typedMessage, true
	case tea.BatchMsg:
		for _, child := range typedMessage {
			if child == nil {
				continue
			}
			if copyMessage, ok := child().(clipboardCopyMsg); ok {
				return copyMessage, true
			}
		}
	}
	return clipboardCopyMsg{}, false
}

func setLocalClipboardSession(t *testing.T) {
	t.Helper()
	t.Setenv("SSH_CONNECTION", "")
	t.Setenv("SSH_CLIENT", "")
	t.Setenv("SSH_TTY", "")
}

func isolateCLIConfigHome(t *testing.T) string {
	t.Helper()
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("REASONIX_HOME", "")
	if err := os.Unsetenv("REASONIX_HOME"); err != nil {
		t.Fatalf("unset REASONIX_HOME: %v", err)
	}
	t.Setenv("REASONIX_CREDENTIALS_STORE", "file")
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("AppData", filepath.Join(home, "AppData"))
	t.Chdir(t.TempDir())
	return home
}

func isolateUserConfig(t *testing.T) {
	t.Helper()
	root := t.TempDir()
	t.Setenv("HOME", root)
	t.Setenv("REASONIX_CREDENTIALS_STORE", "file")
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(root, "config"))
	t.Setenv("AppData", filepath.Join(root, "AppData"))
	t.Chdir(root)
}

func captureStderr(t *testing.T, writeStderr func()) string {
	t.Helper()
	previousStderr := os.Stderr
	reader, writer, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	os.Stderr = writer
	defer func() { os.Stderr = previousStderr }()

	writeStderr()
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	captured, err := io.ReadAll(reader)
	if err != nil {
		t.Fatal(err)
	}
	return string(captured)
}

func restoreThemeForTest(previousColor bool, previousTheme cliPalette) {
	colorEnabled = previousColor
	activeCLITheme = previousTheme
	refreshCLIStyles()
}

func completionLabels(completions []compItem) []string {
	labels := make([]string, len(completions))
	for index, completion := range completions {
		labels[index] = completion.label
	}
	return labels
}

func hasCompletionLabel(completions []compItem, label string) bool {
	for _, completion := range completions {
		if completion.label == label {
			return true
		}
	}
	return false
}

type blockingTurnRunner struct {
	started chan struct{}
}

func (runner *blockingTurnRunner) Run(ctx context.Context, _ string) error {
	close(runner.started)
	<-ctx.Done()
	return ctx.Err()
}
