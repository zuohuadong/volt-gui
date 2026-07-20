package builtinmcp

import (
	"archive/zip"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
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
	t.Setenv(computerUseRuntimeEnv, "")
	t.Setenv(computerUseNodeEnv, "")
	t.Setenv(computerUseRuntimeDirEnv, "")

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

func TestComputerUseEntryUsesBundledServerAndRuntimeOverride(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(computerUseResourceDirEnv, dir)
	t.Setenv(computerUseRuntimeEnv, "/opt/voltui/bun/bin/bun")

	entry, ok := Entry(ComputerUseName)
	if !ok {
		t.Fatal("computer-use built-in entry missing")
	}
	if entry.Command != "/opt/voltui/bun/bin/bun" {
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

func TestComputerUseRuntimeUsesBundledBunBeforeSystemRuntime(t *testing.T) {
	dir := t.TempDir()
	t.Setenv(computerUseRuntimeEnv, "")
	t.Setenv(computerUseNodeEnv, "")
	bundled := filepath.Join(dir, computerUseBunRelPath())
	if err := os.MkdirAll(filepath.Dir(bundled), 0o755); err != nil {
		t.Fatalf("mkdir bundled bun dir: %v", err)
	}
	if err := os.WriteFile(bundled, []byte("#!/bin/sh\n"), 0o755); err != nil {
		t.Fatalf("write bundled bun: %v", err)
	}
	t.Setenv(computerUseRuntimeDirEnv, dir)
	lookPath = func(file string) (string, error) {
		if file == "bun" {
			return "/usr/bin/bun", nil
		}
		return "", errors.New("not found")
	}
	t.Cleanup(func() { lookPath = lookPathDefault })

	if got := computerUseRuntimeCommand(); got != bundled {
		t.Fatalf("computerUseRuntimeCommand = %q, want bundled bun %q", got, bundled)
	}
}

func TestComputerUseEntryFindsResourcesStagedForWindowsBuildOutput(t *testing.T) {
	dir := t.TempDir()
	executable := filepath.Join(dir, "desktop", "build", "bin", "voltui-desktop.exe")
	resourceDir := filepath.Join(dir, "desktop", "build", "windows", "installer", computerUseResourceDirName)
	runtimeDir := filepath.Join(dir, "desktop", "build", "windows", "installer", computerUseRuntimeDirName)
	server := filepath.Join(resourceDir, filepath.FromSlash(computerUseServerRelPath))
	bundledRuntime := filepath.Join(runtimeDir, computerUseBunRelPath())
	for _, path := range []string{server, bundledRuntime} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("mkdir staged resource: %v", err)
		}
		if err := os.WriteFile(path, []byte("fixture"), 0o755); err != nil {
			t.Fatalf("write staged resource: %v", err)
		}
	}

	currentExecutable = func() (string, error) { return executable, nil }
	lookPath = func(string) (string, error) { return "", errors.New("not found") }
	t.Cleanup(func() {
		currentExecutable = executablePathDefault
		lookPath = lookPathDefault
	})
	t.Setenv(computerUseResourceDirEnv, "")
	t.Setenv(computerUseRuntimeEnv, "")
	t.Setenv(computerUseNodeEnv, "")
	t.Setenv(computerUseRuntimeDirEnv, "")

	entry, ok := Entry(ComputerUseName)
	if !ok {
		t.Fatal("computer-use built-in entry missing")
	}
	if entry.Command != bundledRuntime {
		t.Fatalf("computer-use command = %q, want staged runtime %q", entry.Command, bundledRuntime)
	}
	if !reflect.DeepEqual(entry.Args, []string{server}) {
		t.Fatalf("computer-use args = %+v, want staged server %q", entry.Args, server)
	}
}

func TestComputerUseRuntimeKeepsLegacyNodeOverride(t *testing.T) {
	t.Setenv(computerUseRuntimeEnv, "")
	t.Setenv(computerUseNodeEnv, "/opt/node/bin/node")
	if got := computerUseRuntimeCommand(); got != "/opt/node/bin/node" {
		t.Fatalf("computerUseRuntimeCommand legacy override = %q, want node path", got)
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
				Name        string `json:"name"`
				Description string `json:"description"`
			} `json:"tools"`
		} `json:"result"`
	}
	if err := json.Unmarshal([]byte(lines[1]), &resp); err != nil {
		t.Fatalf("decode tools/list response: %v", err)
	}
	got := make(map[string]string, len(resp.Result.Tools))
	for _, tool := range resp.Result.Tools {
		got[tool.Name] = tool.Description
	}
	want := []string{"office_list_apps", "office_read_spreadsheet", "office_count_spreadsheet_column", "office_read_xlsx", "office_count_xlsx_column", "office_read_document", "office_read_presentation", "office_open_document", "office_convert_to_pdf"}
	for _, name := range want {
		if _, ok := got[name]; !ok {
			t.Fatalf("office MCP tools = %+v, missing %q", got, name)
		}
	}
	if !strings.Contains(got["office_read_spreadsheet"], ".xlsx or BIFF8 .xls") || !strings.Contains(got["office_read_spreadsheet"], "instead of computer-use scripts") || !strings.Contains(got["office_count_spreadsheet_column"], "without Microsoft Office") {
		t.Fatalf("spreadsheet tools must support .xls/.xlsx without Office and prioritize structured reads: %+v", got)
	}
}

func TestOfficeDocumentAndPresentationToolsAreRegisteredAndRequirePath(t *testing.T) {
	for _, name := range []string{"office_read_document", "office_read_presentation"} {
		t.Run(name, func(t *testing.T) {
			result, rpcErr := callOfficeTool(json.RawMessage(`{"name":` + strconv.Quote(name) + `,"arguments":{}}`))
			if rpcErr != nil {
				t.Fatalf("callOfficeTool(%q) rpc error = %#v, want a tool result", name, rpcErr)
			}
			b, err := json.Marshal(result)
			if err != nil {
				t.Fatalf("marshal result: %v", err)
			}
			if !strings.Contains(string(b), `"isError":true`) || !strings.Contains(string(b), "path is required") {
				t.Fatalf("tool %q result = %s, want actionable path error", name, b)
			}
		})
	}
}

func TestOfficeReadDocumentReadsParagraphsAndBoundedTablesWithoutOffice(t *testing.T) {
	path := writeMinimalOfficeDOCX(t)
	text := officeToolText(t, json.RawMessage(`{"name":"office_read_document","arguments":{"path":`+strconv.Quote(path)+`,"max_blocks":2,"max_table_rows":1}}`))
	var got struct {
		Format         string `json:"format"`
		TotalBlocks    int    `json:"total_blocks"`
		ReturnedBlocks int    `json:"returned_blocks"`
		MaxBlocks      int    `json:"max_blocks"`
		MaxTableRows   int    `json:"max_table_rows"`
		Truncated      bool   `json:"truncated"`
		Blocks         []struct {
			Type         string     `json:"type"`
			Text         string     `json:"text"`
			Rows         [][]string `json:"rows"`
			TotalRows    int        `json:"total_rows"`
			ReturnedRows int        `json:"returned_rows"`
			Truncated    bool       `json:"truncated"`
		} `json:"blocks"`
	}
	if err := json.Unmarshal([]byte(text), &got); err != nil {
		t.Fatalf("decode office_read_document result: %v\n%s", err, text)
	}
	if got.Format != "docx" || got.TotalBlocks != 3 || got.ReturnedBlocks != 2 || got.MaxBlocks != 2 || got.MaxTableRows != 1 || !got.Truncated {
		t.Fatalf("document metadata = %+v, want bounded DOCX result", got)
	}
	if len(got.Blocks) != 2 || got.Blocks[0].Type != "paragraph" || got.Blocks[0].Text != "第一段\t续行\n换行" {
		t.Fatalf("document paragraph blocks = %+v, want paragraph text in document order", got.Blocks)
	}
	table := got.Blocks[1]
	if table.Type != "table" || !reflect.DeepEqual(table.Rows, [][]string{{"甲", "乙"}}) || table.TotalRows != 2 || table.ReturnedRows != 1 || !table.Truncated {
		t.Fatalf("document table block = %+v, want first bounded table row", table)
	}
}

func TestOfficeReadPresentationUsesPresentationRelationshipOrderAndExtractsText(t *testing.T) {
	path := writeMinimalOfficePPTX(t)
	text := officeToolText(t, json.RawMessage(`{"name":"office_read_presentation","arguments":{"path":`+strconv.Quote(path)+`,"max_slides":1}}`))
	var got struct {
		Format         string `json:"format"`
		TotalSlides    int    `json:"total_slides"`
		ReturnedSlides int    `json:"returned_slides"`
		MaxSlides      int    `json:"max_slides"`
		Truncated      bool   `json:"truncated"`
		Slides         []struct {
			Index      int          `json:"index"`
			Title      string       `json:"title"`
			TextBlocks []string     `json:"text_blocks"`
			Tables     [][][]string `json:"tables"`
		} `json:"slides"`
	}
	if err := json.Unmarshal([]byte(text), &got); err != nil {
		t.Fatalf("decode office_read_presentation result: %v\n%s", err, text)
	}
	if got.Format != "pptx" || got.TotalSlides != 2 || got.ReturnedSlides != 1 || got.MaxSlides != 1 || !got.Truncated {
		t.Fatalf("presentation metadata = %+v, want first presentation-ordered slide only", got)
	}
	if len(got.Slides) != 1 || got.Slides[0].Index != 1 || got.Slides[0].Title != "第二页标题" || !reflect.DeepEqual(got.Slides[0].TextBlocks, []string{"正文一\n正文二"}) || !reflect.DeepEqual(got.Slides[0].Tables, [][][]string{{{"表格甲", "表格乙"}}}) {
		t.Fatalf("presentation slide = %+v, want relationship-ordered title/text/table", got.Slides)
	}
}

func TestOfficeDocumentAndPresentationReturnActionableLegacyAndUnsafeRelationshipErrors(t *testing.T) {
	for _, tt := range []struct {
		name string
		tool string
		path string
		want string
	}{
		{name: "legacy doc", tool: "office_read_document", path: filepath.Join(t.TempDir(), "legacy.doc"), want: "legacy binary .doc is not supported; save it as .docx"},
		{name: "legacy ppt", tool: "office_read_presentation", path: filepath.Join(t.TempDir(), "legacy.ppt"), want: "legacy binary .ppt is not supported; save it as .pptx"},
		{name: "external slide relationship", tool: "office_read_presentation", path: writeUnsafeOfficePPTX(t), want: "external slide relationships are not supported"},
		{name: "out of bounds slide relationship", tool: "office_read_presentation", path: writeOutOfBoundsOfficePPTX(t), want: "slide relationship target must remain within ppt/slides"},
	} {
		t.Run(tt.name, func(t *testing.T) {
			text, isError := officeToolResultText(t, json.RawMessage(`{"name":`+strconv.Quote(tt.tool)+`,"arguments":{"path":`+strconv.Quote(tt.path)+`}}`))
			if !isError || !strings.Contains(text, tt.want) {
				t.Fatalf("%s result = error:%t text:%q, want %q", tt.tool, isError, text, tt.want)
			}
		})
	}
}

func TestOfficeOOXMLReaderRejectsUnsafeZIPEntries(t *testing.T) {
	validDocument := `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`
	for _, tt := range []struct {
		name    string
		entries []officeZIPTestEntry
		want    string
	}{
		{
			name: "duplicate entry",
			entries: []officeZIPTestEntry{
				{Name: "word/document.xml", Body: validDocument},
				{Name: "word/document.xml", Body: validDocument},
			},
			want: "duplicate ZIP entry",
		},
		{
			name: "path traversal",
			entries: []officeZIPTestEntry{
				{Name: "../word/document.xml", Body: validDocument},
			},
			want: "unsafe ZIP entry path",
		},
		{
			name: "absolute path",
			entries: []officeZIPTestEntry{
				{Name: "/word/document.xml", Body: validDocument},
			},
			want: "unsafe ZIP entry path",
		},
		{
			name: "symbolic link",
			entries: []officeZIPTestEntry{
				{Name: "word/document.xml", Body: "elsewhere", Mode: os.ModeSymlink | 0o777},
			},
			want: "symbolic-link ZIP entry",
		},
	} {
		t.Run(tt.name, func(t *testing.T) {
			path := writeOfficeZIPEntries(t, "unsafe.docx", tt.entries)
			text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_document","arguments":{"path":`+strconv.Quote(path)+`}}`))
			if !isError || !strings.Contains(text, tt.want) {
				t.Fatalf("unsafe ZIP result = error:%t text:%q, want %q", isError, text, tt.want)
			}
		})
	}
}

func TestOfficeOOXMLReaderAllowsSafeDirectoryEntries(t *testing.T) {
	path := writeOfficeZIPEntries(t, "directory-entries.docx", []officeZIPTestEntry{
		{Name: "word/", Mode: os.ModeDir | 0o755},
		{Name: "word/", Mode: os.ModeDir | 0o755},
		{Name: "word/document.xml", Body: `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body/></w:document>`},
	})
	text := officeToolText(t, json.RawMessage(`{"name":"office_read_document","arguments":{"path":`+strconv.Quote(path)+`}}`))
	if !strings.Contains(text, `"format":"docx"`) || !strings.Contains(text, `"total_blocks":0`) {
		t.Fatalf("directory-entry document result = %s, want readable empty docx", text)
	}
}

func TestOfficeOOXMLReadersRejectExcessiveStructuredContent(t *testing.T) {
	t.Run("docx tables", func(t *testing.T) {
		path := writeOfficeZIPArchive(t, "too-many-tables.docx", map[string]string{
			"word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="urn:test"><w:body>` + strings.Repeat(`<w:tbl/>`, 257) + `</w:body></w:document>`,
		})
		text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_document","arguments":{"path":`+strconv.Quote(path)+`}}`))
		if !isError || !strings.Contains(text, "docx has more than 256 tables") {
			t.Fatalf("too-many-tables result = error:%t text:%q, want table structural limit", isError, text)
		}
	})

	t.Run("docx cells", func(t *testing.T) {
		cells := strings.Repeat(`<w:tc><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc>`, 2049)
		path := writeOfficeZIPArchive(t, "too-many-cells.docx", map[string]string{
			"word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="urn:test"><w:body><w:tbl><w:tr>` + cells + `</w:tr></w:tbl></w:body></w:document>`,
		})
		text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_document","arguments":{"path":`+strconv.Quote(path)+`}}`))
		if !isError || !strings.Contains(text, "docx table row has more than 2048 cells") {
			t.Fatalf("too-many-cells result = error:%t text:%q, want cell structural limit", isError, text)
		}
	})

	t.Run("pptx relationships", func(t *testing.T) {
		var relationships strings.Builder
		for i := 0; i < 4096; i++ {
			fmt.Fprintf(&relationships, `<Relationship Id="x%d" Type="urn:test/image" Target="media/image.png"/>`, i)
		}
		path := writeOfficeZIPArchive(t, "too-many-relationships.pptx", map[string]string{
			"ppt/presentation.xml":            `<?xml version="1.0"?><p:presentation xmlns:p="urn:test" xmlns:r="urn:r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>`,
			"ppt/_rels/presentation.xml.rels": `<Relationships>` + `<Relationship Id="rId1" Type="urn:test/slide" Target="slides/slide1.xml"/>` + relationships.String() + `</Relationships>`,
			"ppt/slides/slide1.xml":           `<?xml version="1.0"?><p:sld xmlns:p="urn:test"/>`,
		})
		text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_presentation","arguments":{"path":`+strconv.Quote(path)+`}}`))
		if !isError || !strings.Contains(text, "pptx has more than 4096 relationships") {
			t.Fatalf("too-many-relationships result = error:%t text:%q, want relationship structural limit", isError, text)
		}
	})

	t.Run("pptx shapes and tables", func(t *testing.T) {
		path := writeOfficeZIPArchive(t, "too-many-shapes.pptx", map[string]string{
			"ppt/presentation.xml":            `<?xml version="1.0"?><p:presentation xmlns:p="urn:test" xmlns:r="urn:r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>`,
			"ppt/_rels/presentation.xml.rels": `<Relationships><Relationship Id="rId1" Type="urn:test/slide" Target="slides/slide1.xml"/></Relationships>`,
			"ppt/slides/slide1.xml":           `<?xml version="1.0"?><p:sld xmlns:p="urn:test" xmlns:a="urn:a"><p:cSld><p:spTree>` + strings.Repeat(`<p:sp/>`, 257) + strings.Repeat(`<a:tbl/>`, 257) + `</p:spTree></p:cSld></p:sld>`,
		})
		text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_presentation","arguments":{"path":`+strconv.Quote(path)+`}}`))
		if !isError || !strings.Contains(text, "pptx slide has more than 256 shapes") {
			t.Fatalf("too-many-shapes result = error:%t text:%q, want shape structural limit before table allocation", isError, text)
		}
	})

	t.Run("pptx tables", func(t *testing.T) {
		path := writeOfficeZIPArchive(t, "too-many-tables.pptx", map[string]string{
			"ppt/presentation.xml":            `<?xml version="1.0"?><p:presentation xmlns:p="urn:test" xmlns:r="urn:r"><p:sldIdLst><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>`,
			"ppt/_rels/presentation.xml.rels": `<Relationships><Relationship Id="rId1" Type="urn:test/slide" Target="slides/slide1.xml"/></Relationships>`,
			"ppt/slides/slide1.xml":           `<?xml version="1.0"?><p:sld xmlns:p="urn:test" xmlns:a="urn:a"><p:cSld><p:spTree>` + strings.Repeat(`<a:tbl/>`, 257) + `</p:spTree></p:cSld></p:sld>`,
		})
		text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_presentation","arguments":{"path":`+strconv.Quote(path)+`}}`))
		if !isError || !strings.Contains(text, "pptx slide has more than 256 tables") {
			t.Fatalf("too-many-tables result = error:%t text:%q, want table structural limit", isError, text)
		}
	})
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

func TestOfficeReadXLSXReadsSelectedSheetWithSharedAndInlineStrings(t *testing.T) {
	path := writeMinimalOfficeXLSX(t)
	params := json.RawMessage(`{"name":"office_read_xlsx","arguments":{"path":` + strconv.Quote(path) + `,"sheet":"设备清单","max_rows":2}}`)

	text := officeToolText(t, params)
	var got struct {
		Sheet         string              `json:"sheet"`
		Sheets        []string            `json:"sheets"`
		Headers       []string            `json:"headers"`
		Rows          []map[string]string `json:"rows"`
		TotalDataRows int                 `json:"total_data_rows"`
		Truncated     bool                `json:"truncated"`
	}
	if err := json.Unmarshal([]byte(text), &got); err != nil {
		t.Fatalf("decode office_read_xlsx result: %v\n%s", err, text)
	}
	if got.Sheet != "设备清单" || !reflect.DeepEqual(got.Sheets, []string{"设备清单", "说明"}) {
		t.Fatalf("selected/available sheets = %q/%+v, want 设备清单/[设备清单 说明]", got.Sheet, got.Sheets)
	}
	if !reflect.DeepEqual(got.Headers, []string{"设备责任人", "设备名称"}) {
		t.Fatalf("headers = %+v, want [设备责任人 设备名称]", got.Headers)
	}
	wantRows := []map[string]string{
		{"设备责任人": "张三", "设备名称": "电脑A"},
		{"设备责任人": "李四", "设备名称": "平板C"},
	}
	if !reflect.DeepEqual(got.Rows, wantRows) || got.TotalDataRows != 3 || !got.Truncated {
		t.Fatalf("rows/total/truncated = %+v/%d/%t, want %+v/3/true", got.Rows, got.TotalDataRows, got.Truncated, wantRows)
	}
}

func TestOfficeCountXLSXColumnCountsNonEmptyValuesByHeader(t *testing.T) {
	path := writeMinimalOfficeXLSX(t)
	params := json.RawMessage(`{"name":"office_count_xlsx_column","arguments":{"path":` + strconv.Quote(path) + `,"sheet":"设备清单","column":"设备责任人"}}`)

	text := officeToolText(t, params)
	var got struct {
		Sheet         string         `json:"sheet"`
		Column        string         `json:"column"`
		DataRows      int            `json:"data_rows"`
		NonEmptyCount int            `json:"non_empty_count"`
		ValueCounts   map[string]int `json:"value_counts"`
	}
	if err := json.Unmarshal([]byte(text), &got); err != nil {
		t.Fatalf("decode office_count_xlsx_column result: %v\n%s", err, text)
	}
	if got.Sheet != "设备清单" || got.Column != "设备责任人" || got.DataRows != 3 || got.NonEmptyCount != 2 {
		t.Fatalf("count metadata = %+v, want sheet=设备清单 column=设备责任人 data_rows=3 non_empty_count=2", got)
	}
	want := map[string]int{"张三": 1, "李四": 1}
	if !reflect.DeepEqual(got.ValueCounts, want) {
		t.Fatalf("value_counts = %+v, want %+v", got.ValueCounts, want)
	}
}

func TestOfficeReadSpreadsheetKeepsXLSXCompatibility(t *testing.T) {
	path := writeMinimalOfficeXLSX(t)
	text := officeToolText(t, json.RawMessage(`{"name":"office_read_spreadsheet","arguments":{"path":`+strconv.Quote(path)+`,"sheet":"设备清单","max_rows":1}}`))
	var got struct {
		Headers []string            `json:"headers"`
		Rows    []map[string]string `json:"rows"`
	}
	if err := json.Unmarshal([]byte(text), &got); err != nil {
		t.Fatalf("decode generic xlsx read result: %v\n%s", err, text)
	}
	if !reflect.DeepEqual(got.Headers, []string{"设备责任人", "设备名称"}) || len(got.Rows) != 1 || got.Rows[0]["设备责任人"] != "张三" {
		t.Fatalf("generic xlsx result = %+v, want existing xlsx headers and rows", got)
	}
}

func TestOfficeSpreadsheetToolsReadAndCountRealXLSWithoutOffice(t *testing.T) {
	path := filepath.Join("testdata", "office-table.xls")
	readParams := json.RawMessage(`{"name":"office_read_spreadsheet","arguments":{"path":` + strconv.Quote(path) + `,"max_rows":3}}`)

	text := officeToolText(t, readParams)
	var got struct {
		Path    string              `json:"path"`
		Sheet   string              `json:"sheet"`
		Sheets  []string            `json:"sheets"`
		Headers []string            `json:"headers"`
		Rows    []map[string]string `json:"rows"`
	}
	if err := json.Unmarshal([]byte(text), &got); err != nil {
		t.Fatalf("decode office_read_spreadsheet .xls result: %v\n%s", err, text)
	}
	if !strings.EqualFold(filepath.Ext(got.Path), ".xls") || got.Sheet == "" || len(got.Sheets) == 0 || len(got.Headers) == 0 || len(got.Rows) == 0 {
		t.Fatalf(".xls result = %+v, want path, sheets, headers, and rows", got)
	}

	column := ""
	for _, header := range got.Headers {
		if header != "" {
			column = header
			break
		}
	}
	if column == "" {
		t.Fatalf(".xls headers = %+v, want a non-empty header", got.Headers)
	}
	countParams := json.RawMessage(`{"name":"office_count_spreadsheet_column","arguments":{"path":` + strconv.Quote(path) + `,"sheet":` + strconv.Quote(got.Sheet) + `,"column":` + strconv.Quote(column) + `}}`)
	countText := officeToolText(t, countParams)
	var counted struct {
		Column        string         `json:"column"`
		NonEmptyCount int            `json:"non_empty_count"`
		ValueCounts   map[string]int `json:"value_counts"`
	}
	if err := json.Unmarshal([]byte(countText), &counted); err != nil {
		t.Fatalf("decode office_count_spreadsheet_column .xls result: %v\n%s", err, countText)
	}
	if counted.Column != column || counted.NonEmptyCount == 0 || len(counted.ValueCounts) == 0 {
		t.Fatalf(".xls count = %+v, want non-empty exact-column counts for %q", counted, column)
	}
}

func TestOfficeSpreadsheetToolsRejectMalformedAndUnsafeXLS(t *testing.T) {
	malformed := filepath.Join(t.TempDir(), "malformed.xls")
	if err := os.WriteFile(malformed, []byte("not a compound file"), 0o644); err != nil {
		t.Fatalf("write malformed .xls: %v", err)
	}
	text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_spreadsheet","arguments":{"path":`+strconv.Quote(malformed)+`}}`))
	if !isError || !strings.Contains(text, "invalid .xls file") {
		t.Fatalf("malformed .xls result = error:%t text:%q, want invalid .xls error", isError, text)
	}

	oversized := filepath.Join(t.TempDir(), "oversized.xls")
	if err := os.WriteFile(oversized, []byte("x"), 0o644); err != nil {
		t.Fatalf("write oversized .xls: %v", err)
	}
	if err := os.Truncate(oversized, officeXLSMaxFileBytes+1); err != nil {
		t.Fatalf("extend .xls fixture: %v", err)
	}
	text, isError = officeToolResultText(t, json.RawMessage(`{"name":"office_read_spreadsheet","arguments":{"path":`+strconv.Quote(oversized)+`}}`))
	if !isError || !strings.Contains(text, "exceeds maximum file size") {
		t.Fatalf("oversized .xls result = error:%t text:%q, want file-size guard", isError, text)
	}

	t.Run("encrypted workbook", func(t *testing.T) {
		data, err := os.ReadFile(filepath.Join("testdata", "office-table.xls"))
		if err != nil {
			t.Fatalf("read .xls fixture: %v", err)
		}
		// The known fixture's Workbook stream starts at offset 0x600. Its first
		// post-BOF record starts at 0x614; changing only the record type safely
		// exercises the FILEPASS rejection without relying on installed Office.
		if len(data) <= 0x615 {
			t.Fatal("xls fixture is unexpectedly too small")
		}
		data[0x614], data[0x615] = 0x2F, 0x00
		encrypted := filepath.Join(t.TempDir(), "encrypted.xls")
		if err := os.WriteFile(encrypted, data, 0o644); err != nil {
			t.Fatalf("write encrypted .xls fixture: %v", err)
		}
		text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_spreadsheet","arguments":{"path":`+strconv.Quote(encrypted)+`}}`))
		if !isError || !strings.Contains(text, "encrypted .xls workbooks are not supported") {
			t.Fatalf("encrypted .xls result = error:%t text:%q, want explicit encryption error", isError, text)
		}
	})

	t.Run("pre BIFF8 workbook", func(t *testing.T) {
		data, err := os.ReadFile(filepath.Join("testdata", "office-table.xls"))
		if err != nil {
			t.Fatalf("read .xls fixture: %v", err)
		}
		// The fixture's Workbook BOF data starts at 0x604. Changing its version to
		// BIFF5 proves that the public MCP path rejects old BIFF explicitly.
		if len(data) <= 0x605 {
			t.Fatal("xls fixture is unexpectedly too small")
		}
		data[0x604], data[0x605] = 0x00, 0x05
		legacy := filepath.Join(t.TempDir(), "legacy.xls")
		if err := os.WriteFile(legacy, data, 0o644); err != nil {
			t.Fatalf("write BIFF5 .xls fixture: %v", err)
		}
		text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_spreadsheet","arguments":{"path":`+strconv.Quote(legacy)+`}}`))
		if !isError || !strings.Contains(text, "only BIFF8") {
			t.Fatalf("BIFF5 .xls result = error:%t text:%q, want explicit BIFF8-only error", isError, text)
		}
	})

	t.Run("non regular path", func(t *testing.T) {
		if runtime.GOOS == "windows" {
			t.Skip("Unix socket fixture is not portable to Windows")
		}
		placeholder, err := os.CreateTemp("/tmp", "voltui-xls-socket-*")
		if err != nil {
			t.Fatalf("reserve Unix socket fixture path: %v", err)
		}
		path := placeholder.Name() + ".xls"
		if err := placeholder.Close(); err != nil {
			t.Fatalf("close Unix socket path reservation: %v", err)
		}
		if err := os.Remove(placeholder.Name()); err != nil {
			t.Fatalf("release Unix socket path reservation: %v", err)
		}
		listener, err := net.Listen("unix", path)
		if err != nil {
			t.Fatalf("create Unix socket fixture: %v", err)
		}
		t.Cleanup(func() { _ = listener.Close() })
		text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_spreadsheet","arguments":{"path":`+strconv.Quote(path)+`}}`))
		if !isError || !strings.Contains(text, "not a regular file") {
			t.Fatalf("non-regular .xls result = error:%t text:%q, want regular-file guard", isError, text)
		}
	})
}

func TestOfficeXLSXToolsReturnActionableInputErrors(t *testing.T) {
	path := writeMinimalOfficeXLSX(t)
	notXLSX := filepath.Join(t.TempDir(), "devices.xls")
	if err := os.WriteFile(notXLSX, []byte("not an xlsx"), 0o644); err != nil {
		t.Fatalf("write non-xlsx fixture: %v", err)
	}
	emptyPath := writeEmptyOfficeXLSX(t)

	tests := []struct {
		name   string
		params json.RawMessage
		want   string
	}{
		{
			name:   "missing file",
			params: json.RawMessage(`{"name":"office_read_xlsx","arguments":{"path":` + strconv.Quote(filepath.Join(t.TempDir(), "missing.xlsx")) + `}}`),
			want:   "xlsx file not found",
		},
		{
			name:   "non xlsx file",
			params: json.RawMessage(`{"name":"office_read_xlsx","arguments":{"path":` + strconv.Quote(notXLSX) + `}}`),
			want:   "expected a .xlsx file",
		},
		{
			name:   "missing worksheet",
			params: json.RawMessage(`{"name":"office_read_xlsx","arguments":{"path":` + strconv.Quote(path) + `,"sheet":"不存在"}}`),
			want:   "available worksheets: 设备清单, 说明",
		},
		{
			name:   "missing column",
			params: json.RawMessage(`{"name":"office_count_xlsx_column","arguments":{"path":` + strconv.Quote(path) + `,"sheet":"设备清单","column":"不存在"}}`),
			want:   "available headers: 设备责任人, 设备名称",
		},
		{
			name:   "empty worksheet",
			params: json.RawMessage(`{"name":"office_read_xlsx","arguments":{"path":` + strconv.Quote(emptyPath) + `}}`),
			want:   "worksheet \"空表\" is empty; it has no header row",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			text, isError := officeToolResultText(t, tt.params)
			if !isError || !strings.Contains(text, tt.want) {
				t.Fatalf("tool result = error:%t text:%q, want error containing %q", isError, text, tt.want)
			}
		})
	}
}

func TestOfficeReadXLSXSkipsUnselectedWorksheet(t *testing.T) {
	path := writeOfficeXLSXArchive(t, "selected-sheet-only.xlsx", map[string]string{
		"xl/workbook.xml":            `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="目标" sheetId="1" r:id="rId1"/><sheet name="损坏" sheetId="2" r:id="rId2"/></sheets></workbook>`,
		"xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/target.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/missing.xml"/></Relationships>`,
		"xl/worksheets/target.xml":   `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>设备责任人</t></is></c></row><row r="2"><c r="A2" t="inlineStr"><is><t>张三</t></is></c></row></sheetData></worksheet>`,
	})
	params := json.RawMessage(`{"name":"office_read_xlsx","arguments":{"path":` + strconv.Quote(path) + `,"sheet":"目标"}}`)

	text := officeToolText(t, params)
	if !strings.Contains(text, `"sheet":"目标"`) {
		t.Fatalf("office_read_xlsx result = %s, want selected target worksheet", text)
	}
}

func TestOfficeXLSXColumnIndexRejectsColumnsBeyondXFD(t *testing.T) {
	for _, reference := range []string{"XFE1", "ZZZZZZ1"} {
		if _, err := officeXLSXColumnIndex(reference); err == nil || !strings.Contains(err.Error(), "XFD") {
			t.Fatalf("officeXLSXColumnIndex(%q) error = %v, want OOXML XFD limit error", reference, err)
		}
	}
}

func TestOfficeXLSXRejectsArchiveSecurityBudgetViolations(t *testing.T) {
	t.Run("too many entries", func(t *testing.T) {
		files := map[string]string{
			"xl/workbook.xml":            `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="数据" sheetId="1" r:id="rId1"/></sheets></workbook>`,
			"xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
			"xl/worksheets/sheet1.xml":   `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>负责人</t></is></c></row></sheetData></worksheet>`,
		}
		for i := 0; i < 2049; i++ {
			files[fmt.Sprintf("xl/filler/%04d.xml", i)] = "x"
		}
		path := writeOfficeXLSXArchive(t, "too-many-entries.xlsx", files)
		text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_xlsx","arguments":{"path":`+strconv.Quote(path)+`}}`))
		if !isError || !strings.Contains(text, "too many entries") {
			t.Fatalf("tool result = error:%t text:%q, want too many entries error", isError, text)
		}
	})

	t.Run("oversized entry", func(t *testing.T) {
		path := writeOfficeXLSXArchive(t, "oversized-entry.xlsx", map[string]string{
			"xl/workbook.xml":            `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="数据" sheetId="1" r:id="rId1"/></sheets></workbook>`,
			"xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
			"xl/worksheets/sheet1.xml":   `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` + strings.Repeat(" ", 16<<20) + `<sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>负责人</t></is></c></row></sheetData></worksheet>`,
		})
		text, isError := officeToolResultText(t, json.RawMessage(`{"name":"office_read_xlsx","arguments":{"path":`+strconv.Quote(path)+`}}`))
		if !isError || !strings.Contains(text, "entry exceeds") {
			t.Fatalf("tool result = error:%t text:%q, want entry budget error", isError, text)
		}
	})
}

func TestValidateOfficeXLSXPathRejectsNonRegularFile(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("Unix socket fixture is not portable to Windows")
	}
	placeholder, err := os.CreateTemp("/tmp", "voltui-xlsx-socket-*")
	if err != nil {
		t.Fatalf("reserve Unix socket fixture path: %v", err)
	}
	path := placeholder.Name() + ".xlsx"
	if err := placeholder.Close(); err != nil {
		t.Fatalf("close Unix socket path reservation: %v", err)
	}
	if err := os.Remove(placeholder.Name()); err != nil {
		t.Fatalf("release Unix socket path reservation: %v", err)
	}
	listener, err := net.Listen("unix", path)
	if err != nil {
		t.Fatalf("create Unix socket fixture: %v", err)
	}
	t.Cleanup(func() { _ = listener.Close() })

	if _, err := validateOfficeXLSXPath(path); err == nil || !strings.Contains(err.Error(), "not a regular file") {
		t.Fatalf("validateOfficeXLSXPath(%q) error = %v, want non-regular file rejection", path, err)
	}
}

func TestValidateOfficeXLSXPathRejectsOversizedArchiveFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "oversized.xlsx")
	if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
		t.Fatalf("write archive size fixture: %v", err)
	}
	if err := os.Truncate(path, officeXLSXMaxArchiveBytes+1); err != nil {
		t.Fatalf("extend archive size fixture: %v", err)
	}

	if _, err := validateOfficeXLSXPath(path); err == nil || !strings.Contains(err.Error(), "exceeds maximum file size") {
		t.Fatalf("validateOfficeXLSXPath(%q) error = %v, want archive size rejection", path, err)
	}
}

func officeToolText(t *testing.T, params json.RawMessage) string {
	t.Helper()
	text, isError := officeToolResultText(t, params)
	if isError {
		t.Fatalf("MCP result text = %q, want a successful text content", text)
	}
	return text
}

func officeToolResultText(t *testing.T, params json.RawMessage) (string, bool) {
	t.Helper()
	result, rpcErr := callOfficeTool(params)
	if rpcErr != nil {
		t.Fatalf("callOfficeTool returned rpc error: %v", rpcErr)
	}
	var got struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		IsError bool `json:"isError"`
	}
	b, err := json.Marshal(result)
	if err != nil {
		t.Fatalf("marshal result: %v", err)
	}
	if err := json.Unmarshal(b, &got); err != nil {
		t.Fatalf("decode MCP result: %v", err)
	}
	if len(got.Content) != 1 {
		t.Fatalf("MCP result = %s, want one text content", b)
	}
	return got.Content[0].Text, got.IsError
}

func writeMinimalOfficeXLSX(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "devices.xlsx")
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create xlsx fixture: %v", err)
	}
	zw := zip.NewWriter(f)
	files := map[string]string{
		"[Content_Types].xml":        `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>`,
		"xl/workbook.xml":            `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="设备清单" sheetId="1" r:id="rId1"/><sheet name="说明" sheetId="2" r:id="rId2"/></sheets></workbook>`,
		"xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>`,
		"xl/sharedStrings.xml":       `<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="5" uniqueCount="5"><si><t>设备责任人</t></si><si><t>张三</t></si><si><t>设备名称</t></si><si><t>电脑A</t></si></sst>`,
		"xl/worksheets/sheet1.xml":   `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>3</v></c></row><row r="3"><c r="A3" t="inlineStr"><is><t>李四</t></is></c><c r="B3" t="inlineStr"><is><t>平板C</t></is></c></row><row r="4"><c r="B4" t="inlineStr"><is><t>无负责人设备</t></is></c></row></sheetData></worksheet>`,
		"xl/worksheets/sheet2.xml":   `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>说明</t></is></c></row></sheetData></worksheet>`,
	}
	for name, body := range files {
		entry, err := zw.Create(name)
		if err != nil {
			t.Fatalf("create fixture entry %s: %v", name, err)
		}
		if _, err := entry.Write([]byte(body)); err != nil {
			t.Fatalf("write fixture entry %s: %v", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close xlsx fixture zip: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close xlsx fixture: %v", err)
	}
	return path
}

func writeEmptyOfficeXLSX(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "empty.xlsx")
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create empty xlsx fixture: %v", err)
	}
	zw := zip.NewWriter(f)
	files := map[string]string{
		"xl/workbook.xml":            `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="空表" sheetId="1" r:id="rId1"/></sheets></workbook>`,
		"xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
		"xl/worksheets/sheet1.xml":   `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>`,
	}
	for name, body := range files {
		entry, err := zw.Create(name)
		if err != nil {
			t.Fatalf("create empty fixture entry %s: %v", name, err)
		}
		if _, err := entry.Write([]byte(body)); err != nil {
			t.Fatalf("write empty fixture entry %s: %v", name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close empty xlsx fixture zip: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close empty xlsx fixture: %v", err)
	}
	return path
}

func writeOfficeXLSXArchive(t *testing.T, name string, files map[string]string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create xlsx archive: %v", err)
	}
	zw := zip.NewWriter(f)
	for entryName, body := range files {
		entry, err := zw.Create(entryName)
		if err != nil {
			t.Fatalf("create archive entry %s: %v", entryName, err)
		}
		if _, err := entry.Write([]byte(body)); err != nil {
			t.Fatalf("write archive entry %s: %v", entryName, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close xlsx archive zip: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close xlsx archive: %v", err)
	}
	return path
}

func writeMinimalOfficeDOCX(t *testing.T) string {
	t.Helper()
	return writeOfficeZIPArchive(t, "document.docx", map[string]string{
		"word/document.xml": `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
  <w:p><w:r><w:t>第一段</w:t></w:r><w:r><w:tab/></w:r><w:r><w:t>续行</w:t></w:r><w:r><w:br/></w:r><w:r><w:t>换行</w:t></w:r></w:p>
  <w:tbl><w:tr><w:tc><w:p><w:r><w:t>甲</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>乙</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>丙</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>丁</w:t></w:r></w:p></w:tc></w:tr></w:tbl>
  <w:p><w:r><w:t>末段</w:t></w:r></w:p>
</w:body></w:document>`,
	})
}

func writeMinimalOfficePPTX(t *testing.T) string {
	t.Helper()
	return writeOfficeZIPArchive(t, "slides.pptx", map[string]string{
		"ppt/presentation.xml": `<?xml version="1.0" encoding="UTF-8"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`,
		"ppt/_rels/presentation.xml.rels": `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/></Relationships>`,
		"ppt/slides/slide1.xml": `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>第一页正文</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`,
		"ppt/slides/slide2.xml": `<?xml version="1.0" encoding="UTF-8"?>
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>
<p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>第二页标题</a:t></a:r></a:p></p:txBody></p:sp>
<p:sp><p:txBody><a:p><a:r><a:t>正文一</a:t></a:r><a:br/><a:r><a:t>正文二</a:t></a:r></a:p></p:txBody></p:sp>
<p:graphicFrame><a:graphic><a:graphicData><a:tbl><a:tr><a:tc><a:txBody><a:p><a:r><a:t>表格甲</a:t></a:r></a:p></a:txBody></a:tc><a:tc><a:txBody><a:p><a:r><a:t>表格乙</a:t></a:r></a:p></a:txBody></a:tc></a:tr></a:tbl></a:graphicData></a:graphic></p:graphicFrame>
</p:spTree></p:cSld></p:sld>`,
	})
}

func writeUnsafeOfficePPTX(t *testing.T) string {
	t.Helper()
	return writeOfficeZIPArchive(t, "unsafe-slides.pptx", map[string]string{
		"ppt/presentation.xml":            `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
		"ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="https://example.invalid/slide.xml" TargetMode="External"/></Relationships>`,
	})
}

func writeOutOfBoundsOfficePPTX(t *testing.T) string {
	t.Helper()
	return writeOfficeZIPArchive(t, "out-of-bounds-slides.pptx", map[string]string{
		"ppt/presentation.xml":            `<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/></p:sldIdLst></p:presentation>`,
		"ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../evil.xml"/></Relationships>`,
	})
}

func writeOfficeZIPArchive(t *testing.T, name string, files map[string]string) string {
	t.Helper()
	entries := make([]officeZIPTestEntry, 0, len(files))
	for entryName, body := range files {
		entries = append(entries, officeZIPTestEntry{Name: entryName, Body: body})
	}
	return writeOfficeZIPEntries(t, name, entries)
}

type officeZIPTestEntry struct {
	Name string
	Body string
	Mode os.FileMode
}

func writeOfficeZIPEntries(t *testing.T, name string, entries []officeZIPTestEntry) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), name)
	f, err := os.Create(path)
	if err != nil {
		t.Fatalf("create OOXML archive: %v", err)
	}
	zw := zip.NewWriter(f)
	for _, item := range entries {
		header := &zip.FileHeader{Name: item.Name}
		if item.Mode != 0 {
			header.SetMode(item.Mode)
		}
		entry, err := zw.CreateHeader(header)
		if err != nil {
			t.Fatalf("create OOXML entry %s: %v", item.Name, err)
		}
		if _, err := entry.Write([]byte(item.Body)); err != nil {
			t.Fatalf("write OOXML entry %s: %v", item.Name, err)
		}
	}
	if err := zw.Close(); err != nil {
		t.Fatalf("close OOXML archive: %v", err)
	}
	if err := f.Close(); err != nil {
		t.Fatalf("close OOXML fixture: %v", err)
	}
	return path
}
