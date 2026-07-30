//go:build windows

package main

import (
	"runtime"
	"testing"

	"golang.org/x/sys/windows"
)

func TestDesktopTrayLoopRunsOnLockedOSThread(t *testing.T) {
	loopRan := false
	runDesktopTrayLoop(func() {
		firstThreadID := windows.GetCurrentThreadId()
		for i := 0; i < 100; i++ {
			runtime.Gosched()
		}
		if got := windows.GetCurrentThreadId(); got != firstThreadID {
			t.Fatalf("tray loop moved OS threads: first=%d got=%d", firstThreadID, got)
		}
		loopRan = true
	})
	if !loopRan {
		t.Fatal("tray loop did not run")
	}
}
