package main

import (
	"context"
	"os"
	"testing"

	"voltui/internal/config"
)

func TestBeforeClosePersistsWindowStateBeforeNativeWindowCloses(t *testing.T) {
	isolateDesktopUserDirs(t)
	cfg := config.Default()
	if err := cfg.SetDesktopCloseBehavior("quit"); err != nil {
		t.Fatal(err)
	}
	if err := cfg.SaveTo(config.UserConfigPath()); err != nil {
		t.Fatal(err)
	}

	want := DesktopWindowState{Width: 1280, Height: 800, X: 120, Y: 80, Maximised: true}
	app := NewApp()
	app.windowStateSnapshotHook = func(context.Context) DesktopWindowState { return want }
	if prevent := app.beforeClose(context.Background()); prevent {
		t.Fatal("quit close must not be prevented")
	}
	got, ok := loadWindowState()
	if !ok || got != want {
		t.Fatalf("saved window state = (%+v, %v), want (%+v, true)", got, ok, want)
	}
}

func TestShutdownDoesNotReadDestroyedNativeWindow(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()
	app.ctx = context.Background()
	app.windowStateSnapshotHook = func(context.Context) DesktopWindowState {
		t.Fatal("OnShutdown must not query the destroyed native window")
		return DesktopWindowState{}
	}
	app.shutdown(context.Background())
}

func TestShutdownForUpdateCapturesWindowBeforeCleanup(t *testing.T) {
	isolateDesktopUserDirs(t)
	want := DesktopWindowState{Width: 1440, Height: 900, X: 40, Y: 60}
	app := NewApp()
	app.ctx = context.Background()
	captures := 0
	app.windowStateSnapshotHook = func(context.Context) DesktopWindowState {
		captures++
		return want
	}
	app.shutdownForUpdate()
	got, ok := loadWindowState()
	if captures != 1 || !ok || got != want {
		t.Fatalf("update shutdown capture = (%d, %+v, %v), want (1, %+v, true)", captures, got, ok, want)
	}
}

func TestWindowStateCaptureRecoversUnavailableNativeWindow(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()
	app.windowStateSnapshotHook = func(context.Context) DesktopWindowState {
		panic("native window already closed")
	}
	app.saveWindowStateSync(context.Background())
	if _, err := os.Stat(windowStatePath()); !os.IsNotExist(err) {
		t.Fatalf("window state file after failed capture: %v", err)
	}
}
