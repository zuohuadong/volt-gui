//go:build darwin

package main

import "testing"

func TestDarwinTrayDisabledForWailsBoot(t *testing.T) {
	if traySupported() {
		t.Fatal("darwin tray must stay disabled until it can start on the AppKit main thread")
	}
}
