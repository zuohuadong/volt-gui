package builtinmcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const officeConvertTimeout = 2 * time.Minute

var officeDocumentExtensions = map[string]bool{
	".csv":  true,
	".doc":  true,
	".docm": true,
	".docx": true,
	".dot":  true,
	".dotm": true,
	".dotx": true,
	".odp":  true,
	".ods":  true,
	".odt":  true,
	".pdf":  true,
	".pot":  true,
	".potm": true,
	".potx": true,
	".pps":  true,
	".ppsm": true,
	".ppsx": true,
	".ppt":  true,
	".pptm": true,
	".pptx": true,
	".rtf":  true,
	".txt":  true,
	".xls":  true,
	".xlsb": true,
	".xlsm": true,
	".xlsx": true,
}

// ServeOfficeMCP exposes dependency-free local office helpers over stdio MCP.
func ServeOfficeMCP(in io.Reader, out io.Writer, version string) error {
	r := bufio.NewReader(in)
	w := bufio.NewWriter(out)
	defer w.Flush()

	for {
		line, err := r.ReadBytes('\n')
		if len(strings.TrimSpace(string(line))) > 0 {
			if handleErr := handleOfficeLine(line, w, version); handleErr != nil {
				return handleErr
			}
			if flushErr := w.Flush(); flushErr != nil {
				return flushErr
			}
		}
		if err != nil {
			if err == io.EOF {
				return nil
			}
			return err
		}
	}
}

func handleOfficeLine(line []byte, w *bufio.Writer, version string) error {
	var req timeRequest
	if err := json.Unmarshal(line, &req); err != nil {
		return nil
	}
	if req.ID == nil {
		return nil
	}

	resp := timeResponse{JSONRPC: "2.0", ID: *req.ID}
	switch req.Method {
	case "initialize":
		resp.Result = map[string]any{
			"protocolVersion": protocolVersion,
			"capabilities": map[string]any{
				"tools": map[string]any{},
			},
			"serverInfo": map[string]any{"name": "voltui-office", "version": version},
		}
	case "tools/list":
		resp.Result = map[string]any{"tools": officeTools()}
	case "tools/call":
		resp.Result, resp.Error = callOfficeTool(req.Params)
	default:
		resp.Error = &timeRPCError{Code: -32601, Message: "method not found: " + req.Method}
	}

	b, err := json.Marshal(resp)
	if err != nil {
		return fmt.Errorf("marshal response: %w", err)
	}
	_, err = w.Write(append(b, '\n'))
	return err
}

func officeTools() []map[string]any {
	return []map[string]any{
		{
			"name":        "office_list_apps",
			"description": "Detect local office suites available on this machine, including Microsoft Office, WPS Office, LibreOffice, and the OS default document opener.",
			"inputSchema": map[string]any{
				"type":       "object",
				"properties": map[string]any{},
			},
			"annotations": map[string]any{"readOnlyHint": true, "title": "office_list_apps"},
		},
		{
			"name":        "office_open_document",
			"description": "Open a local document with the OS default opener or a requested office suite. Supports Microsoft Office, WPS Office, and LibreOffice when installed.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"path": map[string]any{"type": "string", "description": "Local document path to open."},
					"suite": map[string]any{
						"type":        "string",
						"description": "Preferred suite: default, microsoft_office, wps, or libreoffice.",
						"enum":        []string{"default", "microsoft_office", "wps", "libreoffice"},
					},
					"app": map[string]any{
						"type":        "string",
						"description": "Optional app hint used when the suite has separate launchers.",
						"enum":        []string{"word", "excel", "powerpoint", "writer", "spreadsheet", "presentation"},
					},
					"allow_any_file": map[string]any{"type": "boolean", "description": "Allow opening a path whose extension is not a known office document type."},
				},
				"required": []string{"path"},
			},
			"annotations": map[string]any{"title": "office_open_document"},
		},
		{
			"name":        "office_convert_to_pdf",
			"description": "Convert a local office document to PDF using LibreOffice or soffice in headless mode when available.",
			"inputSchema": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"path":       map[string]any{"type": "string", "description": "Local office document path to convert."},
					"output_dir": map[string]any{"type": "string", "description": "Optional output directory. Defaults to the source file directory."},
				},
				"required": []string{"path"},
			},
			"annotations": map[string]any{"title": "office_convert_to_pdf"},
		},
	}
}

func callOfficeTool(params json.RawMessage) (any, *timeRPCError) {
	var p struct {
		Name      string         `json:"name"`
		Arguments map[string]any `json:"arguments"`
	}
	if err := json.Unmarshal(params, &p); err != nil {
		return nil, &timeRPCError{Code: -32602, Message: "invalid params: " + err.Error()}
	}
	var (
		text string
		err  error
	)
	switch p.Name {
	case "office_list_apps":
		text, err = officeListApps()
	case "office_open_document":
		text, err = officeOpenDocument(p.Arguments)
	case "office_convert_to_pdf":
		text, err = officeConvertToPDF(p.Arguments)
	default:
		return nil, &timeRPCError{Code: -32602, Message: "unknown tool: " + p.Name}
	}
	if err != nil {
		return timeTextResult(err.Error(), true), nil
	}
	return timeTextResult(text, false), nil
}

type officeCommand struct {
	Command string   `json:"command"`
	Args    []string `json:"args,omitempty"`
	Path    string   `json:"path,omitempty"`
}

type officeAppStatus struct {
	Suite     string        `json:"suite"`
	App       string        `json:"app"`
	Kind      string        `json:"kind"`
	Available bool          `json:"available"`
	Launcher  officeCommand `json:"launcher,omitempty"`
}

func officeListApps() (string, error) {
	items := []officeAppStatus{}
	add := func(suite, app, kind string) {
		launcher, ok := findOfficeCommand(suite, kind)
		items = append(items, officeAppStatus{
			Suite:     suite,
			App:       app,
			Kind:      kind,
			Available: ok,
			Launcher:  launcher,
		})
	}

	add("default", "Default document opener", "document")
	add("microsoft_office", "Microsoft Word", "word_processor")
	add("microsoft_office", "Microsoft Excel", "spreadsheet")
	add("microsoft_office", "Microsoft PowerPoint", "presentation")
	add("wps", "WPS Writer", "word_processor")
	add("wps", "WPS Spreadsheet", "spreadsheet")
	add("wps", "WPS Presentation", "presentation")
	add("libreoffice", "LibreOffice", "suite")

	return marshalTimeResult(map[string]any{
		"platform": runtime.GOOS,
		"apps":     items,
		"notes": []string{
			"Detection is best-effort and never installs software.",
			"Microsoft Office automation beyond opening documents is platform-specific and not attempted by this dependency-free built-in server.",
		},
	})
}

func officeOpenDocument(args map[string]any) (string, error) {
	path, err := validateOfficePath(requiredString(args, "path"), optionalBool(args, "allow_any_file"))
	if err != nil {
		return "", err
	}
	suite := normalizeOfficeSuite(optionalString(args, "suite"))
	kind := officeKindFromApp(optionalString(args, "app"))
	if kind == "" {
		kind = inferOfficeKind(path)
	}
	launcher, ok := findOfficeCommand(suite, kind)
	if !ok {
		return "", fmt.Errorf("%s launcher is not available for %s documents", suite, fallbackOfficeKind(kind))
	}
	cmdArgs := append(append([]string(nil), launcher.Args...), path)
	cmd := exec.Command(launcher.Command, cmdArgs...)
	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("open document: %w", err)
	}
	pid := 0
	if cmd.Process != nil {
		pid = cmd.Process.Pid
		_ = cmd.Process.Release()
	}
	return marshalTimeResult(map[string]any{
		"path":     path,
		"suite":    suite,
		"kind":     fallbackOfficeKind(kind),
		"launcher": append([]string{launcher.Command}, cmdArgs...),
		"pid":      pid,
	})
}

func officeConvertToPDF(args map[string]any) (string, error) {
	path, err := validateOfficePath(requiredString(args, "path"), false)
	if err != nil {
		return "", err
	}
	bin, ok := findLibreOfficeExecutable()
	if !ok {
		return "", fmt.Errorf("LibreOffice/soffice was not found; install LibreOffice or configure an external Office MCP for suite-specific conversion")
	}
	outDir := strings.TrimSpace(optionalString(args, "output_dir"))
	if outDir == "" {
		outDir = filepath.Dir(path)
	}
	outDir, err = filepath.Abs(expandOfficePath(outDir))
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(outDir, 0o755); err != nil {
		return "", fmt.Errorf("create output_dir: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), officeConvertTimeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin, "--headless", "--convert-to", "pdf", "--outdir", outDir, path)
	output, err := cmd.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return "", fmt.Errorf("convert to PDF timed out after %s", officeConvertTimeout)
	}
	if err != nil {
		return "", fmt.Errorf("convert to PDF: %w: %s", err, strings.TrimSpace(string(output)))
	}
	pdf := filepath.Join(outDir, strings.TrimSuffix(filepath.Base(path), filepath.Ext(path))+".pdf")
	return marshalTimeResult(map[string]any{
		"source":     path,
		"output_pdf": pdf,
		"launcher":   []string{bin, "--headless", "--convert-to", "pdf", "--outdir", outDir, path},
		"output":     strings.TrimSpace(string(output)),
	})
}

func validateOfficePath(raw string, allowAny bool) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", fmt.Errorf("path is required")
	}
	path, err := filepath.Abs(expandOfficePath(raw))
	if err != nil {
		return "", err
	}
	fi, err := os.Stat(path)
	if err != nil {
		return "", err
	}
	if fi.IsDir() {
		return "", fmt.Errorf("path is a directory: %s", path)
	}
	if !allowAny && !officeDocumentExtensions[strings.ToLower(filepath.Ext(path))] {
		return "", fmt.Errorf("refusing to open unsupported file type %q; pass allow_any_file=true to override", filepath.Ext(path))
	}
	return path, nil
}

func findOfficeCommand(suite, kind string) (officeCommand, bool) {
	switch normalizeOfficeSuite(suite) {
	case "default":
		return defaultOpenCommand()
	case "microsoft_office":
		return microsoftOfficeCommand(kind)
	case "wps":
		return wpsOfficeCommand(kind)
	case "libreoffice":
		return libreOfficeCommand(kind)
	default:
		return officeCommand{}, false
	}
}

func defaultOpenCommand() (officeCommand, bool) {
	switch runtime.GOOS {
	case "darwin":
		return officeCommand{Command: "open"}, true
	case "windows":
		return officeCommand{Command: "cmd", Args: []string{"/c", "start", ""}}, true
	default:
		if p, err := exec.LookPath("xdg-open"); err == nil {
			return officeCommand{Command: p, Path: p}, true
		}
		return officeCommand{}, false
	}
}

func microsoftOfficeCommand(kind string) (officeCommand, bool) {
	switch runtime.GOOS {
	case "darwin":
		switch kind {
		case "spreadsheet":
			return macAppCommand("Microsoft Excel")
		case "presentation":
			return macAppCommand("Microsoft PowerPoint")
		default:
			return macAppCommand("Microsoft Word")
		}
	case "windows":
		switch kind {
		case "spreadsheet":
			return windowsOfficeExecutable("EXCEL.EXE", []string{
				filepath.Join("Microsoft Office", "root", "Office*", "EXCEL.EXE"),
				filepath.Join("Microsoft Office", "Office*", "EXCEL.EXE"),
			})
		case "presentation":
			return windowsOfficeExecutable("POWERPNT.EXE", []string{
				filepath.Join("Microsoft Office", "root", "Office*", "POWERPNT.EXE"),
				filepath.Join("Microsoft Office", "Office*", "POWERPNT.EXE"),
			})
		default:
			return windowsOfficeExecutable("WINWORD.EXE", []string{
				filepath.Join("Microsoft Office", "root", "Office*", "WINWORD.EXE"),
				filepath.Join("Microsoft Office", "Office*", "WINWORD.EXE"),
			})
		}
	default:
		return officeCommand{}, false
	}
}

func wpsOfficeCommand(kind string) (officeCommand, bool) {
	switch runtime.GOOS {
	case "darwin":
		return macAppCommand("WPS Office", "wpsoffice")
	case "windows":
		exe := "wps.exe"
		if kind == "spreadsheet" {
			exe = "et.exe"
		} else if kind == "presentation" {
			exe = "wpp.exe"
		}
		return windowsOfficeExecutable(exe, []string{
			filepath.Join("Kingsoft", "WPS Office", "*", "office6", exe),
			filepath.Join("Kingsoft", "WPS Office", "office6", exe),
			filepath.Join("WPS Office", "*", "office6", exe),
			filepath.Join("WPS Office", "office6", exe),
		})
	default:
		names := []string{"wps"}
		if kind == "spreadsheet" {
			names = []string{"et", "wps"}
		} else if kind == "presentation" {
			names = []string{"wpp", "wps"}
		}
		return lookPathCommand(names...)
	}
}

func libreOfficeCommand(kind string) (officeCommand, bool) {
	if runtime.GOOS == "darwin" {
		if cmd, ok := macAppCommand("LibreOffice"); ok {
			return cmd, true
		}
	}
	bin, ok := findLibreOfficeExecutable()
	if !ok {
		return officeCommand{}, false
	}
	args := []string{}
	switch kind {
	case "word_processor":
		args = append(args, "--writer")
	case "spreadsheet":
		args = append(args, "--calc")
	case "presentation":
		args = append(args, "--impress")
	}
	return officeCommand{Command: bin, Args: args, Path: bin}, true
}

func findLibreOfficeExecutable() (string, bool) {
	for _, name := range []string{"libreoffice", "soffice"} {
		if p, err := exec.LookPath(name); err == nil {
			return p, true
		}
	}
	switch runtime.GOOS {
	case "darwin":
		if p := filepath.Join("/Applications", "LibreOffice.app", "Contents", "MacOS", "soffice"); fileExists(p) {
			return p, true
		}
	case "windows":
		if cmd, ok := windowsOfficeExecutable("soffice.exe", []string{
			filepath.Join("LibreOffice", "program", "soffice.exe"),
		}); ok {
			return cmd.Command, true
		}
	}
	return "", false
}

func lookPathCommand(names ...string) (officeCommand, bool) {
	for _, name := range names {
		if p, err := exec.LookPath(name); err == nil {
			return officeCommand{Command: p, Path: p}, true
		}
	}
	return officeCommand{}, false
}

func macAppCommand(appNames ...string) (officeCommand, bool) {
	for _, appName := range appNames {
		for _, base := range macApplicationDirs() {
			path := filepath.Join(base, appName+".app")
			if fileExists(path) {
				return officeCommand{Command: "open", Args: []string{"-a", appName}, Path: path}, true
			}
		}
	}
	return officeCommand{}, false
}

func macApplicationDirs() []string {
	dirs := []string{"/Applications", "/System/Applications"}
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		dirs = append(dirs, filepath.Join(home, "Applications"))
	}
	return dirs
}

func windowsOfficeExecutable(name string, relativeGlobs []string) (officeCommand, bool) {
	if p, err := exec.LookPath(name); err == nil {
		return officeCommand{Command: p, Path: p}, true
	}
	for _, base := range windowsProgramDirs() {
		for _, rel := range relativeGlobs {
			matches, _ := filepath.Glob(filepath.Join(base, rel))
			for _, p := range matches {
				if fileExists(p) {
					return officeCommand{Command: p, Path: p}, true
				}
			}
		}
	}
	return officeCommand{}, false
}

func windowsProgramDirs() []string {
	var dirs []string
	for _, key := range []string{"ProgramFiles", "ProgramFiles(x86)", "ProgramW6432", "LOCALAPPDATA"} {
		if v := strings.TrimSpace(os.Getenv(key)); v != "" {
			dirs = append(dirs, v)
		}
	}
	return dirs
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func expandOfficePath(path string) string {
	path = os.ExpandEnv(path)
	if strings.HasPrefix(path, "~/") {
		if home, err := os.UserHomeDir(); err == nil && home != "" {
			return filepath.Join(home, path[2:])
		}
	}
	return path
}

func normalizeOfficeSuite(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "", "default", "system":
		return "default"
	case "microsoft", "microsoft_office", "ms", "ms_office", "office":
		return "microsoft_office"
	case "wps", "wps_office", "kingsoft":
		return "wps"
	case "libre", "libreoffice", "soffice":
		return "libreoffice"
	default:
		return strings.ToLower(strings.TrimSpace(raw))
	}
}

func officeKindFromApp(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "word", "writer", "document", "doc", "docx":
		return "word_processor"
	case "excel", "spreadsheet", "sheet", "calc", "xls", "xlsx", "csv":
		return "spreadsheet"
	case "powerpoint", "presentation", "slides", "impress", "ppt", "pptx":
		return "presentation"
	default:
		return ""
	}
}

func inferOfficeKind(path string) string {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".csv", ".ods", ".xls", ".xlsb", ".xlsm", ".xlsx":
		return "spreadsheet"
	case ".odp", ".pot", ".potm", ".potx", ".pps", ".ppsm", ".ppsx", ".ppt", ".pptm", ".pptx":
		return "presentation"
	case ".doc", ".docm", ".docx", ".dot", ".dotm", ".dotx", ".odt", ".rtf", ".txt":
		return "word_processor"
	default:
		return "document"
	}
}

func fallbackOfficeKind(kind string) string {
	if strings.TrimSpace(kind) == "" {
		return "document"
	}
	return kind
}

func optionalBool(args map[string]any, key string) bool {
	if args == nil {
		return false
	}
	v, _ := args[key].(bool)
	return v
}
