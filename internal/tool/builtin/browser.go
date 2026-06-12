package builtin

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"

	"voltui/internal/tool"
)

func init() { tool.RegisterBuiltin(browserNavigate{}) }

// browserNavigate drives a headless Chromium browser through CDP (Chrome
// DevTools Protocol). It is the JavaScript-rendering counterpart of web_fetch:
// web_fetch reads plain HTTP responses; browser_navigate lets the page execute
// JavaScript, waits for the document to settle, then returns visible text.
//
// The tool intentionally does not download or bundle a browser. It uses an
// already installed Chromium-family browser: Edge on Windows 10+, Chrome,
// Chromium, or an explicit VOLTUI_BROWSER_PATH.
type browserNavigate struct{}

const (
	browserTimeout     = 30 * time.Second
	browserStartupWait = 5 * time.Second
	browserMaxText     = 1 << 20 // 1 MiB text cap
)

func (browserNavigate) Name() string { return "browser_navigate" }

func (browserNavigate) Description() string {
	return "Navigate a headless Chromium browser to a URL, wait for the page to render (including JavaScript), and return visible text. Uses CDP (Chrome DevTools Protocol) instead of --dump-dom, so it can be extended later for richer browser actions. On Windows 10+, Microsoft Edge is pre-installed and works out of the box. On other systems, requires Chrome/Chromium/Edge or VOLTUI_BROWSER_PATH."
}

func (browserNavigate) Schema() json.RawMessage {
	return json.RawMessage(`{
"type":"object",
"properties":{
  "url":{"type":"string","description":"Absolute URL beginning with http:// or https://"},
  "wait":{"type":"integer","description":"Additional milliseconds to wait after page load for lazy content (default 0, max 5000)","default":0}
},
"required":["url"]
}`)
}

func (browserNavigate) ReadOnly() bool { return true }

// browserMu serializes launches so we do not fork multiple Chromium processes
// at once on small enterprise desktops or remote VDI sessions.
var browserMu sync.Mutex

func (browserNavigate) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	var p struct {
		URL  string `json:"url"`
		Wait int    `json:"wait"`
	}
	if err := json.Unmarshal(args, &p); err != nil {
		return "", fmt.Errorf("invalid args: %w", err)
	}
	if p.URL == "" {
		return "", fmt.Errorf("url is required")
	}
	u, err := url.Parse(p.URL)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") {
		return "", fmt.Errorf("url must be an absolute http(s) address")
	}
	if p.Wait < 0 {
		p.Wait = 0
	}
	if p.Wait > 5000 {
		p.Wait = 5000
	}

	bin, err := findBrowserBin()
	if err != nil {
		return fmt.Sprintf("(no browser found: %s - install Chromium or set VOLTUI_BROWSER_PATH)", err), nil
	}

	browserMu.Lock()
	defer browserMu.Unlock()

	return navigateCDP(ctx, bin, p.URL, p.Wait)
}

func navigateCDP(ctx context.Context, bin, targetURL string, extraWaitMs int) (string, error) {
	ctx, cancel := context.WithTimeout(ctx, browserTimeout)
	defer cancel()

	cmd := exec.CommandContext(ctx, bin,
		"--headless=new",
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
	)
	cmd.Env = append(os.Environ(),
		"QT_QPA_PLATFORM=offscreen",
		"CHROME_CRASHPAD_PIPE=",
	)

	stderr, err := cmd.StderrPipe()
	if err != nil {
		return "", fmt.Errorf("browser_navigate: stderr pipe: %w", err)
	}
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("browser_navigate: start browser: %w", err)
	}
	defer func() {
		if cmd.Process != nil {
			_ = cmd.Process.Kill()
			_ = cmd.Wait()
		}
	}()

	debugURL, err := readDevToolsURL(ctx, stderr)
	if err != nil {
		return "", fmt.Errorf("browser_navigate: detect DevTools endpoint: %w", err)
	}
	pageWSURL, err := fetchPageWebSocketURL(ctx, debugURL)
	if err != nil {
		return "", fmt.Errorf("browser_navigate: page websocket URL: %w", err)
	}

	conn, _, err := websocket.DefaultDialer.DialContext(ctx, pageWSURL, nil)
	if err != nil {
		return "", fmt.Errorf("browser_navigate: CDP connect: %w", err)
	}
	defer conn.Close()
	conn.SetReadLimit(10 << 20)

	text, err := cdpNavigateAndExtract(ctx, conn, targetURL, extraWaitMs)
	if err != nil {
		return "", fmt.Errorf("browser_navigate: %w", err)
	}

	text = strings.TrimSpace(text)
	if text == "" {
		return "(empty page - no visible text after rendering)", nil
	}
	if len(text) > browserMaxText {
		text = text[:browserMaxText] + "\n... (truncated)"
	}
	return text, nil
}

func readDevToolsURL(ctx context.Context, r io.Reader) (string, error) {
	lines := make(chan string)
	errs := make(chan error, 1)

	go func() {
		scanner := bufio.NewScanner(r)
		for scanner.Scan() {
			lines <- scanner.Text()
		}
		if err := scanner.Err(); err != nil {
			errs <- err
			return
		}
		close(lines)
	}()

	timer := time.NewTimer(browserStartupWait)
	defer timer.Stop()

	for {
		select {
		case <-ctx.Done():
			return "", ctx.Err()
		case <-timer.C:
			return "", fmt.Errorf("timed out waiting for DevTools endpoint")
		case err := <-errs:
			return "", err
		case line, ok := <-lines:
			if !ok {
				return "", fmt.Errorf("browser stderr closed before DevTools endpoint appeared")
			}
			line = strings.TrimSpace(line)
			if strings.HasPrefix(line, "DevTools listening on ") {
				return strings.TrimPrefix(line, "DevTools listening on "), nil
			}
		}
	}
}

type cdpTarget struct {
	Type                 string `json:"type"`
	WebSocketDebuggerURL string `json:"webSocketDebuggerUrl"`
}

func fetchPageWebSocketURL(ctx context.Context, debugURL string) (string, error) {
	u, err := url.Parse(debugURL)
	if err != nil {
		return "", fmt.Errorf("invalid DevTools URL: %w", err)
	}
	if u.Host == "" {
		return "", fmt.Errorf("DevTools URL missing host")
	}

	targets, err := fetchCDPTargets(ctx, u.Host, "/json/list")
	if err != nil {
		return "", err
	}
	for _, target := range targets {
		if target.Type == "page" && target.WebSocketDebuggerURL != "" {
			return target.WebSocketDebuggerURL, nil
		}
	}

	// Some Chromium builds start with only the browser endpoint. Create a page
	// target through the DevTools HTTP API, then use its page WebSocket.
	target, err := createCDPPageTarget(ctx, u.Host)
	if err != nil {
		return "", err
	}
	if target.WebSocketDebuggerURL == "" {
		return "", fmt.Errorf("created page target did not include webSocketDebuggerUrl")
	}
	return target.WebSocketDebuggerURL, nil
}

func fetchCDPTargets(ctx context.Context, host, path string) ([]cdpTarget, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://"+host+path, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("DevTools %s returned %s", path, resp.Status)
	}
	var targets []cdpTarget
	if err := json.NewDecoder(resp.Body).Decode(&targets); err != nil {
		return nil, fmt.Errorf("parse DevTools %s: %w", path, err)
	}
	return targets, nil
}

func createCDPPageTarget(ctx context.Context, host string) (cdpTarget, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, "http://"+host+"/json/new?about:blank", nil)
	if err != nil {
		return cdpTarget{}, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return cdpTarget{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return cdpTarget{}, fmt.Errorf("DevTools /json/new returned %s", resp.Status)
	}
	var target cdpTarget
	if err := json.NewDecoder(resp.Body).Decode(&target); err != nil {
		return cdpTarget{}, fmt.Errorf("parse DevTools /json/new: %w", err)
	}
	return target, nil
}

func cdpNavigateAndExtract(ctx context.Context, conn *websocket.Conn, targetURL string, extraWaitMs int) (string, error) {
	client := cdpClient{conn: conn}
	if _, err := client.send(ctx, "Page.enable", nil); err != nil {
		return "", err
	}
	if _, err := client.send(ctx, "Page.navigate", map[string]any{"url": targetURL}); err != nil {
		return "", err
	}
	return client.evaluateText(ctx, extraWaitMs)
}

type cdpClient struct {
	conn   *websocket.Conn
	nextID int
}

func (c *cdpClient) send(ctx context.Context, method string, params map[string]any) (json.RawMessage, error) {
	c.nextID++
	id := c.nextID
	if params == nil {
		params = map[string]any{}
	}
	if deadline, ok := ctx.Deadline(); ok {
		_ = c.conn.SetWriteDeadline(deadline)
		_ = c.conn.SetReadDeadline(deadline)
	}
	if err := c.conn.WriteJSON(map[string]any{
		"id":     id,
		"method": method,
		"params": params,
	}); err != nil {
		return nil, fmt.Errorf("CDP write %s: %w", method, err)
	}

	for {
		var raw json.RawMessage
		if err := c.conn.ReadJSON(&raw); err != nil {
			return nil, fmt.Errorf("CDP read %s: %w", method, err)
		}
		var env struct {
			ID     int             `json:"id"`
			Result json.RawMessage `json:"result"`
			Error  *struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			} `json:"error"`
		}
		if err := json.Unmarshal(raw, &env); err != nil || env.ID != id {
			continue
		}
		if env.Error != nil {
			return nil, fmt.Errorf("CDP error on %s: %s", method, env.Error.Message)
		}
		return env.Result, nil
	}
}

func (c *cdpClient) evaluateText(ctx context.Context, extraWaitMs int) (string, error) {
	expr := fmt.Sprintf(`(async () => {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const deadline = Date.now() + 15000;
  while (document.readyState !== "complete" && Date.now() < deadline) {
    await sleep(100);
  }
  await sleep(%d);
  return document.body ? document.body.innerText : "";
})()`, extraWaitMs)

	var lastErr error
	for {
		select {
		case <-ctx.Done():
			if lastErr != nil {
				return "", lastErr
			}
			return "", ctx.Err()
		default:
		}

		result, err := c.send(ctx, "Runtime.evaluate", map[string]any{
			"expression":    expr,
			"awaitPromise":  true,
			"returnByValue": true,
		})
		if err == nil {
			return parseRuntimeString(result)
		}
		lastErr = err
		if !strings.Contains(err.Error(), "context") && !strings.Contains(err.Error(), "navigat") {
			return "", err
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func parseRuntimeString(result json.RawMessage) (string, error) {
	var eval struct {
		Result struct {
			Type  string `json:"type"`
			Value string `json:"value"`
		} `json:"result"`
		ExceptionDetails json.RawMessage `json:"exceptionDetails"`
	}
	if err := json.Unmarshal(result, &eval); err != nil {
		return "", fmt.Errorf("parse Runtime.evaluate result: %w", err)
	}
	if len(eval.ExceptionDetails) > 0 {
		return "", fmt.Errorf("Runtime.evaluate exception: %s", truncate(string(eval.ExceptionDetails), 500))
	}
	if eval.Result.Type == "undefined" || eval.Result.Type == "null" {
		return "", nil
	}
	return eval.Result.Value, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}

func findBrowserBin() (string, error) {
	if p := os.Getenv("VOLTUI_BROWSER_PATH"); p != "" {
		if isBrowserBin(p) {
			return p, nil
		}
		return "", fmt.Errorf("VOLTUI_BROWSER_PATH=%q not found or not executable", p)
	}

	for _, p := range browserBinCandidates() {
		if isBrowserBin(p) {
			return p, nil
		}
	}

	for _, name := range []string{"chromium-browser", "chromium", "google-chrome", "google-chrome-stable", "microsoft-edge", "microsoft-edge-stable", "chrome"} {
		if p, err := exec.LookPath(name); err == nil {
			return p, nil
		}
	}

	return "", fmt.Errorf("no Chromium/Chrome/Edge found on system")
}

func isBrowserBin(p string) bool {
	fi, err := os.Stat(p)
	if err != nil || fi.IsDir() {
		return false
	}
	return fi.Mode().Perm()&0111 != 0
}
