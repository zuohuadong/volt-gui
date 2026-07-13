package builtin

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/gorilla/websocket"

	"voltui/internal/browserauth"
	"voltui/internal/tool"
)

func init() { tool.RegisterBuiltin(browserControl{}) }

type browserControl struct {
	roots   []string
	workDir string
}

func (browserControl) Name() string { return "browser_control" }

func (browserControl) Description() string {
	return "Run a Playwright-like browser automation sequence through Chrome DevTools Protocol: open a page, click coordinates or selectors, type text, press keys, wait, and optionally save a screenshot. Uses an installed Chromium/Chrome/Edge browser or VOLTUI_BROWSER_PATH."
}

func (browserControl) Schema() json.RawMessage {
	return json.RawMessage(`{
"type":"object",
"properties":{
  "url":{"type":"string","description":"Optional absolute URL beginning with http:// or https://. Defaults to about:blank."},
  "headless":{"type":"boolean","description":"Run the browser headlessly. Default true.","default":true},
  "wait":{"type":"integer","description":"Additional milliseconds to wait before returning visible text (default 0, max 10000).","default":0},
  "login":{"type":"object","description":"Securely request credentials from the user or OS keyring and fill the login form. Credentials are never tool arguments.","properties":{
    "username_selector":{"type":"string","description":"CSS selector for the username field."},
    "password_selector":{"type":"string","description":"CSS selector for the password field."},
    "submit_selector":{"type":"string","description":"CSS selector for the login submit control."},
    "verification":{"type":"string","enum":["auto","always","never"],"description":"Pause for manual CAPTCHA/MFA completion automatically, always, or never.","default":"auto"},
    "post_submit_wait_ms":{"type":"integer","description":"Milliseconds to wait after submit before verification detection (default 1000, max 10000).","default":1000}
  },"required":["username_selector","password_selector","submit_selector"]},
  "actions":{"type":"array","description":"Ordered browser actions.","items":{"type":"object","properties":{
    "type":{"type":"string","enum":["click","type","press","wait","screenshot"],"description":"Action type."},
    "selector":{"type":"string","description":"CSS selector for click. If omitted, x/y coordinates are used."},
    "x":{"type":"number","description":"Viewport X coordinate for click."},
    "y":{"type":"number","description":"Viewport Y coordinate for click."},
    "text":{"type":"string","description":"Text for type action."},
    "key":{"type":"string","description":"Key for press action, for example Enter, Tab, Escape, ArrowLeft."},
    "ms":{"type":"integer","description":"Milliseconds for wait action, max 10000."},
    "path":{"type":"string","description":"PNG output path for screenshot action."}
  },"required":["type"]}},
  "screenshot_path":{"type":"string","description":"Optional PNG output path captured after all actions."}
}
}`)
}

func (browserControl) ReadOnly() bool { return false }

func (b browserControl) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	var p browserControlRequest
	if err := json.Unmarshal(args, &p); err != nil {
		return "", fmt.Errorf("invalid args: %w", err)
	}
	if p.Wait < 0 {
		p.Wait = 0
	}
	if p.Wait > 10000 {
		p.Wait = 10000
	}
	if p.URL != "" {
		u, err := url.Parse(p.URL)
		if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
			return "", fmt.Errorf("url must be an absolute http(s) address")
		}
	}
	var interaction tool.BrowserInteractionProvider
	if p.Login != nil {
		provider, ok := tool.BrowserInteractionProviderFrom(ctx)
		if !ok {
			return "", fmt.Errorf("interactive browser login requires a user-facing credential provider")
		}
		interaction = provider
		if err := p.Login.validate(); err != nil {
			return "", err
		}
	}
	bin, err := findBrowserBin()
	if err != nil {
		return fmt.Sprintf("(no browser found: %s - install Chromium or set VOLTUI_BROWSER_PATH)", err), nil
	}

	browserMu.Lock()
	defer browserMu.Unlock()

	return runBrowserControl(ctx, bin, p, b.roots, b.workDir, interaction)
}

type browserControlRequest struct {
	URL            string                 `json:"url"`
	Headless       *bool                  `json:"headless"`
	Wait           int                    `json:"wait"`
	Login          *browserLoginRequest   `json:"login"`
	Actions        []browserControlAction `json:"actions"`
	ScreenshotPath string                 `json:"screenshot_path"`
}

type browserLoginRequest struct {
	UsernameSelector string `json:"username_selector"`
	PasswordSelector string `json:"password_selector"`
	SubmitSelector   string `json:"submit_selector"`
	Verification     string `json:"verification"`
	PostSubmitWaitMS int    `json:"post_submit_wait_ms"`
}

func (r *browserLoginRequest) validate() error {
	if r == nil {
		return nil
	}
	if strings.TrimSpace(r.UsernameSelector) == "" || strings.TrimSpace(r.PasswordSelector) == "" || strings.TrimSpace(r.SubmitSelector) == "" {
		return fmt.Errorf("browser login requires username_selector, password_selector, and submit_selector")
	}
	switch strings.ToLower(strings.TrimSpace(r.Verification)) {
	case "", "auto":
		r.Verification = "auto"
	case "always", "never":
		r.Verification = strings.ToLower(strings.TrimSpace(r.Verification))
	default:
		return fmt.Errorf("browser login verification must be auto, always, or never")
	}
	if r.PostSubmitWaitMS <= 0 {
		r.PostSubmitWaitMS = 1000
	}
	if r.PostSubmitWaitMS > 10000 {
		r.PostSubmitWaitMS = 10000
	}
	return nil
}

type browserControlAction struct {
	Type     string  `json:"type"`
	Selector string  `json:"selector"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Text     string  `json:"text"`
	Key      string  `json:"key"`
	MS       int     `json:"ms"`
	Path     string  `json:"path"`
}

func runBrowserControl(ctx context.Context, bin string, req browserControlRequest, roots []string, workDir string, interaction tool.BrowserInteractionProvider) (string, error) {
	timeout := browserTimeout + 30*time.Second
	if req.Login != nil {
		timeout = 10 * time.Minute
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	headless := true
	if req.Headless != nil {
		headless = *req.Headless
	}
	if req.Login != nil && req.Login.Verification != "never" {
		headless = false
	}
	profileDir, err := os.MkdirTemp("", "voltui-browser-profile-*")
	if err != nil {
		return "", fmt.Errorf("browser_control: create isolated browser profile: %w", err)
	}
	defer os.RemoveAll(profileDir)
	launchArgs := browserLaunchArgs(headless)
	launchArgs = append(launchArgs[:len(launchArgs)-1], "--user-data-dir="+profileDir, launchArgs[len(launchArgs)-1])
	cmd := exec.CommandContext(ctx, bin, launchArgs...)
	cmd.Env = append(os.Environ(),
		"QT_QPA_PLATFORM=offscreen",
		"CHROME_CRASHPAD_PIPE=",
	)

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("browser_control: stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("browser_control: start browser: %w", err)
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	}()

	debugURL, err := readDevToolsURL(ctx, stderr)
	if err != nil {
		return "", fmt.Errorf("browser_control: detect DevTools endpoint: %w", err)
	}
	pageWSURL, err := fetchPageWebSocketURL(ctx, debugURL)
	if err != nil {
		return "", fmt.Errorf("browser_control: page websocket URL: %w", err)
	}
	conn, _, err := websocket.DefaultDialer.DialContext(ctx, pageWSURL, nil)
	if err != nil {
		return "", fmt.Errorf("browser_control: CDP connect: %w", err)
	}
	defer conn.Close()
	conn.SetReadLimit(10 << 20)

	client := cdpClient{conn: conn}
	if _, err := client.send(ctx, "Page.enable", nil); err != nil {
		return "", err
	}
	if _, err := client.send(ctx, "Runtime.enable", nil); err != nil {
		return "", err
	}
	targetURL := req.URL
	if targetURL == "" {
		targetURL = "about:blank"
	}
	if _, err := client.send(ctx, "Page.navigate", map[string]any{"url": targetURL}); err != nil {
		return "", err
	}
	if _, err := client.evaluateText(ctx, 0); err != nil {
		return "", err
	}
	secret := ""
	if req.Login != nil {
		origin, err := browserauth.NormalizeOrigin(targetURL)
		if err != nil {
			return "", err
		}
		credential, err := interaction.RequestBrowserCredential(ctx, tool.BrowserCredentialRequest{
			Origin: origin,
			URL:    targetURL,
			Reason: "该浏览器自动化需要登录；凭据仅通过本机安全通道提供。",
		})
		if err != nil {
			return "", fmt.Errorf("browser_control: credential request failed")
		}
		secret = credential.Password
		if err := performBrowserLogin(ctx, &client, *req.Login, credential); err != nil {
			return "", fmt.Errorf("browser_control: login failed: %w", err)
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(time.Duration(req.Login.PostSubmitWaitMS) * time.Millisecond):
		}
		needsVerification := req.Login.Verification == "always"
		reason := "需要用户完成验证码、扫码或 MFA"
		if req.Login.Verification == "auto" {
			signals, signalErr := collectBrowserVerificationSignals(ctx, &client)
			if signalErr == nil {
				needsVerification, reason = detectBrowserVerification(signals)
			}
		}
		if needsVerification {
			continued, err := interaction.WaitBrowserVerification(ctx, tool.BrowserVerificationRequest{Origin: origin, URL: targetURL, Reason: reason})
			if err != nil || !continued {
				return "", fmt.Errorf("browser_control: browser verification cancelled")
			}
		}
	}

	var saved []string
	for i, action := range req.Actions {
		path, err := client.runBrowserAction(ctx, i, action, roots, workDir)
		if err != nil {
			return "", err
		}
		if strings.ToLower(strings.TrimSpace(action.Type)) == "screenshot" {
			saved = append(saved, path)
		}
	}
	if req.ScreenshotPath != "" {
		path, err := resolveAutomationOutputPath(req.ScreenshotPath, "browser-control", roots, workDir)
		if err != nil {
			return "", err
		}
		if err := client.captureBrowserScreenshot(ctx, path); err != nil {
			return "", err
		}
		saved = append(saved, path)
	}

	text, err := client.evaluateText(ctx, req.Wait)
	if err != nil {
		return "", err
	}
	text = strings.TrimSpace(text)
	if text == "" {
		text = "(empty page - no visible text after browser_control)"
	}
	if len(text) > browserMaxText {
		text = text[:browserMaxText] + "\n... (truncated)"
	}
	if len(saved) > 0 {
		text += "\n\nScreenshots: " + strings.Join(saved, ", ")
	}
	return redactBrowserSecret(text, secret), nil
}

type browserValueEvaluator interface {
	evaluateValue(context.Context, string) (json.RawMessage, error)
}

func performBrowserLogin(ctx context.Context, evaluator browserValueEvaluator, login browserLoginRequest, credential tool.BrowserCredential) error {
	selectors, _ := json.Marshal(map[string]string{
		"username": login.UsernameSelector,
		"password": login.PasswordSelector,
		"submit":   login.SubmitSelector,
	})
	values, _ := json.Marshal(map[string]string{"username": credential.Username, "password": credential.Password})
	expr := fmt.Sprintf(`(() => {
  const selectors = %s;
  const values = %s;
  const username = document.querySelector(selectors.username);
  const password = document.querySelector(selectors.password);
  const submit = document.querySelector(selectors.submit);
  if (!username || !password || !submit) return {ok:false, error:"login form selector not found"};
  const setValue = (element, value) => {
    const proto = Object.getPrototypeOf(element);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(element, value); else element.value = value;
    element.dispatchEvent(new Event("input", {bubbles:true}));
    element.dispatchEvent(new Event("change", {bubbles:true}));
  };
  setValue(username, values.username);
  setValue(password, values.password);
  submit.click();
  return {ok:true};
})()`, string(selectors), string(values))
	raw, err := evaluator.evaluateValue(ctx, expr)
	if err != nil {
		return errors.New(redactBrowserSecret(err.Error(), credential.Password))
	}
	var result struct {
		OK    bool   `json:"ok"`
		Error string `json:"error"`
	}
	if err := json.Unmarshal(raw, &result); err != nil {
		return fmt.Errorf("parse browser login result")
	}
	if !result.OK {
		return errors.New(redactBrowserSecret(result.Error, credential.Password))
	}
	return nil
}

func redactBrowserSecret(value, secret string) string {
	if secret == "" {
		return value
	}
	return strings.ReplaceAll(value, secret, "[REDACTED]")
}

type browserVerificationSignals struct {
	VisibleText string   `json:"visibleText"`
	Attributes  []string `json:"attributes"`
}

func collectBrowserVerificationSignals(ctx context.Context, evaluator browserValueEvaluator) (browserVerificationSignals, error) {
	raw, err := evaluator.evaluateValue(ctx, `(() => ({
  visibleText: document.body ? document.body.innerText.slice(0, 20000) : "",
  attributes: Array.from(document.querySelectorAll("input, iframe, [id], [class]"), (element) => [
    element.getAttribute("autocomplete"), element.getAttribute("name"), element.getAttribute("id"),
    element.getAttribute("class"), element.getAttribute("src"), element.getAttribute("title")
  ].filter(Boolean).join(" ")).filter(Boolean).slice(0, 500)
}))()`)
	if err != nil {
		return browserVerificationSignals{}, err
	}
	var signals browserVerificationSignals
	if err := json.Unmarshal(raw, &signals); err != nil {
		return browserVerificationSignals{}, fmt.Errorf("parse browser verification signals")
	}
	return signals, nil
}

func detectBrowserVerification(signals browserVerificationSignals) (bool, string) {
	haystack := strings.ToLower(signals.VisibleText + " " + strings.Join(signals.Attributes, " "))
	checks := []struct {
		needle string
		reason string
	}{
		{"one-time-code", "检测到一次性验证码输入"},
		{"captcha", "检测到验证码"},
		{"recaptcha", "检测到验证码"},
		{"hcaptcha", "检测到验证码"},
		{"mfa", "检测到 MFA 验证"},
		{"otp", "检测到一次性验证码"},
		{"two-factor", "检测到二次验证"},
		{"2fa", "检测到二次验证"},
		{"verification code", "检测到验证码"},
		{"验证码", "检测到验证码"},
		{"扫码", "检测到扫码验证"},
		{"二维码", "检测到扫码验证"},
		{"二次验证", "检测到二次验证"},
	}
	for _, check := range checks {
		if strings.Contains(haystack, check.needle) {
			return true, check.reason
		}
	}
	return false, ""
}

func browserLaunchArgs(headless bool) []string {
	args := []string{
		"--no-sandbox",
		"--disable-gpu",
		"--disable-extensions",
		"--disable-background-networking",
		"--disable-sync",
		"--no-first-run",
		"--disable-default-apps",
		"--disable-translate",
		"--mute-audio",
		"--disable-component-extensions-with-background-pages",
		"--disable-dev-shm-usage",
		"--remote-debugging-address=127.0.0.1",
		"--remote-debugging-port=0",
		"about:blank",
	}
	if headless {
		args = append([]string{"--headless=new"}, args...)
	}
	return args
}

func (c *cdpClient) runBrowserAction(ctx context.Context, index int, action browserControlAction, roots []string, workDir string) (string, error) {
	typ := strings.ToLower(strings.TrimSpace(action.Type))
	switch typ {
	case "click":
		x, y, err := c.browserActionPoint(ctx, action)
		if err != nil {
			return "", fmt.Errorf("action %d click: %w", index, err)
		}
		if _, err := c.send(ctx, "Input.dispatchMouseEvent", map[string]any{"type": "mouseMoved", "x": x, "y": y, "button": "none"}); err != nil {
			return "", err
		}
		if _, err := c.send(ctx, "Input.dispatchMouseEvent", map[string]any{"type": "mousePressed", "x": x, "y": y, "button": "left", "clickCount": 1}); err != nil {
			return "", err
		}
		_, err = c.send(ctx, "Input.dispatchMouseEvent", map[string]any{"type": "mouseReleased", "x": x, "y": y, "button": "left", "clickCount": 1})
		return "", err
	case "type":
		if action.Text == "" {
			return "", fmt.Errorf("action %d type: text is required", index)
		}
		if _, err := c.send(ctx, "Input.insertText", map[string]any{"text": action.Text}); err != nil {
			return "", err
		}
		return "", nil
	case "press":
		key := strings.TrimSpace(action.Key)
		if key == "" {
			return "", fmt.Errorf("action %d press: key is required", index)
		}
		return "", c.pressBrowserKey(ctx, key)
	case "wait":
		ms := action.MS
		if ms < 0 {
			ms = 0
		}
		if ms > 10000 {
			ms = 10000
		}
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-time.After(time.Duration(ms) * time.Millisecond):
			return "", nil
		}
	case "screenshot":
		path, err := resolveAutomationOutputPath(action.Path, "browser-control", roots, workDir)
		if err != nil {
			return "", err
		}
		if err := c.captureBrowserScreenshot(ctx, path); err != nil {
			return "", err
		}
		return path, nil
	default:
		return "", fmt.Errorf("action %d: type must be click, type, press, wait, or screenshot", index)
	}
}

func (c *cdpClient) browserActionPoint(ctx context.Context, action browserControlAction) (float64, float64, error) {
	if strings.TrimSpace(action.Selector) == "" {
		return action.X, action.Y, nil
	}
	sel, _ := json.Marshal(action.Selector)
	expr := fmt.Sprintf(`(() => {
  const el = document.querySelector(%s);
  if (!el) return null;
  el.scrollIntoView({block: "center", inline: "center"});
  const r = el.getBoundingClientRect();
  return {x: r.left + r.width / 2, y: r.top + r.height / 2};
})()`, string(sel))
	raw, err := c.evaluateValue(ctx, expr)
	if err != nil {
		return 0, 0, err
	}
	if len(raw) == 0 || string(raw) == "null" {
		return 0, 0, fmt.Errorf("selector %q not found", action.Selector)
	}
	var point struct {
		X float64 `json:"x"`
		Y float64 `json:"y"`
	}
	if err := json.Unmarshal(raw, &point); err != nil {
		return 0, 0, fmt.Errorf("parse selector point: %w", err)
	}
	return point.X, point.Y, nil
}

func (c *cdpClient) pressBrowserKey(ctx context.Context, key string) error {
	def := browserKeyDef(key)
	if _, err := c.send(ctx, "Input.dispatchKeyEvent", map[string]any{
		"type":                  "keyDown",
		"key":                   def.Key,
		"code":                  def.Code,
		"windowsVirtualKeyCode": def.VK,
		"nativeVirtualKeyCode":  def.VK,
	}); err != nil {
		return err
	}
	_, err := c.send(ctx, "Input.dispatchKeyEvent", map[string]any{
		"type":                  "keyUp",
		"key":                   def.Key,
		"code":                  def.Code,
		"windowsVirtualKeyCode": def.VK,
		"nativeVirtualKeyCode":  def.VK,
	})
	return err
}

type browserKey struct {
	Key  string
	Code string
	VK   int
}

func browserKeyDef(key string) browserKey {
	k := strings.TrimSpace(key)
	low := strings.ToLower(k)
	switch low {
	case "enter", "return":
		return browserKey{Key: "Enter", Code: "Enter", VK: 13}
	case "tab":
		return browserKey{Key: "Tab", Code: "Tab", VK: 9}
	case "escape", "esc":
		return browserKey{Key: "Escape", Code: "Escape", VK: 27}
	case "backspace":
		return browserKey{Key: "Backspace", Code: "Backspace", VK: 8}
	case "delete":
		return browserKey{Key: "Delete", Code: "Delete", VK: 46}
	case "arrowleft", "left":
		return browserKey{Key: "ArrowLeft", Code: "ArrowLeft", VK: 37}
	case "arrowup", "up":
		return browserKey{Key: "ArrowUp", Code: "ArrowUp", VK: 38}
	case "arrowright", "right":
		return browserKey{Key: "ArrowRight", Code: "ArrowRight", VK: 39}
	case "arrowdown", "down":
		return browserKey{Key: "ArrowDown", Code: "ArrowDown", VK: 40}
	case "space":
		return browserKey{Key: " ", Code: "Space", VK: 32}
	default:
		r := []rune(k)
		if len(r) == 1 {
			upper := strings.ToUpper(string(r[0]))
			return browserKey{Key: string(r[0]), Code: "Key" + upper, VK: int(upper[0])}
		}
		return browserKey{Key: k, Code: k, VK: 0}
	}
}

func (c *cdpClient) captureBrowserScreenshot(ctx context.Context, path string) error {
	result, err := c.send(ctx, "Page.captureScreenshot", map[string]any{"format": "png", "captureBeyondViewport": false})
	if err != nil {
		return err
	}
	var payload struct {
		Data string `json:"data"`
	}
	if err := json.Unmarshal(result, &payload); err != nil {
		return fmt.Errorf("parse screenshot result: %w", err)
	}
	raw, err := base64.StdEncoding.DecodeString(payload.Data)
	if err != nil {
		return fmt.Errorf("decode screenshot: %w", err)
	}
	if err := os.WriteFile(path, raw, 0o644); err != nil {
		return fmt.Errorf("write screenshot: %w", err)
	}
	return nil
}

func (c *cdpClient) evaluateValue(ctx context.Context, expr string) (json.RawMessage, error) {
	result, err := c.send(ctx, "Runtime.evaluate", map[string]any{
		"expression":    expr,
		"awaitPromise":  true,
		"returnByValue": true,
	})
	if err != nil {
		return nil, err
	}
	var eval struct {
		Result struct {
			Value json.RawMessage `json:"value"`
		} `json:"result"`
		ExceptionDetails json.RawMessage `json:"exceptionDetails"`
	}
	if err := json.Unmarshal(result, &eval); err != nil {
		return nil, fmt.Errorf("parse Runtime.evaluate result: %w", err)
	}
	if len(eval.ExceptionDetails) > 0 {
		return nil, fmt.Errorf("Runtime.evaluate exception: %s", truncate(string(eval.ExceptionDetails), 500))
	}
	return eval.Result.Value, nil
}
