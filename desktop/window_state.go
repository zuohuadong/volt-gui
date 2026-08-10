package main

import (
	"context"
	"encoding/json"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"voltui/internal/config"
)

// DesktopWindowState captures the window geometry to restore across launches.
type DesktopWindowState struct {
	Width     int  `json:"width"`
	Height    int  `json:"height"`
	X         int  `json:"x"`
	Y         int  `json:"y"`
	Maximised bool `json:"maximised"`
}

func windowStatePath() string {
	return filepath.Join(config.MemoryUserDir(), "desktop-window.json")
}

// loadWindowState reads the saved window geometry. The second return value is
// false when no saved state exists (first launch, missing file, corrupt JSON).
// Callers must not restore position when ok is false — zero values are not a
// valid window origin.
func loadWindowState() (DesktopWindowState, bool) {
	path := windowStatePath()
	data, err := os.ReadFile(path)
	if err != nil {
		return DesktopWindowState{}, false
	}
	var s DesktopWindowState
	if err := json.Unmarshal(data, &s); err != nil {
		return DesktopWindowState{}, false
	}
	if s.Width < 400 {
		s.Width = 0
	}
	if s.Height < 300 {
		s.Height = 0
	}
	// Migration guard: the previous version saved (0,0) for first-launch zero
	// values. Treat an all-zero valid file the same as missing — let domReady
	// center the window instead of parking it at the screen origin.
	if s.Width == 0 && s.Height == 0 && s.X == 0 && s.Y == 0 {
		return DesktopWindowState{}, false
	}
	return s, true
}

// SaveWindowState is the bound method the frontend calls to persist the current
// window geometry before quit and periodically during use.
func (a *App) SaveWindowState(state DesktopWindowState) error {
	path := windowStatePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.Marshal(state)
	if err != nil {
		return err
	}
	return os.WriteFile(path, data, 0o644)
}

// saveWindowStateSync persists the geometry while Wails still owns a valid
// native window. OnShutdown is too late because Wails destroys the window first.
func (a *App) saveWindowStateSync(ctx context.Context) {
	if ctx == nil {
		return
	}
	state, ok := a.currentWindowState(ctx)
	if !ok {
		return
	}
	if err := a.SaveWindowState(state); err != nil {
		slog.Warn("desktop: save window state failed", "err", err)
	}
}

func (a *App) currentWindowState(ctx context.Context) (state DesktopWindowState, ok bool) {
	defer func() {
		if recover() != nil {
			slog.Warn("desktop: skipped window state capture because native window is unavailable")
			ok = false
		}
	}()
	if a.windowStateSnapshotHook != nil {
		return a.windowStateSnapshotHook(ctx), true
	}
	w, h := runtime.WindowGetSize(ctx)
	x, y := runtime.WindowGetPosition(ctx)
	return DesktopWindowState{
		Width:     w,
		Height:    h,
		X:         x,
		Y:         y,
		Maximised: runtime.WindowIsMaximised(ctx),
	}, true
}
