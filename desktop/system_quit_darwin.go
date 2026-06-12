//go:build darwin

package main

/*
#cgo darwin LDFLAGS: -framework Cocoa
void installVoltUISystemQuitHook(void);
*/
import "C"

import "sync"

var installSystemQuitHookOnce sync.Once

func installSystemQuitHook() {
	installSystemQuitHookOnce.Do(func() {
		C.installVoltUISystemQuitHook()
	})
}

//export VoltUIMarkSystemQuit
func VoltUIMarkSystemQuit() {
	markSystemQuitRequested()
}
