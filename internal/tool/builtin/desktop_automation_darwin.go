package builtin

import (
	"context"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

func captureDesktopScreenshot(ctx context.Context, path string, display int) error {
	args := []string{"-x"}
	if display > 0 {
		args = append(args, "-D", strconv.Itoa(display))
	}
	args = append(args, path)
	return runAutomationCommand(ctx, "screencapture", args...)
}

func runDesktopMouse(ctx context.Context, p desktopMouseRequest) error {
	if cliclick, err := exec.LookPath("cliclick"); err == nil {
		return runDesktopMouseCliclick(ctx, cliclick, p)
	}
	switch p.Action {
	case "click", "double_click":
		count := "1"
		if p.Action == "double_click" {
			count = "2"
		}
		script := `on run argv
set px to item 1 of argv as integer
set py to item 2 of argv as integer
set n to item 3 of argv as integer
tell application "System Events"
	repeat n times
		click at {px, py}
	end repeat
end tell
end run`
		return runAutomationCommand(ctx, "osascript", "-e", script, strconv.Itoa(p.X), strconv.Itoa(p.Y), count)
	default:
		return fmt.Errorf("desktop_mouse %s on macOS requires cliclick on PATH; click and double_click can use built-in System Events", p.Action)
	}
}

func runDesktopMouseCliclick(ctx context.Context, cliclick string, p desktopMouseRequest) error {
	button := map[string]string{"left": "c", "right": "rc", "middle": "mc"}[p.Button]
	switch p.Action {
	case "move":
		return runAutomationCommand(ctx, cliclick, fmt.Sprintf("m:%d,%d", p.X, p.Y))
	case "click":
		return runAutomationCommand(ctx, cliclick, fmt.Sprintf("%s:%d,%d", button, p.X, p.Y))
	case "double_click":
		return runAutomationCommand(ctx, cliclick, fmt.Sprintf("dc:%d,%d", p.X, p.Y))
	case "drag":
		return runAutomationCommand(ctx, cliclick, fmt.Sprintf("dd:%d,%d", p.X, p.Y), fmt.Sprintf("du:%d,%d", p.ToX, p.ToY))
	case "scroll":
		return runAutomationCommand(ctx, cliclick, fmt.Sprintf("w:%d,%d", p.DeltaX, p.DeltaY))
	default:
		return fmt.Errorf("unsupported mouse action %q", p.Action)
	}
}

func runDesktopKeyboard(ctx context.Context, p desktopKeyboardRequest) error {
	switch p.Action {
	case "type":
		script := `on run argv
tell application "System Events" to keystroke (item 1 of argv)
end run`
		return runAutomationCommand(ctx, "osascript", "-e", script, p.Text)
	case "press":
		key, isCode := darwinKey(p.Key)
		if key == "" {
			return fmt.Errorf("unsupported macOS key %q", p.Key)
		}
		using := darwinModifierList(p.Modifiers)
		var stmt string
		if isCode {
			stmt = "key code " + key
		} else {
			stmt = "keystroke " + strconv.Quote(key)
		}
		if using != "" {
			stmt += " using " + using
		}
		script := `tell application "System Events" to ` + stmt
		return runAutomationCommand(ctx, "osascript", "-e", script)
	default:
		return fmt.Errorf("unsupported keyboard action %q", p.Action)
	}
}

func darwinKey(key string) (string, bool) {
	k := strings.ToLower(strings.TrimSpace(key))
	if len([]rune(k)) == 1 {
		return k, false
	}
	codes := map[string]string{
		"enter": "36", "return": "36", "tab": "48", "space": "49", "escape": "53", "esc": "53",
		"backspace": "51", "delete": "117", "forwarddelete": "117",
		"arrowleft": "123", "left": "123", "arrowright": "124", "right": "124",
		"arrowdown": "125", "down": "125", "arrowup": "126", "up": "126",
		"home": "115", "end": "119", "pagedown": "121", "pageup": "116",
	}
	return codes[k], true
}

func darwinModifierList(mods []string) string {
	out := make([]string, 0, len(mods))
	seen := map[string]bool{}
	for _, mod := range mods {
		switch strings.ToLower(strings.TrimSpace(mod)) {
		case "cmd", "command", "meta":
			if !seen["command down"] {
				out = append(out, "command down")
				seen["command down"] = true
			}
		case "ctrl", "control":
			if !seen["control down"] {
				out = append(out, "control down")
				seen["control down"] = true
			}
		case "shift":
			if !seen["shift down"] {
				out = append(out, "shift down")
				seen["shift down"] = true
			}
		case "alt", "option":
			if !seen["option down"] {
				out = append(out, "option down")
				seen["option down"] = true
			}
		}
	}
	if len(out) == 0 {
		return ""
	}
	return "{" + strings.Join(out, ", ") + "}"
}
