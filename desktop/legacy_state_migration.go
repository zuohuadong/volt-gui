package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"

	"voltui/internal/fileutil"
)

type legacyDesktopMigrationResult struct {
	RepairedTabs   int
	MergedTabs     int
	SkippedTabs    int
	MergedProjects bool
}

// migrateLegacyDesktopState repairs the desktop indexes after the generic
// support-data copy has moved missing session files into the current VoltUI
// home. Existing current entries win; recoverable legacy entries are appended,
// and entries whose transcript is physically gone are not turned into blank
// conversations. Both source files remain untouched.
func migrateLegacyDesktopState(legacyDir, currentDir string) (legacyDesktopMigrationResult, error) {
	result := legacyDesktopMigrationResult{}
	legacyDir = filepath.Clean(strings.TrimSpace(legacyDir))
	currentDir = filepath.Clean(strings.TrimSpace(currentDir))
	if legacyDir == "." || currentDir == "." || legacyDir == currentDir {
		return result, nil
	}

	legacyTabsPath := filepath.Join(legacyDir, tabsFileName)
	legacyTabs, legacyTabsFound, err := loadDesktopTabsFileAt(legacyTabsPath)
	if err != nil {
		return result, fmt.Errorf("read legacy desktop tabs: %w", err)
	}
	if legacyTabsFound {
		currentTabsPath := filepath.Join(currentDir, tabsFileName)
		currentTabs, currentTabsFound, err := loadDesktopTabsFileAt(currentTabsPath)
		if err != nil {
			return result, fmt.Errorf("read current desktop tabs: %w", err)
		}
		merged, changed := mergeLegacyDesktopTabs(currentTabs, legacyTabs, legacyDir, currentDir, &result)
		if changed || !currentTabsFound {
			if err := saveJSONFileAtomic(currentTabsPath, merged); err != nil {
				return result, fmt.Errorf("write recovered desktop tabs: %w", err)
			}
		}
	}

	legacyProjectsPath := filepath.Join(legacyDir, desktopProjectsFile)
	legacyProjects, legacyProjectsFound, err := loadDesktopProjectsFileAt(legacyProjectsPath)
	if err != nil {
		return result, fmt.Errorf("read legacy desktop projects: %w", err)
	}
	if legacyProjectsFound {
		currentProjectsPath := filepath.Join(currentDir, desktopProjectsFile)
		currentProjects, currentProjectsFound, err := loadDesktopProjectsFileAt(currentProjectsPath)
		if err != nil {
			return result, fmt.Errorf("read current desktop projects: %w", err)
		}
		merged := mergeLegacyDesktopProjects(currentProjects, legacyProjects)
		if !reflect.DeepEqual(normalizeProjectsFile(currentProjects), merged) || !currentProjectsFound {
			if err := saveJSONFileAtomic(currentProjectsPath, merged); err != nil {
				return result, fmt.Errorf("write recovered desktop projects: %w", err)
			}
			result.MergedProjects = true
		}
	}
	return result, nil
}

func loadDesktopTabsFileAt(path string) (desktopTabsFile, bool, error) {
	var value desktopTabsFile
	found, err := loadJSONFile(path, &value)
	return value, found, err
}

func loadDesktopProjectsFileAt(path string) (desktopProjectFile, bool, error) {
	var value desktopProjectFile
	found, err := loadJSONFile(path, &value)
	return value, found, err
}

func loadJSONFile(path string, value any) (bool, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	if err := json.Unmarshal(b, value); err != nil {
		return true, err
	}
	return true, nil
}

func saveJSONFileAtomic(path string, value any) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	b, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".recovery-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return fileutil.ReplaceFile(tmpPath, path)
}

func mergeLegacyDesktopTabs(current, legacy desktopTabsFile, legacyDir, currentDir string, result *legacyDesktopMigrationResult) (desktopTabsFile, bool) {
	out := current
	changed := false
	seenIDs := make(map[string]bool, len(out.Tabs))
	seenSessions := make(map[string]bool, len(out.Tabs))
	skippedIDs := make(map[string]bool)
	recordSkipped := func(entry desktopTabEntry) {
		key := strings.TrimSpace(entry.ID)
		if key == "" {
			key = strings.TrimSpace(entry.SessionPath)
		}
		if key == "" || skippedIDs[key] {
			return
		}
		skippedIDs[key] = true
		result.SkippedTabs++
	}
	currentTabs := make([]desktopTabEntry, 0, len(out.Tabs))
	for _, entry := range out.Tabs {
		legacyPath := pathWithinDir(filepath.Clean(strings.TrimSpace(entry.SessionPath)), legacyDir)
		if repaired, ok := recoveredLegacySessionPath(entry.SessionPath, legacyDir, currentDir); ok && repaired != entry.SessionPath {
			entry.SessionPath = repaired
			changed = true
			result.RepairedTabs++
		} else if legacyPath && !ok {
			recordSkipped(entry)
			changed = true
			continue
		}
		currentTabs = append(currentTabs, entry)
		seenIDs[strings.TrimSpace(entry.ID)] = true
		if key := sessionRuntimeKey(entry.SessionPath); key != "" {
			seenSessions[key] = true
		}
	}
	out.Tabs = currentTabs

	legacyActiveAdded := ""
	for _, entry := range legacy.Tabs {
		repaired, ok := recoveredLegacySessionPath(entry.SessionPath, legacyDir, currentDir)
		if !ok {
			recordSkipped(entry)
			continue
		}
		entry.SessionPath = repaired
		result.RepairedTabs++
		id := strings.TrimSpace(entry.ID)
		key := sessionRuntimeKey(entry.SessionPath)
		if (id != "" && seenIDs[id]) || (key != "" && seenSessions[key]) {
			continue
		}
		out.Tabs = append(out.Tabs, entry)
		seenIDs[id] = id != ""
		seenSessions[key] = key != ""
		changed = true
		result.MergedTabs++
		if entry.ID == legacy.ActiveTab {
			legacyActiveAdded = entry.ID
		}
	}
	if !desktopTabIDPresent(out.Tabs, out.ActiveTab) {
		if legacyActiveAdded != "" {
			out.ActiveTab = legacyActiveAdded
		} else if len(out.Tabs) > 0 {
			out.ActiveTab = out.Tabs[0].ID
		} else {
			out.ActiveTab = ""
		}
		changed = true
	}
	return out, changed
}

func desktopTabIDPresent(tabs []desktopTabEntry, id string) bool {
	id = strings.TrimSpace(id)
	if id == "" {
		return false
	}
	for _, tab := range tabs {
		if tab.ID == id {
			return true
		}
	}
	return false
}

func recoveredLegacySessionPath(path, legacyDir, currentDir string) (string, bool) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", false
	}
	clean := filepath.Clean(path)
	if info, err := os.Stat(clean); err == nil && info.Mode().IsRegular() && pathWithinDir(clean, currentDir) {
		return clean, true
	}
	rel, err := filepath.Rel(legacyDir, clean)
	if err != nil || rel == "." || rel == ".." || filepath.IsAbs(rel) || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", false
	}
	candidate := filepath.Join(currentDir, rel)
	if info, err := os.Stat(candidate); err == nil && info.Mode().IsRegular() {
		return filepath.Clean(candidate), true
	}
	return "", false
}

func pathWithinDir(path, dir string) bool {
	rel, err := filepath.Rel(dir, path)
	return err == nil && rel != ".." && !filepath.IsAbs(rel) && !strings.HasPrefix(rel, ".."+string(filepath.Separator))
}

func mergeLegacyDesktopProjects(current, legacy desktopProjectFile) desktopProjectFile {
	out := current
	if strings.TrimSpace(out.GlobalTitle) == "" {
		out.GlobalTitle = legacy.GlobalTitle
	}
	if strings.TrimSpace(out.GlobalColor) == "" {
		out.GlobalColor = legacy.GlobalColor
	}
	out.GlobalTopics = uniqueStrings(append(out.GlobalTopics, legacy.GlobalTopics...))
	out.GlobalPinnedTopics = uniqueStrings(append(out.GlobalPinnedTopics, legacy.GlobalPinnedTopics...))
	out.DeletedTopics = uniqueStrings(append(out.DeletedTopics, legacy.DeletedTopics...))
	out.PinnedProjects = uniqueStrings(append(out.PinnedProjects, legacy.PinnedProjects...))
	out.SidebarOrder = uniqueStrings(append(out.SidebarOrder, legacy.SidebarOrder...))
	out.Projects = append(out.Projects, legacy.Projects...)
	return normalizeProjectsFile(out)
}
