// Package builtinmcp defines MCP servers that ship with VoltUI without
// requiring user configuration.
package builtinmcp

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"

	"voltui/internal/config"
)

const (
	TimeName        = "time"
	Context7Name    = "context7"
	OfficeName      = "office"
	ComputerUseName = "computer-use"

	enableDefaultBuiltInMCPInTestsEnv = "VOLTUI_ENABLE_DEFAULT_BUILTIN_MCP_IN_TESTS"
	computerUseRuntimeEnv             = "VOLTUI_COMPUTER_USE_RUNTIME"
	computerUseNodeEnv                = "VOLTUI_COMPUTER_USE_NODE"
	computerUseResourceDirEnv         = "VOLTUI_COMPUTER_USE_MCP_DIR"
	computerUseRuntimeDirEnv          = "VOLTUI_COMPUTER_USE_RUNTIME_DIR"
	computerUseResourceDirName        = "computer-use-mcp"
	computerUseRuntimeDirName         = "computer-use-runtime"
	computerUseServerRelPath          = "node_modules/@zavora-ai/computer-use-mcp/dist/server.js"
)

var (
	executablePathDefault = os.Executable
	lookPathDefault       = exec.LookPath
	currentExecutable     = executablePathDefault
	lookPath              = lookPathDefault
)

// Entries returns the built-in MCP servers that are always available. They use
// the lazy tier so startup never blocks on package installation or network.
func Entries() []config.PluginEntry {
	return []config.PluginEntry{
		{
			Name:    TimeName,
			Type:    "stdio",
			Command: executablePath(),
			Args:    []string{"builtin-mcp", TimeName},
			Tier:    "lazy",
		},
		{
			Name:    OfficeName,
			Type:    "stdio",
			Command: executablePath(),
			Args:    []string{"builtin-mcp", OfficeName},
			Tier:    "lazy",
		},
		computerUseEntry(),
		context7Entry(),
	}
}

func executablePath() string {
	if path, err := currentExecutable(); err == nil && path != "" {
		return path
	}
	return "voltui"
}

func context7Entry() config.PluginEntry {
	command, args := context7Command()
	return config.PluginEntry{
		Name:    Context7Name,
		Type:    "stdio",
		Command: command,
		Args:    args,
		Tier:    "lazy",
	}
}

func context7Command() (string, []string) {
	if _, err := lookPath("npx"); err == nil {
		return "npx", []string{"-y", "@upstash/context7-mcp"}
	}
	if _, err := lookPath("pnpm"); err == nil {
		return "pnpm", []string{"dlx", "@upstash/context7-mcp"}
	}
	if _, err := lookPath("bunx"); err == nil {
		return "bunx", []string{"@upstash/context7-mcp"}
	}
	return "npx", []string{"-y", "@upstash/context7-mcp"}
}

func computerUseEntry() config.PluginEntry {
	return config.PluginEntry{
		Name:    ComputerUseName,
		Type:    "stdio",
		Command: computerUseRuntimeCommand(),
		Args:    []string{computerUseServerPath()},
		Tier:    "lazy",
	}
}

func computerUseRuntimeCommand() string {
	if command := strings.TrimSpace(os.Getenv(computerUseRuntimeEnv)); command != "" {
		return command
	}
	if command := strings.TrimSpace(os.Getenv(computerUseNodeEnv)); command != "" {
		return command
	}
	if path, ok := bundledComputerUseRuntimePath(); ok {
		return path
	}
	if _, err := lookPath("bun"); err == nil {
		return "bun"
	}
	return "node"
}

func computerUseServerPath() string {
	return filepath.Join(computerUseResourceDir(), filepath.FromSlash(computerUseServerRelPath))
}

func computerUseResourceDir() string {
	if dir := strings.TrimSpace(os.Getenv(computerUseResourceDirEnv)); dir != "" {
		return dir
	}
	for _, dir := range computerUseResourceDirCandidates() {
		if info, err := os.Stat(dir); err == nil && info.IsDir() {
			return dir
		}
	}
	candidates := computerUseResourceDirCandidates()
	if len(candidates) > 0 {
		return candidates[0]
	}
	return computerUseResourceDirName
}

func computerUseResourceDirCandidates() []string {
	return computerUseResourceDirCandidatesFor(computerUseResourceDirName)
}

func bundledComputerUseRuntimePath() (string, bool) {
	rel := computerUseBunRelPath()
	for _, dir := range computerUseRuntimeDirCandidates() {
		path := filepath.Join(dir, rel)
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path, true
		}
	}
	return "", false
}

func computerUseRuntimeDirCandidates() []string {
	if dir := strings.TrimSpace(os.Getenv(computerUseRuntimeDirEnv)); dir != "" {
		return []string{filepath.Clean(dir)}
	}
	return computerUseResourceDirCandidatesFor(computerUseRuntimeDirName)
}

func computerUseBunRelPath() string {
	return filepath.Join(computerUseBunTargetDir(), "bin", computerUseBunBinaryName())
}

func computerUseBunBinaryName() string {
	if runtime.GOOS == "windows" {
		return "bun.exe"
	}
	return "bun"
}

func computerUseBunTargetDir() string {
	switch runtime.GOOS {
	case "darwin":
		switch runtime.GOARCH {
		case "arm64":
			return "bun-darwin-arm64"
		default:
			return "bun-darwin-amd64"
		}
	case "windows":
		// Zavora publishes win32-x64 NAPI only, so Windows ARM64 launches x64 Bun
		// under the OS compatibility layer instead of an arm64 Bun that cannot
		// load the bundled native addon.
		return "bun-windows-amd64"
	case "linux":
		if runtime.GOARCH == "arm64" {
			return "bun-linux-arm64"
		}
		return "bun-linux-amd64"
	default:
		return "bun-" + runtime.GOOS + "-" + runtime.GOARCH
	}
}

func computerUseResourceDirCandidatesFor(resourceName string) []string {
	var out []string
	add := func(dir string) {
		dir = strings.TrimSpace(dir)
		if dir == "" {
			return
		}
		clean := filepath.Clean(dir)
		for _, existing := range out {
			if existing == clean {
				return
			}
		}
		out = append(out, clean)
	}
	if exe, err := currentExecutable(); err == nil && exe != "" {
		exeDir := filepath.Dir(exe)
		buildDir := filepath.Dir(exeDir)
		add(filepath.Join(exeDir, resourceName))
		add(filepath.Join(buildDir, "Resources", resourceName))
		// Wails keeps the raw Windows executable in build/bin while the NSIS
		// payload is staged under build/windows/installer. Let local release
		// builds exercise the same bundled MCP resources as the installed app.
		add(filepath.Join(buildDir, "windows", "installer", resourceName))
		if strings.Contains(exeDir, ".app"+string(filepath.Separator)+"Contents"+string(filepath.Separator)+"MacOS") {
			add(filepath.Join(filepath.Dir(exeDir), "Resources", resourceName))
		}
	}
	if wd, err := os.Getwd(); err == nil && wd != "" {
		add(filepath.Join(wd, resourceName))
		add(filepath.Join(wd, "build", resourceName))
		add(filepath.Join(wd, "desktop", "build", resourceName))
	}
	add(filepath.Join(string(filepath.Separator), "usr", "lib", "voltui", resourceName))
	return out
}

// Entry returns one built-in MCP entry by name.
func Entry(name string) (config.PluginEntry, bool) {
	for _, e := range Entries() {
		if e.Name == name {
			return e, true
		}
	}
	return config.PluginEntry{}, false
}

// IsBuiltIn reports whether name is a VoltUI-shipped MCP server.
func IsBuiltIn(name string) bool {
	_, ok := Entry(name)
	return ok
}

// IsBuiltInEntry reports whether e is the VoltUI-provided entry shape for a
// built-in server. A user may define the same name with different command/args;
// that override should stay editable/removable in UI surfaces.
func IsBuiltInEntry(e config.PluginEntry) bool {
	builtIn, ok := Entry(e.Name)
	if !ok {
		return false
	}
	if e.Type != builtIn.Type || e.Command != builtIn.Command || len(e.Args) != len(builtIn.Args) {
		return false
	}
	for i := range e.Args {
		if e.Args[i] != builtIn.Args[i] {
			return false
		}
	}
	return true
}

// AppendMissing appends built-in MCP entries unless a configured or
// session-scoped entry with the same name exists. Explicit user and host config
// wins, including auto_start=false.
func AppendMissing(out []config.PluginEntry, configured []config.PluginEntry, reservedNames ...string) []config.PluginEntry {
	return AppendEnabled(out, configured, []string{TimeName, OfficeName, ComputerUseName, Context7Name}, reservedNames...)
}

// DefaultEnabledNames returns built-ins that should be active in ordinary
// sessions without user config. Keep this dependency-free so startup never
// performs surprise package installs or network work.
func DefaultEnabledNames() []string {
	if runningGoTestBinary() && os.Getenv(enableDefaultBuiltInMCPInTestsEnv) == "" {
		return nil
	}
	return []string{OfficeName, ComputerUseName}
}

// AppendDefaultEnabled appends only default-on built-in MCP servers.
func AppendDefaultEnabled(out []config.PluginEntry, configured []config.PluginEntry, reservedNames ...string) []config.PluginEntry {
	return AppendEnabled(out, configured, DefaultEnabledNames(), reservedNames...)
}

func runningGoTestBinary() bool {
	return strings.HasSuffix(filepath.Base(os.Args[0]), ".test")
}

// AppendEnabled is like AppendMissing but only appends enabled built-in names.
func AppendEnabled(out []config.PluginEntry, configured []config.PluginEntry, enabledNames []string, reservedNames ...string) []config.PluginEntry {
	seen := make(map[string]bool, len(configured))
	for _, e := range configured {
		seen[e.Name] = true
	}
	for _, name := range reservedNames {
		seen[name] = true
	}
	enabled := make(map[string]bool, len(enabledNames))
	for _, name := range enabledNames {
		enabled[name] = true
	}
	for _, e := range Entries() {
		if enabled[e.Name] && !seen[e.Name] {
			out = append(out, e)
		}
	}
	return out
}
