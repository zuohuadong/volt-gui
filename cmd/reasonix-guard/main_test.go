package main

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
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
