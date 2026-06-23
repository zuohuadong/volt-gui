package main

import (
	"os"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/options"
)

func singleInstanceLock(app *App) *options.SingleInstanceLock {
	if isDesktopDevMode() {
		return nil
	}
	return &options.SingleInstanceLock{
		UniqueId: singleInstanceID(),
		OnSecondInstanceLaunch: func(options.SecondInstanceData) {
			app.secondInstanceLaunch()
		},
	}
}

func isDesktopDevMode() bool {
	switch strings.ToLower(strings.TrimSpace(os.Getenv("VOLTUI_DEV"))) {
	case "1", "true", "yes", "on":
		return true
	}
	switch strings.ToLower(strings.TrimSpace(os.Getenv("REASONIX_DEV"))) {
	case "1", "true", "yes", "on":
		return true
	default:
		return false
	}
}
