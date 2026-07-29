package builtin

import (
	"context"
	"fmt"
	"strconv"
	"strings"
)

func captureDesktopScreenshot(ctx context.Context, path string, display int) error {
	script := `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$path = $args[0]
$idx = [int]$args[1]
$screens = [System.Windows.Forms.Screen]::AllScreens
if ($idx -lt 0 -or $idx -ge $screens.Length) { $idx = 0 }
$bounds = $screens[$idx].Bounds
$bmp = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
try {
  $gfx.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
} finally {
  $gfx.Dispose()
  $bmp.Dispose()
}`
	return runPowerShell(ctx, script, path, strconv.Itoa(display))
}

func runDesktopMouse(ctx context.Context, p desktopMouseRequest) error {
	script := `
$sig = @'
using System;
using System.Runtime.InteropServices;
public static class Mouse {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint flags, uint dx, uint dy, int data, UIntPtr extraInfo);
}
'@
Add-Type -TypeDefinition $sig
$action = $args[0]
$x = [int]$args[1]; $y = [int]$args[2]
$tx = [int]$args[3]; $ty = [int]$args[4]
$button = $args[5]
$dx = [int]$args[6]; $dy = [int]$args[7]
$down = 0x0002; $up = 0x0004
if ($button -eq "right") { $down = 0x0008; $up = 0x0010 }
elseif ($button -eq "middle") { $down = 0x0020; $up = 0x0040 }
if ($action -eq "move") {
  [Mouse]::SetCursorPos($x, $y) | Out-Null
} elseif ($action -eq "click" -or $action -eq "double_click") {
  [Mouse]::SetCursorPos($x, $y) | Out-Null
  $count = 1; if ($action -eq "double_click") { $count = 2 }
  for ($i = 0; $i -lt $count; $i++) {
    [Mouse]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
    [Mouse]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
  }
} elseif ($action -eq "drag") {
  [Mouse]::SetCursorPos($x, $y) | Out-Null
  [Mouse]::mouse_event($down, 0, 0, 0, [UIntPtr]::Zero)
  Start-Sleep -Milliseconds 80
  [Mouse]::SetCursorPos($tx, $ty) | Out-Null
  Start-Sleep -Milliseconds 80
  [Mouse]::mouse_event($up, 0, 0, 0, [UIntPtr]::Zero)
} elseif ($action -eq "scroll") {
  if ($dy -ne 0) { [Mouse]::mouse_event(0x0800, 0, 0, [int]($dy * 120), [UIntPtr]::Zero) }
  if ($dx -ne 0) { [Mouse]::mouse_event(0x01000, 0, 0, [int]($dx * 120), [UIntPtr]::Zero) }
}`
	return runPowerShell(ctx, script, p.Action, strconv.Itoa(p.X), strconv.Itoa(p.Y), strconv.Itoa(p.ToX), strconv.Itoa(p.ToY), p.Button, strconv.Itoa(p.DeltaX), strconv.Itoa(p.DeltaY))
}

func runDesktopKeyboard(ctx context.Context, p desktopKeyboardRequest) error {
	script := `
Add-Type -AssemblyName System.Windows.Forms
$action = $args[0]
if ($action -eq "type") {
  [System.Windows.Forms.SendKeys]::SendWait($args[1])
} else {
  [System.Windows.Forms.SendKeys]::SendWait($args[2] + $args[1])
}`
	switch p.Action {
	case "type":
		return runPowerShell(ctx, script, "type", windowsSendKeysEscape(p.Text), "")
	case "press":
		key := windowsSendKeyName(p.Key)
		if key == "" {
			return fmt.Errorf("unsupported Windows key %q", p.Key)
		}
		return runPowerShell(ctx, script, "press", key, windowsModifierPrefix(p.Modifiers))
	default:
		return fmt.Errorf("unsupported keyboard action %q", p.Action)
	}
}

func runPowerShell(ctx context.Context, script string, args ...string) error {
	ps := "powershell.exe"
	cmdArgs := []string{"-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script}
	cmdArgs = append(cmdArgs, args...)
	return runAutomationCommand(ctx, ps, cmdArgs...)
}

func windowsModifierPrefix(mods []string) string {
	var b strings.Builder
	seen := map[rune]bool{}
	for _, mod := range mods {
		var r rune
		switch strings.ToLower(strings.TrimSpace(mod)) {
		case "ctrl", "control":
			r = '^'
		case "shift":
			r = '+'
		case "alt", "option":
			r = '%'
		case "meta", "cmd", "command":
			r = '^'
		}
		if r != 0 && !seen[r] {
			b.WriteRune(r)
			seen[r] = true
		}
	}
	return b.String()
}

func windowsSendKeyName(key string) string {
	k := strings.ToLower(strings.TrimSpace(key))
	if len([]rune(k)) == 1 {
		return strings.ToUpper(k)
	}
	names := map[string]string{
		"enter": "{ENTER}", "return": "{ENTER}", "tab": "{TAB}", "space": " ", "escape": "{ESC}", "esc": "{ESC}",
		"backspace": "{BACKSPACE}", "delete": "{DELETE}",
		"arrowleft": "{LEFT}", "left": "{LEFT}", "arrowright": "{RIGHT}", "right": "{RIGHT}",
		"arrowup": "{UP}", "up": "{UP}", "arrowdown": "{DOWN}", "down": "{DOWN}",
		"home": "{HOME}", "end": "{END}", "pageup": "{PGUP}", "pagedown": "{PGDN}",
	}
	return names[k]
}

func windowsSendKeysEscape(s string) string {
	replacer := strings.NewReplacer(
		"{", "{{}", "}", "{}}",
		"+", "{+}", "^", "{^}", "%", "{%}", "~", "{~}",
		"(", "{(}", ")", "{)}", "[", "{[}", "]", "{]}",
	)
	return replacer.Replace(s)
}
