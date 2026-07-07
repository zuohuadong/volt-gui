//go:build !darwin && !linux && !windows

package builtin

import (
	"context"
	"fmt"
)

func captureDesktopScreenshot(context.Context, string, int) error {
	return fmt.Errorf("desktop_screenshot is not supported on this platform")
}

func runDesktopMouse(context.Context, desktopMouseRequest) error {
	return fmt.Errorf("desktop_mouse is not supported on this platform")
}

func runDesktopKeyboard(context.Context, desktopKeyboardRequest) error {
	return fmt.Errorf("desktop_keyboard is not supported on this platform")
}
