package builtin

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"voltui/internal/tool"
)

func init() {
	tool.RegisterBuiltin(desktopScreenshot{})
	tool.RegisterBuiltin(desktopMouse{})
	tool.RegisterBuiltin(desktopKeyboard{})
}

type desktopScreenshot struct {
	roots   []string
	workDir string
}

func (desktopScreenshot) Name() string { return "desktop_screenshot" }

func (desktopScreenshot) Description() string {
	return "Capture a desktop screenshot to a PNG file. This is a privacy-sensitive host capability and may require OS screen-recording permission."
}

func (desktopScreenshot) Schema() json.RawMessage {
	return json.RawMessage(`{
"type":"object",
"properties":{
  "path":{"type":"string","description":"PNG output path. Defaults to a temporary VoltUI screenshot file."},
  "display":{"type":"integer","description":"Optional display index for platforms that support targeting a monitor. 0 means primary/default.","default":0}
}
}`)
}

func (desktopScreenshot) ReadOnly() bool { return false }

func (d desktopScreenshot) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	var p struct {
		Path    string `json:"path"`
		Display int    `json:"display"`
	}
	if len(args) > 0 {
		if err := json.Unmarshal(args, &p); err != nil {
			return "", fmt.Errorf("invalid args: %w", err)
		}
	}
	path, err := resolveAutomationOutputPath(p.Path, "desktop-screenshot", d.roots, d.workDir)
	if err != nil {
		return "", err
	}
	if err := captureDesktopScreenshot(ctx, path, p.Display); err != nil {
		return "", err
	}
	return fmt.Sprintf("screenshot saved to %s", path), nil
}

type desktopMouse struct{}

func (desktopMouse) Name() string { return "desktop_mouse" }

func (desktopMouse) Description() string {
	return "Control the desktop mouse: move, click, double-click, drag, or scroll. Requires OS accessibility/input-control permission on some platforms."
}

func (desktopMouse) Schema() json.RawMessage {
	return json.RawMessage(`{
"type":"object",
"properties":{
  "action":{"type":"string","enum":["move","click","double_click","drag","scroll"],"description":"Mouse action to perform."},
  "x":{"type":"integer","description":"Screen X coordinate for move/click/drag start."},
  "y":{"type":"integer","description":"Screen Y coordinate for move/click/drag start."},
  "to_x":{"type":"integer","description":"Drag destination X coordinate."},
  "to_y":{"type":"integer","description":"Drag destination Y coordinate."},
  "button":{"type":"string","enum":["left","right","middle"],"description":"Mouse button for click/drag.","default":"left"},
  "delta_x":{"type":"integer","description":"Horizontal scroll delta, when supported.","default":0},
  "delta_y":{"type":"integer","description":"Vertical scroll delta. Positive values scroll up on most backends.","default":0}
},
"required":["action"]
}`)
}

func (desktopMouse) ReadOnly() bool { return false }

func (desktopMouse) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	var p desktopMouseRequest
	if err := json.Unmarshal(args, &p); err != nil {
		return "", fmt.Errorf("invalid args: %w", err)
	}
	p.Action = strings.ToLower(strings.TrimSpace(p.Action))
	p.Button = strings.ToLower(strings.TrimSpace(p.Button))
	if p.Button == "" {
		p.Button = "left"
	}
	switch p.Action {
	case "move", "click", "double_click", "drag", "scroll":
	default:
		return "", fmt.Errorf("action must be move, click, double_click, drag, or scroll")
	}
	switch p.Button {
	case "left", "right", "middle":
	default:
		return "", fmt.Errorf("button must be left, right, or middle")
	}
	if err := runDesktopMouse(ctx, p); err != nil {
		return "", err
	}
	return fmt.Sprintf("desktop mouse %s completed", p.Action), nil
}

type desktopMouseRequest struct {
	Action string `json:"action"`
	X      int    `json:"x"`
	Y      int    `json:"y"`
	ToX    int    `json:"to_x"`
	ToY    int    `json:"to_y"`
	Button string `json:"button"`
	DeltaX int    `json:"delta_x"`
	DeltaY int    `json:"delta_y"`
}

type desktopKeyboard struct{}

func (desktopKeyboard) Name() string { return "desktop_keyboard" }

func (desktopKeyboard) Description() string {
	return "Control the desktop keyboard by typing text or pressing a key chord. Requires OS accessibility/input-control permission on some platforms."
}

func (desktopKeyboard) Schema() json.RawMessage {
	return json.RawMessage(`{
"type":"object",
"properties":{
  "action":{"type":"string","enum":["type","press"],"description":"Keyboard action to perform."},
  "text":{"type":"string","description":"Text to type for action=type."},
  "key":{"type":"string","description":"Key to press for action=press, for example Enter, Tab, Escape, Backspace, ArrowLeft, A."},
  "modifiers":{"type":"array","items":{"type":"string","enum":["ctrl","control","shift","alt","option","meta","cmd","command"]},"description":"Optional modifiers for action=press."}
},
"required":["action"]
}`)
}

func (desktopKeyboard) ReadOnly() bool { return false }

func (desktopKeyboard) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	var p desktopKeyboardRequest
	if err := json.Unmarshal(args, &p); err != nil {
		return "", fmt.Errorf("invalid args: %w", err)
	}
	p.Action = strings.ToLower(strings.TrimSpace(p.Action))
	switch p.Action {
	case "type":
		if p.Text == "" {
			return "", fmt.Errorf("text is required for action=type")
		}
		if len([]rune(p.Text)) > 4000 {
			return "", fmt.Errorf("text is too long: max 4000 runes")
		}
	case "press":
		p.Key = strings.TrimSpace(p.Key)
		if p.Key == "" {
			return "", fmt.Errorf("key is required for action=press")
		}
	default:
		return "", fmt.Errorf("action must be type or press")
	}
	if err := runDesktopKeyboard(ctx, p); err != nil {
		return "", err
	}
	return fmt.Sprintf("desktop keyboard %s completed", p.Action), nil
}

type desktopKeyboardRequest struct {
	Action    string   `json:"action"`
	Text      string   `json:"text"`
	Key       string   `json:"key"`
	Modifiers []string `json:"modifiers"`
}

func defaultAutomationArtifactPath(prefix, ext string) string {
	name := fmt.Sprintf("%s-%s%s", prefix, time.Now().UTC().Format("20060102T150405.000000000Z"), ext)
	return filepath.Join(os.TempDir(), "voltui-automation", name)
}

func resolveAutomationOutputPath(path, prefix string, roots []string, workDir string) (string, error) {
	path = strings.TrimSpace(path)
	userProvided := path != ""
	if !userProvided {
		path = defaultAutomationArtifactPath(prefix, ".png")
	} else {
		path = resolveIn(workDir, path)
	}
	return prepareAutomationOutputPath(path, roots, userProvided)
}

func prepareAutomationOutputPath(path string, roots []string, userProvided bool) (string, error) {
	if !filepath.IsAbs(path) {
		abs, err := filepath.Abs(path)
		if err != nil {
			return "", err
		}
		path = abs
	}
	if strings.ToLower(filepath.Ext(path)) != ".png" {
		return "", fmt.Errorf("path must end in .png")
	}
	if userProvided {
		if err := confine(roots, path); err != nil {
			return "", err
		}
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", fmt.Errorf("create output directory: %w", err)
	}
	return path, nil
}

func runAutomationCommand(ctx context.Context, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		msg := strings.TrimSpace(string(out))
		if msg == "" {
			msg = err.Error()
		}
		return fmt.Errorf("%s failed: %s", name, msg)
	}
	return nil
}
