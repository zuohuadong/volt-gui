package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"voltui/internal/fileutil"
)

const (
	desktopWorkbenchStateFile = "desktop-workbench-state.json"
	maxDesktopWorkbenchState  = 2 << 20
)

func desktopWorkbenchStatePath() string {
	dir := desktopConfigDir()
	if strings.TrimSpace(dir) == "" {
		return ""
	}
	return filepath.Join(dir, desktopWorkbenchStateFile)
}

// LoadDesktopWorkbenchState returns the versioned sidebar snapshot persisted by
// the desktop backend. The frontend may still use localStorage as a fast cache,
// but this file survives WebView data cleanup and reinstall flows.
func (a *App) LoadDesktopWorkbenchState() (string, error) {
	path := desktopWorkbenchStatePath()
	if path == "" {
		return "", nil
	}
	b, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return "", nil
	}
	if err != nil {
		return "", err
	}
	if len(b) > maxDesktopWorkbenchState {
		return "", fmt.Errorf("desktop workbench state exceeds %d bytes", maxDesktopWorkbenchState)
	}
	sanitized, err := sanitizeDesktopWorkbenchState(strings.TrimSpace(string(b)))
	if err != nil {
		return "", err
	}
	return string(sanitized), nil
}

// SaveDesktopWorkbenchState atomically persists the sidebar/workbench index.
// The payload is intentionally opaque here; the frontend sanitizes transcript
// bodies before sending it so the backend stores only navigation metadata.
func (a *App) SaveDesktopWorkbenchState(raw string) error {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	if len(raw) > maxDesktopWorkbenchState {
		return fmt.Errorf("desktop workbench state exceeds %d bytes", maxDesktopWorkbenchState)
	}
	sanitized, err := sanitizeDesktopWorkbenchState(raw)
	if err != nil {
		return err
	}
	path := desktopWorkbenchStatePath()
	if path == "" {
		return errors.New("desktop config dir is unavailable")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".desktop-workbench-state-*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(append(sanitized, '\n')); err != nil {
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

func sanitizeDesktopWorkbenchState(raw string) ([]byte, error) {
	var snapshot map[string]any
	if err := json.Unmarshal([]byte(raw), &snapshot); err != nil {
		return nil, errors.New("desktop workbench state must be valid JSON")
	}
	if version, ok := snapshot["version"].(float64); !ok || version != 2 {
		return nil, errors.New("desktop workbench state version must be 2")
	}
	stripTranscripts := func(value any) {
		tasks, _ := value.([]any)
		for _, item := range tasks {
			if task, ok := item.(map[string]any); ok {
				delete(task, "transcript")
			}
		}
	}
	stripTranscripts(snapshot["inboxTasks"])
	if projects, ok := snapshot["projectTasks"].([]any); ok {
		for _, item := range projects {
			if project, ok := item.(map[string]any); ok {
				stripTranscripts(project["tasks"])
			}
		}
	}
	b, err := json.Marshal(snapshot)
	if err != nil {
		return nil, err
	}
	if len(b) > maxDesktopWorkbenchState {
		return nil, fmt.Errorf("desktop workbench state exceeds %d bytes", maxDesktopWorkbenchState)
	}
	return b, nil
}
