package cli

import (
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"voltui/internal/builtinmcp"
	"voltui/internal/config"
	"voltui/internal/control"
	"voltui/internal/plugin"
)

func TestParseMCPAddStdio(t *testing.T) {
	e, err := parseMCPAdd([]string{"fs", "npx", "-y", "@modelcontextprotocol/server-filesystem", "."})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if e.Name != "fs" || e.Command != "npx" {
		t.Fatalf("name/command = %q/%q", e.Name, e.Command)
	}
	// The command keeps its own -flags: "-y" is an arg, not parsed as our flag.
	if want := []string{"-y", "@modelcontextprotocol/server-filesystem", "."}; !reflect.DeepEqual(e.Args, want) {
		t.Fatalf("args = %v, want %v", e.Args, want)
	}
	if e.URL != "" {
		t.Errorf("stdio entry should have no URL, got %q", e.URL)
	}
}

func TestParseMCPAddStdioEnv(t *testing.T) {
	e, err := parseMCPAdd([]string{"db", "--env", "PGHOST=localhost", "node", "server.js"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if e.Command != "node" || !reflect.DeepEqual(e.Args, []string{"server.js"}) {
		t.Fatalf("command/args = %q/%v", e.Command, e.Args)
	}
	if e.Env["PGHOST"] != "localhost" {
		t.Errorf("env PGHOST = %q, want localhost", e.Env["PGHOST"])
	}
}

func TestParseMCPAddHTTP(t *testing.T) {
	for _, args := range [][]string{
		{"stripe", "--http", "https://mcp.stripe.com"},
		{"stripe", "--http=https://mcp.stripe.com"},
	} {
		e, err := parseMCPAdd(args)
		if err != nil {
			t.Fatalf("%v: %v", args, err)
		}
		if e.Type != "http" || e.URL != "https://mcp.stripe.com" {
			t.Errorf("%v -> type/url = %q/%q", args, e.Type, e.URL)
		}
		if e.Command != "" {
			t.Errorf("%v -> remote entry should have no command, got %q", args, e.Command)
		}
	}
}

func TestParseMCPAddHTTPHeader(t *testing.T) {
	e, err := parseMCPAdd([]string{"x", "--http", "https://x", "--header", "Authorization=Bearer abc"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if e.Headers["Authorization"] != "Bearer abc" {
		t.Errorf("header = %q, want %q", e.Headers["Authorization"], "Bearer abc")
	}
}

func TestParseMCPAddErrors(t *testing.T) {
	cases := map[string][]string{
		"no name":           {},
		"name is a flag":    {"--http", "https://x"},
		"no command/url":    {"fs"},
		"command and url":   {"x", "--http", "https://x", "node"},
		"unknown flag":      {"x", "--bogus", "y", "cmd"},
		"env without value": {"x", "--env"},
	}
	for name, args := range cases {
		if _, err := parseMCPAdd(args); err == nil {
			t.Errorf("%s: expected an error for %v", name, args)
		}
	}
}

func TestTokenizeArgs(t *testing.T) {
	got := tokenizeArgs(`/mcp add s --header "Authorization=Bearer abc" --http https://x`)
	want := []string{"/mcp", "add", "s", "--header", "Authorization=Bearer abc", "--http", "https://x"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("tokenizeArgs = %v, want %v", got, want)
	}
	// Single quotes work too, and surrounding whitespace collapses.
	if got := tokenizeArgs("  a  'b c'  d "); !reflect.DeepEqual(got, []string{"a", "b c", "d"}) {
		t.Fatalf("tokenizeArgs single-quote = %v", got)
	}
}

func TestMCPGetStdioRedactsEnvAndKeepsOrder(t *testing.T) {
	isolateCLIConfigHome(t)

	_ = captureStdout(t, func() {
		if rc := mcpAddCLI([]string{
			"open-design",
			"--env", "OPEN_DESIGN_TOKEN=placeholder-value",
			"--env", "OD_DAEMON_URL=http://127.0.0.1:7456",
			"node", "open-design-mcp.js", "--stdio",
		}); rc != 0 {
			t.Fatalf("mcp add rc = %d, want 0", rc)
		}
	})

	configPath := "voltui.toml"
	before, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config before get: %v", err)
	}
	getOut := captureStdout(t, func() {
		if rc := Run([]string{"mcp", "get", "open-design"}, "test-version"); rc != 0 {
			t.Fatalf("mcp get rc = %d, want 0", rc)
		}
	})
	after, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read config after get: %v", err)
	}
	if string(after) != string(before) {
		t.Fatalf("mcp get changed config:\nbefore:\n%s\nafter:\n%s", before, after)
	}
	for _, want := range []string{
		"name: open-design",
		"type: stdio",
		"command: node",
		"args: open-design-mcp.js",
		"      --stdio",
		"OD_DAEMON_URL=http://127.0.0.1:7456",
		"OPEN_DESIGN_TOKEN=<redacted>",
	} {
		if !strings.Contains(getOut, want) {
			t.Fatalf("mcp get output missing %q:\n%s", want, getOut)
		}
	}
	if strings.Contains(getOut, "placeholder-value") {
		t.Fatalf("mcp get leaked sensitive env value:\n%s", getOut)
	}
	if strings.Index(getOut, "OD_DAEMON_URL=") > strings.Index(getOut, "OPEN_DESIGN_TOKEN=") {
		t.Fatalf("mcp get env output is not sorted:\n%s", getOut)
	}
}

func TestMCPGetMissingServerFails(t *testing.T) {
	isolateCLIConfigHome(t)

	errOut := captureStderr(t, func() {
		if rc := mcpCommand([]string{"get", "open-design"}); rc != 1 {
			t.Fatalf("mcp get missing rc = %d, want 1", rc)
		}
	})
	if !strings.Contains(errOut, `no MCP server named "open-design"`) {
		t.Fatalf("mcp get missing stderr = %q", errOut)
	}
}

func TestMCPGetRemoteRedactsAuthMaterialAndKeepsHeaderOrder(t *testing.T) {
	isolateCLIConfigHome(t)

	_ = captureStdout(t, func() {
		if rc := mcpAddCLI([]string{
			"stripe",
			"--http", "https://mcp.example.test/mcp?access_token=access-secret&key=key-secret&workspace=main",
			"--header", "X-Workspace=main",
			"--header", "Authorization=Bearer header-secret",
		}); rc != 0 {
			t.Fatalf("mcp add remote rc = %d, want 0", rc)
		}
	})

	getOut := captureStdout(t, func() {
		if rc := mcpCommand([]string{"get", "stripe"}); rc != 0 {
			t.Fatalf("mcp get remote rc = %d, want 0", rc)
		}
	})
	for _, want := range []string{
		"type: http",
		"workspace=main",
		"access_token=%3Credacted%3E",
		"key=%3Credacted%3E",
		"Authorization=<redacted>",
		"X-Workspace=main",
	} {
		if !strings.Contains(getOut, want) {
			t.Fatalf("mcp get remote output missing %q:\n%s", want, getOut)
		}
	}
	for _, secret := range []string{"access-secret", "key-secret", "Bearer header-secret"} {
		if strings.Contains(getOut, secret) {
			t.Fatalf("mcp get leaked %q:\n%s", secret, getOut)
		}
	}
	if strings.Index(getOut, "Authorization=") > strings.Index(getOut, "X-Workspace=") {
		t.Fatalf("mcp get header output is not sorted:\n%s", getOut)
	}
}

func TestMCPGetUsesEffectiveConfigSourcesWithoutBuiltins(t *testing.T) {
	isolateCLIConfigHome(t)
	userPath := config.UserConfigPath()
	if err := os.MkdirAll(filepath.Dir(userPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(userPath, []byte(`[[plugins]]
name = "shared"
command = "user-bin"

[[plugins]]
name = "user-only"
command = "user-only-bin"
`), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile("voltui.toml", []byte(`[[plugins]]
name = "shared"
command = "project-bin"

[[plugins]]
name = "project-only"
command = "project-only-bin"
`), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(".mcp.json", []byte(`{
  "mcpServers": {
    "shared": {"type": "http", "url": "https://mcp.example.test/ignored"},
    "mcp-only": {"type": "http", "url": "https://mcp.example.test/effective"}
  }
}`), 0o644); err != nil {
		t.Fatal(err)
	}
	sourcePaths := []string{userPath, "voltui.toml", ".mcp.json"}
	sourceBefore := make(map[string]string, len(sourcePaths))
	for _, path := range sourcePaths {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read config source %s before get: %v", path, err)
		}
		sourceBefore[path] = string(raw)
	}

	for _, tc := range []struct {
		name    string
		want    string
		notWant string
	}{
		{name: "shared", want: "command: project-bin", notWant: "user-bin"},
		{name: "user-only", want: "command: user-only-bin"},
		{name: "project-only", want: "command: project-only-bin"},
		{name: "mcp-only", want: "url: https://mcp.example.test/effective"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			out := captureStdout(t, func() {
				if rc := mcpCommand([]string{"get", tc.name}); rc != 0 {
					t.Fatalf("mcp get %s rc = %d, want 0", tc.name, rc)
				}
			})
			if !strings.Contains(out, tc.want) {
				t.Fatalf("mcp get %s output missing %q:\n%s", tc.name, tc.want, out)
			}
			if tc.notWant != "" && strings.Contains(out, tc.notWant) {
				t.Fatalf("mcp get %s output unexpectedly contains %q:\n%s", tc.name, tc.notWant, out)
			}
		})
	}

	errOut := captureStderr(t, func() {
		if rc := mcpCommand([]string{"get", builtinmcp.TimeName}); rc != 1 {
			t.Fatalf("mcp get built-in rc = %d, want 1", rc)
		}
	})
	if !strings.Contains(errOut, "no MCP server named") {
		t.Fatalf("mcp get built-in stderr = %q", errOut)
	}

	for _, path := range sourcePaths {
		raw, err := os.ReadFile(path)
		if err != nil {
			t.Fatalf("read config source %s after get: %v", path, err)
		}
		if string(raw) != sourceBefore[path] {
			t.Fatalf("mcp get changed config source %s", path)
		}
	}
}

func TestMCPListRedactsRemoteQuerySecrets(t *testing.T) {
	isolateCLIConfigHome(t)

	_ = captureStdout(t, func() {
		if rc := mcpAddCLI([]string{
			"remote",
			"--http", "https://mcp.example.test/mcp?access_token=list-access-secret&key=list-key-secret&workspace=main",
		}); rc != 0 {
			t.Fatalf("mcp add remote rc = %d, want 0", rc)
		}
	})

	out := captureStdout(t, func() {
		if rc := mcpList(); rc != 0 {
			t.Fatalf("mcp list rc = %d, want 0", rc)
		}
	})
	for _, want := range []string{"remote", "workspace=main", "access_token=%3Credacted%3E", "key=%3Credacted%3E"} {
		if !strings.Contains(out, want) {
			t.Fatalf("mcp list output missing %q:\n%s", want, out)
		}
	}
	for _, secret := range []string{"list-access-secret", "list-key-secret"} {
		if strings.Contains(out, secret) {
			t.Fatalf("mcp list leaked %q:\n%s", secret, out)
		}
	}
}

func TestRenderMCPStatusGroupsAndCompactsResources(t *testing.T) {
	longURI := "file:///Users/example/project/docs/really/deep/path/with/a/very/long/resource-name.md"
	got := renderMCPStatus(110,
		[]plugin.ServerStatus{{Name: "docs", Transport: "stdio", Tools: 2}},
		[]plugin.Prompt{{Server: "docs", Name: "mcp__docs__summarize", Description: "Summarize a selected document for review"}},
		[]plugin.Resource{{Server: "docs", URI: longURI, Name: "Resource manual", MimeType: "text/markdown"}},
		nil,
	)
	for _, want := range []string{
		"MCP servers (1)",
		"docs",
		"prompts",
		"/mcp__docs__summarize",
		"resources",
		"@docs:file:///",
		"…",
		"Resource manual [text/markdown]",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("rendered MCP status missing %q:\n%s", want, got)
		}
	}
	if strings.Contains(got, longURI) {
		t.Fatalf("long resource URI should be compacted:\n%s", got)
	}
}

func TestRenderMCPStatusCapsLongSections(t *testing.T) {
	var resources []plugin.Resource
	for i := 0; i < mcpMaxItemsPerSection+2; i++ {
		resources = append(resources, plugin.Resource{Server: "fs", URI: "file:///tmp/resource.md"})
	}
	got := renderMCPStatus(80,
		[]plugin.ServerStatus{{Name: "fs", Transport: "stdio"}},
		nil,
		resources,
		nil,
	)
	if !strings.Contains(got, "+2 more resources") {
		t.Fatalf("rendered MCP status should cap long resource sections:\n%s", got)
	}
}

func TestMCPCapabilitiesTextUsesAdvertisedTools(t *testing.T) {
	if got := mcpCapabilitiesText(mcpServerView{HasTools: true}); got != "tools" {
		t.Fatalf("mcpCapabilitiesText = %q, want tools", got)
	}
}

func TestRenderMCPStatusShowsFailures(t *testing.T) {
	got := renderMCPStatus(90,
		nil,
		nil,
		nil,
		[]plugin.Failure{{Name: "broken", Transport: "stdio", Error: "npm error ENOENT"}},
	)
	for _, want := range []string{"MCP servers (0)", "broken", "npm error ENOENT"} {
		if !strings.Contains(got, want) {
			t.Fatalf("rendered MCP status missing %q:\n%s", want, got)
		}
	}
}

func TestRenderMCPManagerListGroupsRuntimeAndConfiguredServers(t *testing.T) {
	p := &mcpManager{snapshot: mcpSnapshot{
		configPath: "voltui.toml",
		servers: []mcpServerView{
			{Name: "managed-search", Transport: "stdio", Status: "connected", BuiltIn: true, Tools: 4},
			{Name: "github", Transport: "stdio", Status: "deferred", Configured: true, Tier: "background", Tools: 12},
			{Name: "figma", Transport: "http", Status: "failed", Configured: true, Tier: "background", URL: "https://mcp.figma.com", Error: "connect: 401 unauthorized"},
		},
	}}
	got := p.renderList(120)
	for _, want := range []string{
		"Manage MCP servers",
		"3 servers",
		"Managed MCPs",
		"User MCPs (voltui.toml)",
		"managed-search",
		"connected",
		"github",
		"preparing in background",
		"figma",
		"needs authentication",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("rendered MCP manager list missing %q:\n%s", want, got)
		}
	}
}

func TestRenderMCPManagerListCompactsLongNames(t *testing.T) {
	p := &mcpManager{snapshot: mcpSnapshot{servers: []mcpServerView{
		{Name: "@modelcontextprotocol/server-sequential-thinking", Transport: "stdio", Status: "deferred", Configured: true, Tier: "background"},
	}}}
	got := p.renderList(80)
	for _, line := range strings.Split(got, "\n") {
		if visibleWidth(line) > 80 {
			t.Fatalf("line exceeds width 80 (%d): %q\n%s", visibleWidth(line), line, got)
		}
	}
	if strings.Contains(got, "\n 0") || strings.Contains(got, "\n use") {
		t.Fatalf("list row should not wrap status onto the next line:\n%s", got)
	}
}

func TestRenderMCPManagerAuthFailureActions(t *testing.T) {
	p := &mcpManager{
		stage: mcpStageDetail,
		name:  "figma",
		snapshot: mcpSnapshot{
			configPath: "voltui.toml",
			servers: []mcpServerView{{
				Name: "figma", Transport: "http", Status: "failed", Configured: true,
				Tier: "background", URL: "https://mcp.figma.com", Error: "connect: 401 unauthorized",
			}},
		},
	}
	got := p.renderDetail(120)
	for _, want := range []string{
		"Figma MCP Server",
		"needs authentication",
		"not authenticated",
		"Authenticate",
		"Clear authentication",
		"View logs",
		"Edit config",
		"Remove server",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("rendered auth failure details missing %q:\n%s", want, got)
		}
	}
	if strings.Contains(got, "Retry") {
		t.Fatalf("auth failures should prefer Authenticate over Retry:\n%s", got)
	}
}

func TestRenderMCPManagerClearAuthConfirmation(t *testing.T) {
	p := &mcpManager{
		stage:   mcpStageConfirmClearAuth,
		name:    "figma",
		confirm: 1,
		snapshot: mcpSnapshot{
			servers: []mcpServerView{{
				Name: "figma", Transport: "http", Status: "failed", Configured: true,
				Tier: "background", URL: "https://mcp.figma.com", Error: "connect: 401 unauthorized",
			}},
		},
	}
	got := p.renderConfirmClearAuth(120)
	for _, want := range []string{
		"Clear authentication for MCP server \"figma\"?",
		"Confirm clear authentication",
		"Cancel",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("rendered clear-auth confirmation missing %q:\n%s", want, got)
		}
	}
	if hint := p.footerHint(); !strings.Contains(hint, "y confirm") {
		t.Fatalf("clear-auth footer hint missing confirm shortcut: %q", hint)
	}
}

func TestRenderMCPManagerRemoteDeferredAuthHint(t *testing.T) {
	p := &mcpManager{
		stage: mcpStageDetail,
		name:  "dida",
		snapshot: mcpSnapshot{
			configPath: "voltui.toml",
			servers: []mcpServerView{{
				Name: "dida", Transport: "http", Status: "deferred", Configured: true,
				Tier: "background", URL: "https://mcp.dida365.com",
			}},
		},
	}
	got := p.renderDetail(100)
	for _, want := range []string{
		"preparing in background",
		"Auth:",
		"may need authorization",
		"Reconnect",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("rendered deferred remote details missing %q:\n%s", want, got)
		}
	}
	if strings.Contains(got, "Connect now") {
		t.Fatalf("automatic background MCP should not expose manual connect:\n%s", got)
	}
	if strings.Contains(got, "Authenticate") {
		t.Fatalf("possible auth should not replace connect action before a failure:\n%s", got)
	}
}

func TestRenderMCPManagerDetailCompactsConfigPath(t *testing.T) {
	p := &mcpManager{
		stage: mcpStageDetail,
		name:  "github",
		snapshot: mcpSnapshot{
			configPath: "/Users/example/Library/Application Support/voltui/config.toml",
			servers: []mcpServerView{{
				Name: "github", Transport: "stdio", Status: "deferred", Configured: true,
				Tier: "background", Command: "npx", Args: []string{"-y", "@modelcontextprotocol/server-github"},
			}},
		},
	}
	got := p.renderDetail(80)
	for _, line := range strings.Split(got, "\n") {
		if visibleWidth(line) > 80 {
			t.Fatalf("detail line exceeds width 80 (%d): %q\n%s", visibleWidth(line), line, got)
		}
	}
	if strings.Contains(got, "Application Support/voltui/config.toml") {
		t.Fatalf("long config path should be compacted:\n%s", got)
	}
}

func TestMCPEditConfigLaunchUsesVisualBeforeEditor(t *testing.T) {
	t.Setenv("VISUAL", "vim")
	t.Setenv("EDITOR", "nano")

	path := "/tmp/voltui config.toml"
	launch, err := mcpEditConfigLaunchCommand(path, func(string) (string, error) {
		t.Fatal("lookPath should not be called when VISUAL is set")
		return "", errors.New("unexpected lookup")
	})
	if err != nil {
		t.Fatalf("edit command: %v", err)
	}
	if launch.systemDefault {
		t.Fatalf("VISUAL should not use system default: %+v", launch)
	}
	if launch.editor != "vim" {
		t.Fatalf("editor = %q, want vim", launch.editor)
	}
	// VISUAL must run the editor binary directly (not via sh -lc) so that
	// shell metacharacters in the env value cannot be executed. argv is
	// [editorBinary, path].
	if len(launch.cmd.Args) != 2 || launch.cmd.Args[0] != "vim" || launch.cmd.Args[1] != path {
		t.Fatalf("VISUAL should invoke editor binary directly, args=%v", launch.cmd.Args)
	}
}

// TestMCPEditConfigLaunchEditorWithArgs confirms that an EDITOR/VISUAL value
// carrying arguments (e.g. "code --wait") is split into argv correctly and
// the path is appended as the final argument, without going through a shell.
func TestMCPEditConfigLaunchEditorWithArgs(t *testing.T) {
	t.Setenv("VISUAL", "code --wait")
	t.Setenv("EDITOR", "")

	path := "/tmp/voltui.toml"
	launch, err := mcpEditConfigLaunchCommand(path, func(string) (string, error) {
		t.Fatal("lookPath should not be called when VISUAL is set")
		return "", errors.New("unexpected lookup")
	})
	if err != nil {
		t.Fatalf("edit command: %v", err)
	}
	if launch.editor != "code" {
		t.Fatalf("editor display name = %q, want code", launch.editor)
	}
	want := []string{"code", "--wait", path}
	if len(launch.cmd.Args) != len(want) {
		t.Fatalf("args length = %d, want %d, args=%v", len(launch.cmd.Args), len(want), launch.cmd.Args)
	}
	for i, w := range want {
		if launch.cmd.Args[i] != w {
			t.Fatalf("args[%d] = %q, want %q, full args=%v", i, launch.cmd.Args[i], w, launch.cmd.Args)
		}
	}
}

func TestMCPEditConfigLaunchEditorParsesShellStyleQuotes(t *testing.T) {
	path := "/tmp/voltui.toml"
	cases := []struct {
		name       string
		editor     string
		wantEditor string
		wantArgs   []string
	}{
		{
			name:       "empty fallback arg",
			editor:     "emacsclient -c -a ''",
			wantEditor: "emacsclient",
			wantArgs:   []string{"emacsclient", "-c", "-a", "", path},
		},
		{
			name:       "quoted editor path",
			editor:     "'/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code' --wait",
			wantEditor: "/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code",
			wantArgs:   []string{"/Applications/Visual Studio Code.app/Contents/Resources/app/bin/code", "--wait", path},
		},
		{
			name:       "escaped whitespace",
			editor:     `/opt/My\ Editor/bin/edit --flag`,
			wantEditor: "/opt/My Editor/bin/edit",
			wantArgs:   []string{"/opt/My Editor/bin/edit", "--flag", path},
		},
		{
			name:       "quoted arg",
			editor:     `nvim --cmd "set tabstop=2"`,
			wantEditor: "nvim",
			wantArgs:   []string{"nvim", "--cmd", "set tabstop=2", path},
		},
		{
			name:       "double quoted literal backslashes",
			editor:     `nvim "C:\tmp\file"`,
			wantEditor: "nvim",
			wantArgs:   []string{"nvim", `C:\tmp\file`, path},
		},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("VISUAL", c.editor)
			t.Setenv("EDITOR", "")
			launch, err := mcpEditConfigLaunchCommand(path, func(string) (string, error) {
				t.Fatal("lookPath should not be called when VISUAL is set")
				return "", errors.New("unexpected lookup")
			})
			if err != nil {
				t.Fatalf("edit command: %v", err)
			}
			if launch.editor != c.wantEditor {
				t.Fatalf("editor display name = %q, want %q", launch.editor, c.wantEditor)
			}
			if !reflect.DeepEqual(launch.cmd.Args, c.wantArgs) {
				t.Fatalf("args = %#v, want %#v", launch.cmd.Args, c.wantArgs)
			}
		})
	}
}

func TestMCPEditConfigLaunchEditorRejectsUnterminatedQuote(t *testing.T) {
	t.Setenv("VISUAL", `code --wait "unterminated`)
	t.Setenv("EDITOR", "")

	_, err := mcpEditConfigLaunchCommand("/tmp/voltui.toml", func(string) (string, error) {
		t.Fatal("lookPath should not be called when VISUAL is set")
		return "", errors.New("unexpected lookup")
	})
	if err == nil {
		t.Fatal("expected unterminated quote error")
	}
}

// TestMCPEditConfigLaunchEditorRejectsShellMetachars confirms that shell
// metacharacters in EDITOR/VISUAL are rejected before launch — the previous
// sh -lc construction would have run "rm" here.
func TestMCPEditConfigLaunchEditorRejectsShellMetachars(t *testing.T) {
	t.Setenv("VISUAL", "")
	t.Setenv("EDITOR", "vim; rm -rf /tmp/should-not-exist")

	path := "/tmp/voltui.toml"
	_, err := mcpEditConfigLaunchCommand(path, func(string) (string, error) {
		t.Fatal("lookPath should not be called when EDITOR is set")
		return "", errors.New("unexpected lookup")
	})
	if err == nil || !strings.Contains(err.Error(), "shell control syntax") {
		t.Fatalf("expected shell control rejection, got %v", err)
	}
}

// TestMCPEditConfigLaunchEditorExpandsEnvVar confirms that $VAR references
// in EDITOR/VISUAL are expanded without going through a shell, preserving
// the behavior of the prior sh -lc path for users who set values such as
// EDITOR="$HOME/bin/myeditor" verbatim (rather than relying on the shell
// to expand at export time).
func TestMCPEditConfigLaunchEditorExpandsEnvVar(t *testing.T) {
	t.Setenv("REASONIX_TEST_EDITOR_BIN", "/opt/custom/bin/myed")
	t.Setenv("VISUAL", "$REASONIX_TEST_EDITOR_BIN --flag")
	t.Setenv("EDITOR", "")

	path := "/tmp/voltui.toml"
	launch, err := mcpEditConfigLaunchCommand(path, func(string) (string, error) {
		t.Fatal("lookPath should not be called when VISUAL is set")
		return "", errors.New("unexpected lookup")
	})
	if err != nil {
		t.Fatalf("edit command: %v", err)
	}
	want := []string{"/opt/custom/bin/myed", "--flag", path}
	if len(launch.cmd.Args) != len(want) {
		t.Fatalf("args length = %d, want %d, args=%v", len(launch.cmd.Args), len(want), launch.cmd.Args)
	}
	for i, w := range want {
		if launch.cmd.Args[i] != w {
			t.Fatalf("args[%d] = %q, want %q, full args=%v", i, launch.cmd.Args[i], w, launch.cmd.Args)
		}
	}
}

// TestMCPEditConfigLaunchEditorExpandsTilde confirms that a leading ~ or ~/
// in EDITOR/VISUAL is expanded to the user's home directory without a shell.
func TestMCPEditConfigLaunchEditorExpandsTilde(t *testing.T) {
	home, err := os.UserHomeDir()
	if err != nil {
		t.Skipf("cannot determine home dir: %v", err)
	}
	cases := []struct {
		name   string
		editor string
		want0  string
	}{
		{"tilde_slash", "~/bin/myed", home + "/bin/myed"},
		{"bare_tilde", "~", home},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			t.Setenv("VISUAL", c.editor+" --wait")
			t.Setenv("EDITOR", "")
			launch, err := mcpEditConfigLaunchCommand("/tmp/voltui.toml", func(string) (string, error) {
				t.Fatal("lookPath should not be called when VISUAL is set")
				return "", errors.New("unexpected lookup")
			})
			if err != nil {
				t.Fatalf("edit command: %v", err)
			}
			if launch.cmd.Args[0] != c.want0 {
				t.Fatalf("args[0] = %q, want %q", launch.cmd.Args[0], c.want0)
			}
			if launch.cmd.Args[1] != "--wait" {
				t.Fatalf("args[1] = %q, want --wait", launch.cmd.Args[1])
			}
		})
	}
}

// TestMCPEditConfigLaunchEditorTildeNotInPayload confirms that a tilde
// appearing in an injection payload cannot be used because shell control syntax
// is rejected before any expansion beyond the leading editor token matters.
func TestMCPEditConfigLaunchEditorTildeNotInPayload(t *testing.T) {
	t.Setenv("VISUAL", "")
	t.Setenv("EDITOR", "vim; rm -rf ~/should-not-exist")

	_, err := mcpEditConfigLaunchCommand("/tmp/voltui.toml", func(string) (string, error) {
		t.Fatal("lookPath should not be called when EDITOR is set")
		return "", errors.New("unexpected lookup")
	})
	if err == nil || !strings.Contains(err.Error(), "shell control syntax") {
		t.Fatalf("expected shell control rejection, got %v", err)
	}
}

func TestMCPEditConfigLaunchFallsBackToTerminalEditor(t *testing.T) {
	t.Setenv("VISUAL", "")
	t.Setenv("EDITOR", "")

	launch, err := mcpEditConfigLaunchCommand("/tmp/voltui.toml", func(name string) (string, error) {
		if name == "vim" {
			return "/usr/bin/vim", nil
		}
		return "", errors.New("not found")
	})
	if err != nil {
		t.Fatalf("edit command: %v", err)
	}
	if launch.systemDefault {
		t.Fatalf("terminal editor fallback should not use system default: %+v", launch)
	}
	if launch.editor != "vim" {
		t.Fatalf("editor = %q, want vim", launch.editor)
	}
	if len(launch.cmd.Args) != 2 || launch.cmd.Args[0] != "/usr/bin/vim" || launch.cmd.Args[1] != "/tmp/voltui.toml" {
		t.Fatalf("terminal editor args=%v", launch.cmd.Args)
	}
}

func TestMCPEditConfigLaunchUsesSystemDefaultLast(t *testing.T) {
	t.Setenv("VISUAL", "")
	t.Setenv("EDITOR", "")

	path := "/tmp/voltui.toml"
	launch, err := mcpEditConfigLaunchCommand(path, func(string) (string, error) {
		return "", errors.New("not found")
	})
	if err != nil {
		t.Fatalf("edit command: %v", err)
	}
	if !launch.systemDefault {
		t.Fatalf("missing terminal editors should use system default: %+v", launch)
	}
	want, err := mcpOpenCommand(path)
	if err != nil {
		t.Fatalf("open command: %v", err)
	}
	if len(launch.cmd.Args) == 0 || len(want.Args) == 0 || launch.cmd.Args[0] != want.Args[0] {
		t.Fatalf("system default command = %v, want command starting with %v", launch.cmd.Args, want.Args)
	}
}

func TestApplyMCPModeDropsLegacyTier(t *testing.T) {
	isolateUserConfig(t)
	cfg := config.Default()
	cfg.Plugins = []config.PluginEntry{{Name: "github", Command: "npx", Args: []string{"server"}, Tier: "lazy"}}
	if err := cfg.SaveTo("voltui.toml"); err != nil {
		t.Fatalf("save config: %v", err)
	}

	m := newTestChatTUI()
	m.mcp = &mcpManager{
		stage: mcpStageMode,
		name:  "github",
		snapshot: mcpSnapshot{configPath: "voltui.toml", servers: []mcpServerView{{
			Name: "github", Transport: "stdio", Status: "deferred", Configured: true, Tier: "background",
		}}},
	}
	_, _ = m.applyMCPMode("background")

	loaded, err := config.Load()
	if err != nil {
		t.Fatalf("load config: %v", err)
	}
	if len(loaded.Plugins) != 1 || loaded.Plugins[0].Tier != "" {
		t.Fatalf("tier should be migrated away, plugins=%+v", loaded.Plugins)
	}
	raw, err := os.ReadFile("voltui.toml")
	if err != nil {
		t.Fatalf("read config: %v", err)
	}
	if strings.Contains(string(raw), "\ntier") {
		t.Fatalf("legacy tier should not be written back:\n%s", raw)
	}
}

func TestApplyMCPModeRecordsPluginConnectFailure(t *testing.T) {
	isolateUserConfig(t)
	t.Setenv("PATH", "")
	cfg := config.Default()
	cfg.Plugins = []config.PluginEntry{{Name: "broken", Command: "definitely-missing-voltui-mcp", Tier: "background"}}
	if err := cfg.SaveTo("voltui.toml"); err != nil {
		t.Fatalf("save config: %v", err)
	}

	m := newTestChatTUI()
	m.ctrl = control.New(control.Options{Host: plugin.NewHost()})
	defer m.ctrl.Close()
	m.host = m.ctrl.Host()
	m.mcp = &mcpManager{
		stage: mcpStageMode,
		name:  "broken",
		snapshot: mcpSnapshot{configPath: "voltui.toml", servers: []mcpServerView{{
			Name: "broken", Transport: "stdio", Status: "deferred", Configured: true, Tier: "background",
		}}},
	}

	_, _ = m.applyMCPMode("background")

	failures := m.ctrl.Host().Failures()
	if len(failures) != 1 || failures[0].Name != "broken" {
		t.Fatalf("Host.Failures() = %+v, want broken failure", failures)
	}
	v, ok := m.mcp.selectedServer()
	if !ok {
		t.Fatal("selected server missing after refresh")
	}
	if v.Status != "failed" {
		t.Fatalf("server status = %q, want failed; server = %+v", v.Status, v)
	}
}

func TestMCPManagerEscFromDetailReturnsToList(t *testing.T) {
	m := newTestChatTUI()
	m.mcp = &mcpManager{
		stage: mcpStageDetail,
		name:  "managed-search",
		snapshot: mcpSnapshot{servers: []mcpServerView{{
			Name: "managed-search", Transport: "stdio", Status: "connected", BuiltIn: true,
		}}},
	}

	got, _ := m.handleMCPManagerKey(tea.KeyPressMsg{Code: tea.KeyEscape})
	next := got.(chatTUI)
	if next.mcp == nil || next.mcp.stage != mcpStageList {
		t.Fatalf("Esc from detail should return to list, got %#v", next.mcp)
	}
}
