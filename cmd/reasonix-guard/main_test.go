package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"voltui/internal/repair"
)

func TestCheckReportsInvalidProjectConfig(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "reasonix.toml"), []byte("[broken\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if code := run([]string{"check", "--root", root, "--json"}); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
}

func TestFailedInstallBlocksLaunch(t *testing.T) {
	cases := []struct {
		name   string
		result repair.UpdateRollbackResult
		err    error
		want   bool
	}{
		{name: "no error never blocks", result: repair.UpdateRollbackResult{}, err: nil, want: false},
		{name: "incomplete rollback fails closed", result: repair.UpdateRollbackResult{}, err: errors.New("stage failed"), want: true},
		{name: "uncompensated rollback fails closed", result: repair.UpdateRollbackResult{MixedInstall: true}, err: errors.New("restore failed"), want: true},
		{name: "completed restore with marker cleanup error launches", result: repair.UpdateRollbackResult{RolledBack: true}, err: errors.New("remove marker: permission denied"), want: false},
	}
	for _, tc := range cases {
		if got := failedInstallBlocksLaunch(tc.result, tc.err); got != tc.want {
			t.Errorf("%s: failedInstallBlocksLaunch = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestDesktopExecutableCandidatesPreferCurrentPackageName(t *testing.T) {
	windows := desktopExecutableCandidates(filepath.Join("install", "voltui-launcher.exe"), "windows")
	if got, want := windows, []string{
		filepath.Join("install", "voltui-desktop.exe"),
		filepath.Join("install", "reasonix-desktop.exe"),
	}; !slices.Equal(got, want) {
		t.Fatalf("Windows candidates = %q, want %q", got, want)
	}

	linux := desktopExecutableCandidates("/opt/voltui/reasonix-guard", "linux")
	if got, want := linux, []string{
		"/opt/voltui/voltui-desktop",
		"/opt/voltui/reasonix-desktop",
	}; !slices.Equal(got, want) {
		t.Fatalf("Linux candidates = %q, want %q", got, want)
	}
}

func TestWindowsDetachedLauncherNames(t *testing.T) {
	for _, name := range []string{"voltui-launcher.exe", "VOLTUI-LAUNCHER.EXE", "reasonix-launcher.exe", "reasonix.exe"} {
		if !isWindowsDetachedLauncher(name) {
			t.Errorf("isWindowsDetachedLauncher(%q) = false, want true", name)
		}
	}
	if isWindowsDetachedLauncher("voltui-desktop.exe") {
		t.Fatal("desktop executable must not be treated as a detached launcher")
	}
}

func TestOpenDesktopLaunchLogUsesUserStateDirectory(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("REASONIX_HOME", stateDir)
	logFile, logPath, err := openDesktopLaunchLog()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := logFile.WriteString("startup failure\n"); err != nil {
		t.Fatal(err)
	}
	if err := logFile.Close(); err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(stateDir, "logs", "desktop-launch.log"); logPath != want {
		t.Fatalf("log path = %q, want %q", logPath, want)
	}
	contents, err := os.ReadFile(logPath)
	if err != nil || !strings.Contains(string(contents), "startup failure") {
		t.Fatalf("log contents = %q, err = %v", contents, err)
	}
}

func TestStartDetachedDesktopLogsStartFailure(t *testing.T) {
	stateDir := t.TempDir()
	t.Setenv("REASONIX_HOME", stateDir)
	previousShowLaunchError := showLaunchError
	showLaunchError = func(string, string) {}
	t.Cleanup(func() { showLaunchError = previousShowLaunchError })
	missingDesktop := filepath.Join(t.TempDir(), "missing-desktop")
	if code := startDetachedDesktop(exec.Command(missingDesktop), missingDesktop); code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	logPath := filepath.Join(stateDir, "logs", "desktop-launch.log")
	contents, err := os.ReadFile(logPath)
	if err != nil || !strings.Contains(string(contents), "launch failed:") {
		t.Fatalf("log contents = %q, err = %v", contents, err)
	}
}
