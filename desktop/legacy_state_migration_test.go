package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"

	"voltui/internal/config"
)

func TestMigrateLegacyDesktopStateRepairsPathsMergesIndexesAndPreservesCurrent(t *testing.T) {
	legacyDir := t.TempDir()
	currentDir := t.TempDir()
	legacySession := filepath.Join(legacyDir, "sessions", "legacy.jsonl")
	currentSession := filepath.Join(currentDir, "sessions", "legacy.jsonl")
	for _, path := range []string{legacySession, currentSession} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(path, []byte("legacy conversation\n"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	legacyTabs := desktopTabsFile{
		ActiveTab: "legacy-tab",
		Tabs:      []desktopTabEntry{{ID: "legacy-tab", Scope: "global", TopicID: "legacy-topic", SessionPath: legacySession}},
	}
	currentTabs := desktopTabsFile{
		ActiveTab: "current-tab",
		Tabs:      []desktopTabEntry{{ID: "current-tab", Scope: "global", TopicID: "current-topic", SessionPath: filepath.Join(currentDir, "sessions", "current.jsonl")}},
	}
	if err := writeDesktopTabsFile(filepath.Join(legacyDir, tabsFileName), legacyTabs); err != nil {
		t.Fatal(err)
	}
	if err := writeDesktopTabsFile(filepath.Join(currentDir, tabsFileName), currentTabs); err != nil {
		t.Fatal(err)
	}

	legacyProjects := desktopProjectFile{
		GlobalTopics: []string{"legacy-topic"},
		Projects:     []desktopProject{{Root: "/legacy/project", Topics: []string{"legacy-project-topic"}}},
	}
	currentProjects := desktopProjectFile{
		GlobalTopics: []string{"current-topic"},
		Projects:     []desktopProject{{Root: "/legacy/project", Topics: []string{"current-project-topic"}}},
	}
	if err := writeDesktopProjectsFile(filepath.Join(legacyDir, desktopProjectsFile), legacyProjects); err != nil {
		t.Fatal(err)
	}
	if err := writeDesktopProjectsFile(filepath.Join(currentDir, desktopProjectsFile), currentProjects); err != nil {
		t.Fatal(err)
	}

	result, err := migrateLegacyDesktopState(legacyDir, currentDir)
	if err != nil {
		t.Fatalf("migrate legacy desktop state: %v", err)
	}
	if result.RepairedTabs != 1 || result.MergedTabs != 1 {
		t.Fatalf("migration result = %+v, want one repaired and one merged tab", result)
	}

	gotTabs := readDesktopTabsFile(t, filepath.Join(currentDir, tabsFileName))
	if gotTabs.ActiveTab != "current-tab" || len(gotTabs.Tabs) != 2 {
		t.Fatalf("current tabs = %+v, want current active plus legacy tab", gotTabs)
	}
	for _, tab := range gotTabs.Tabs {
		if tab.ID == "legacy-tab" && tab.SessionPath != currentSession {
			t.Fatalf("legacy tab path = %q, want %q", tab.SessionPath, currentSession)
		}
	}

	gotProjects := readDesktopProjectsFile(t, filepath.Join(currentDir, desktopProjectsFile))
	if len(gotProjects.GlobalTopics) != 2 || len(gotProjects.Projects) != 1 || len(gotProjects.Projects[0].Topics) != 2 {
		t.Fatalf("merged projects = %+v, want current and legacy topics", gotProjects)
	}
	if _, err := os.Stat(legacySession); err != nil {
		t.Fatalf("legacy session was removed: %v", err)
	}
}

func TestMigrateLegacyDesktopStateSkipsMissingSessionWithoutFabricatingTab(t *testing.T) {
	legacyDir := t.TempDir()
	currentDir := t.TempDir()
	staleTabs := desktopTabsFile{
		ActiveTab: "missing",
		Tabs:      []desktopTabEntry{{ID: "missing", Scope: "global", TopicID: "missing", SessionPath: filepath.Join(legacyDir, "sessions", "gone.jsonl")}},
	}
	if err := writeDesktopTabsFile(filepath.Join(legacyDir, tabsFileName), staleTabs); err != nil {
		t.Fatal(err)
	}
	// Model the generic copy step: the current index may already be a byte copy
	// of the legacy index before the path-repair pass sees that the transcript is gone.
	if err := writeDesktopTabsFile(filepath.Join(currentDir, tabsFileName), staleTabs); err != nil {
		t.Fatal(err)
	}
	result, err := migrateLegacyDesktopState(legacyDir, currentDir)
	if err != nil {
		t.Fatalf("migrate missing session: %v", err)
	}
	if result.SkippedTabs != 1 {
		t.Fatalf("migration result = %+v, want one skipped tab", result)
	}
	got := readDesktopTabsFile(t, filepath.Join(currentDir, tabsFileName))
	if len(got.Tabs) != 0 {
		t.Fatalf("missing session fabricated a tab: %+v", got)
	}
}

func TestUpgradeRecoveryRestoresLegacySessionWhenCurrentConfigAlreadyExists(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Windows already uses the same AppData support directory")
	}
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("USERPROFILE", home)
	t.Setenv("XDG_CONFIG_HOME", filepath.Join(home, ".config"))
	t.Setenv("AppData", filepath.Join(home, "AppData", "Roaming"))
	t.Setenv("VOLTUI_HOME", "")
	t.Setenv("REASONIX_HOME", "")
	t.Setenv("VOLTUI_STATE_HOME", "")
	t.Setenv("REASONIX_STATE_HOME", "")

	legacyDir := config.LegacyOSSupportDir()
	currentDir := config.ReasonixHomeDir()
	if legacyDir == "" || currentDir == "" || legacyDir == currentDir {
		t.Skip("test requires distinct legacy and current support directories")
	}
	legacySessionsDir := filepath.Join(legacyDir, "sessions")
	if err := os.MkdirAll(legacySessionsDir, 0o700); err != nil {
		t.Fatal(err)
	}
	legacySession := writeLegacySession(t, legacySessionsDir, "affected-user.jsonl", "升级前的会话", time.Now())
	if err := writeDesktopTabsFile(filepath.Join(legacyDir, tabsFileName), desktopTabsFile{
		ActiveTab: "legacy-tab",
		Tabs:      []desktopTabEntry{{ID: "legacy-tab", Scope: "global", SessionPath: legacySession}},
	}); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(currentDir, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(currentDir, "config.toml"), []byte("config_version = 1\n"), 0o600); err != nil {
		t.Fatal(err)
	}

	migration := config.MigrateLegacySupportDataOnUpgrade()
	if migration == nil {
		t.Fatal("expected upgrade support-data migration")
	}
	result, err := migrateLegacyDesktopState(legacyDir, currentDir)
	if err != nil {
		t.Fatalf("repair desktop indexes: %v", err)
	}
	if result.RepairedTabs == 0 {
		t.Fatalf("desktop index was not repaired: %+v", result)
	}

	migratedSession := filepath.Join(currentDir, "sessions", filepath.Base(legacySession))
	if data, err := os.ReadFile(migratedSession); err != nil || !strings.Contains(string(data), "升级前的会话") {
		t.Fatalf("migrated session data missing: data=%q err=%v", data, err)
	}
	tabs := readDesktopTabsFile(t, filepath.Join(currentDir, tabsFileName))
	if len(tabs.Tabs) != 1 || tabs.Tabs[0].SessionPath != migratedSession {
		t.Fatalf("recovered desktop tabs = %+v, want session %q", tabs, migratedSession)
	}
	if _, err := os.Stat(legacySession); err != nil {
		t.Fatalf("legacy session was removed: %v", err)
	}

	nodes := NewApp().ListProjectTree()
	if len(nodes) == 0 || len(nodes[0].Children) == 0 {
		t.Fatalf("recovered session was not rebuilt into the project tree: %#v", nodes)
	}
}

func writeDesktopTabsFile(path string, value desktopTabsFile) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o600)
}

func readDesktopTabsFile(t *testing.T, path string) desktopTabsFile {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var value desktopTabsFile
	if err := json.Unmarshal(b, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func writeDesktopProjectsFile(path string, value desktopProjectFile) error {
	b, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, b, 0o600)
}

func readDesktopProjectsFile(t *testing.T, path string) desktopProjectFile {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var value desktopProjectFile
	if err := json.Unmarshal(b, &value); err != nil {
		t.Fatal(err)
	}
	return value
}
