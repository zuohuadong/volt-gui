package builtinmcp

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strconv"
	"strings"
	"testing"

	"voltui/internal/config"
)

func TestEntries(t *testing.T) {
	currentExecutable = func() (string, error) { return "voltui", nil }
	lookPath = func(file string) (string, error) {
		if file == "npx" {
			return "/usr/bin/npx", nil
		}
		return "", errors.New("not found")
	}
	t.Cleanup(func() {
		currentExecutable = executablePathDefault
		lookPath = lookPathDefault
	})
	t.Setenv(computerUseResourceDirEnv, "/opt/voltui/computer-use-mcp")

	entries := Entries()
	if len(entries) != 4 {
		t.Fatalf("Entries() length = %d, want 4", len(entries))
	}
	want := map[string][]string{
		TimeName:        []string{"builtin-mcp", "time"},
		OfficeName:      []string{"builtin-mcp", "office"},
		ComputerUseName: []string{filepath.Join("/opt/voltui/computer-use-mcp", filepath.FromSlash(computerUseServerRelPath))},
		Context7Name:    []string{"-y", "@upstash/context7-mcp"},
	}
	for _, e := range entries {
		args, ok := want[e.Name]
		if !ok {
			t.Fatalf("unexpected built-in MCP entry: %+v", e)
		}
		wantCommand := map[string]string{
			TimeName:        "voltui",
			OfficeName:      "voltui",
			ComputerUseName: "node",
			Context7Name:    "npx",
		}[e.Name]
		if e.Type != "stdio" || e.Command != wantCommand || e.Tier != "lazy" {
			t.Fatalf("%s type/command/tier = %q/%q/%q, want stdio/%s/lazy", e.Name, e.Type, e.Command, e.Tier, wantCommand)
		}
		if !reflect.DeepEqual(e.Args, args) {
			t.Fatalf("%s args = %+v, want %+v", e.Name, e.Args, args)
		}
		delete(want, e.Name)
	}
	if len(want) != 0 {
		t.Fatalf("missing built-in MCP entries: %+v", want)
	}
}

func TestAppendMissingLetsUserConfigWin(t *testing.T) {
	base := Entries()[:1]
	got := AppendMissing(nil, base)
	if len(got) != 3 || got[0].Name != OfficeName || got[1].Name != ComputerUseName || got[2].Name != Context7Name {
		t.Fatalf("AppendMissing with configured time = %+v, want office + computer-use + context7", got)
	}
}

func TestAppendMissingLetsReservedNamesWin(t *testing.T) {
	got := AppendMissing(nil, nil, TimeName)
	if len(got) != 3 || got[0].Name != OfficeName || got[1].Name != ComputerUseName || got[2].Name != Context7Name {
		t.Fatalf("AppendMissing with reserved time = %+v, want office + computer-use + context7", got)
	}
}

func TestAppendDefaultEnabledAddsDefaultOnBuiltIns(t *testing.T) {
	t.Setenv(enableDefaultBuiltInMCPInTestsEnv, "1")

	got := AppendDefaultEnabled(nil, nil)
	if len(got) != 2 || got[0].Name != OfficeName || got[1].Name != ComputerUseName {
		t.Fatalf("AppendDefaultEnabled = %+v, want office + computer-use", got)
	}
	off := Entries()[1]
	off.Command = "custom-office"
	got = AppendDefaultEnabled(nil, []config.PluginEntry{off})
	if len(got) != 1 || got[0].Name != ComputerUseName {
		t.Fatalf("AppendDefaultEnabled should respect configured office override, got %+v", got)
	}
}

func TestComputerUseEntryUsesBundledServerAndNodeOverride(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(computerUseResourceDirEnv, dir)
	t.Setenv(computerUseNodeEnv, "/opt/node/bin/node")

	entry, ok := Entry(ComputerUseName)
	if !ok {
		t.Fatal("computer-use built-in entry missing")
	}
	if entry.Command != "/opt/node/bin/node" {
		t.Fatalf("computer-use command = %q, want env override", entry.Command)
	}
	want := filepath.Join(dir, filepath.FromSlash(computerUseServerRelPath))
	if len(entry.Args) != 1 || entry.Args[0] != want {
		t.Fatalf("computer-use args = %+v, want [%q]", entry.Args, want)
	}
	if entry.Type != "stdio" || entry.Tier != "lazy" {
		t.Fatalf("computer-use type/tier = %q/%q, want stdio/lazy", entry.Type, entry.Tier)
	}
}

func TestAppendEnabledOnlyAddsEnabledBuiltIns(t *testing.T) {
	got := AppendEnabled(nil, nil, []string{TimeName})
	if len(got) != 1 || got[0].Name != TimeName {
		t.Fatalf("AppendEnabled(time) = %+v, want only time", got)
	}
	if got := AppendEnabled(nil, nil, nil); len(got) != 0 {
		t.Fatalf("AppendEnabled(nil) = %+v, want none", got)
	}
}

func TestContext7CommandFallsBackThroughJSRunners(t *testing.T) {
	lookPath = func(file string) (string, error) {
		if file == "pnpm" {
			return "/usr/bin/pnpm", nil
		}
		return "", errors.New("not found")
	}
	t.Cleanup(func() { lookPath = lookPathDefault })

	cmd, args := context7Command()
	if cmd != "pnpm" || !reflect.DeepEqual(args, []string{"dlx", "@upstash/context7-mcp"}) {
		t.Fatalf("context7Command = %q %+v, want pnpm dlx", cmd, args)
	}
}

func TestServeTimeMCPListsTools(t *testing.T) {
	var out bytes.Buffer
	in := strings.NewReader(
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}` + "\n" +
			`{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}` + "\n" +
			`{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}` + "\n")
	if err := ServeTimeMCP(in, &out, "test"); err != nil {
		t.Fatalf("ServeTimeMCP: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("response lines = %d (%q), want 2", len(lines), out.String())
	}
	var resp struct {
		Result struct {
			Tools []struct {
				Name string `json:"name"`
			} `json:"tools"`
		} `json:"result"`
	}
	if err := json.Unmarshal([]byte(lines[1]), &resp); err != nil {
		t.Fatalf("decode tools/list response: %v", err)
	}
	got := []string{resp.Result.Tools[0].Name, resp.Result.Tools[1].Name}
	want := []string{"get_current_time", "convert_time"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("time MCP tools = %+v, want %+v", got, want)
	}
}

func TestServeOfficeMCPListsTools(t *testing.T) {
	var out bytes.Buffer
	in := strings.NewReader(
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}` + "\n" +
			`{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}` + "\n" +
			`{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}` + "\n")
	if err := ServeOfficeMCP(in, &out, "test"); err != nil {
		t.Fatalf("ServeOfficeMCP: %v", err)
	}
	lines := strings.Split(strings.TrimSpace(out.String()), "\n")
	if len(lines) != 2 {
		t.Fatalf("response lines = %d (%q), want 2", len(lines), out.String())
	}
	var resp struct {
		Result struct {
			Tools []struct {
				Name string `json:"name"`
			} `json:"tools"`
		} `json:"result"`
	}
	if err := json.Unmarshal([]byte(lines[1]), &resp); err != nil {
		t.Fatalf("decode tools/list response: %v", err)
	}
	got := []string{resp.Result.Tools[0].Name, resp.Result.Tools[1].Name, resp.Result.Tools[2].Name}
	want := []string{"office_list_apps", "office_open_document", "office_convert_to_pdf"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("office MCP tools = %+v, want %+v", got, want)
	}
}

func TestOfficeOpenDocumentRejectsUnknownExtension(t *testing.T) {
	dir := t.TempDir()
	path := dir + "/payload.bin"
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	params := json.RawMessage(`{"name":"office_open_document","arguments":{"path":` + strconv.Quote(path) + `}}`)
	result, rpcErr := callOfficeTool(params)
	if rpcErr != nil {
		t.Fatalf("callOfficeTool returned rpc error: %v", rpcErr)
	}
	b, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	if !strings.Contains(string(b), `"isError":true`) || !strings.Contains(string(b), "unsupported file type") {
		t.Fatalf("office_open_document result = %s, want unsupported type error", b)
	}
}
