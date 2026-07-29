package builtin

import (
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

func captureDesktopScreenshot(ctx context.Context, path string, display int) error {
	candidates := [][]string{
		{"gnome-screenshot", "-f", path},
		{"spectacle", "-b", "-n", "-o", path},
		{"grim", path},
		{"scrot", path},
		{"import", "-window", "root", path},
	}
	var missing []string
	for _, c := range candidates {
		if _, err := exec.LookPath(c[0]); err != nil {
			missing = append(missing, c[0])
			continue
		}
		if err := runAutomationCommand(ctx, c[0], c[1:]...); err == nil {
			return nil
		}
	}
	return fmt.Errorf("no Linux screenshot backend found or usable; install one of: %s", strings.Join(missing, ", "))
}

func runDesktopMouse(ctx context.Context, p desktopMouseRequest) error {
	if _, err := exec.LookPath("xdotool"); err == nil {
		return runDesktopMouseXdotool(ctx, p)
	}
	return fmt.Errorf("desktop_mouse on Linux requires xdotool on PATH")
}

func runDesktopMouseXdotool(ctx context.Context, p desktopMouseRequest) error {
	button := map[string]string{"left": "1", "middle": "2", "right": "3"}[p.Button]
	switch p.Action {
	case "move":
		return runAutomationCommand(ctx, "xdotool", "mousemove", strconv.Itoa(p.X), strconv.Itoa(p.Y))
	case "click":
		return runAutomationCommand(ctx, "xdotool", "mousemove", strconv.Itoa(p.X), strconv.Itoa(p.Y), "click", button)
	case "double_click":
		return runAutomationCommand(ctx, "xdotool", "mousemove", strconv.Itoa(p.X), strconv.Itoa(p.Y), "click", "--repeat", "2", button)
	case "drag":
		return runAutomationCommand(ctx, "xdotool",
			"mousemove", strconv.Itoa(p.X), strconv.Itoa(p.Y),
			"mousedown", button,
			"mousemove", strconv.Itoa(p.ToX), strconv.Itoa(p.ToY),
			"mouseup", button)
	case "scroll":
		args := []string{}
		if p.DeltaY != 0 {
			button := "4"
			if p.DeltaY < 0 {
				button = "5"
			}
			args = append(args, "click", "--repeat", strconv.Itoa(absInt(p.DeltaY)), button)
		}
		if p.DeltaX != 0 {
			button := "6"
			if p.DeltaX < 0 {
				button = "7"
			}
			args = append(args, "click", "--repeat", strconv.Itoa(absInt(p.DeltaX)), button)
		}
		if len(args) == 0 {
			return nil
		}
		return runAutomationCommand(ctx, "xdotool", args...)
	default:
		return fmt.Errorf("unsupported mouse action %q", p.Action)
	}
}

func runDesktopKeyboard(ctx context.Context, p desktopKeyboardRequest) error {
	if _, err := exec.LookPath("xdotool"); err != nil {
		return fmt.Errorf("desktop_keyboard on Linux requires xdotool on PATH")
	}
	switch p.Action {
	case "type":
		return runAutomationCommand(ctx, "xdotool", "type", "--clearmodifiers", p.Text)
	case "press":
		key := linuxKeyChord(p.Key, p.Modifiers)
		return runAutomationCommand(ctx, "xdotool", "key", "--clearmodifiers", key)
	default:
		return fmt.Errorf("unsupported keyboard action %q", p.Action)
	}
}

func linuxKeyChord(key string, mods []string) string {
	parts := make([]string, 0, len(mods)+1)
	for _, mod := range mods {
		switch strings.ToLower(strings.TrimSpace(mod)) {
		case "ctrl", "control":
			parts = append(parts, "ctrl")
		case "shift":
			parts = append(parts, "shift")
		case "alt", "option":
			parts = append(parts, "alt")
		case "meta", "cmd", "command":
			parts = append(parts, "super")
		}
	}
	parts = append(parts, key)
	return strings.Join(parts, "+")
}

func absInt(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
