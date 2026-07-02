//go:build windows

package main

import "testing"

func TestWindowsDesktopTrayLoopEntryPoint(t *testing.T) {
	var start func(func(), func()) func() = startDesktopTray
	if start == nil {
		t.Fatal("startDesktopTray must be available on Windows")
	}
}
