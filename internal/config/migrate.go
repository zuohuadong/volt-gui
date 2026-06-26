package config

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/BurntSushi/toml"
)

// legacyConfig is the subset of the v0.x (~/.voltui/config.json) schema this
// import carries forward. Fields absent here are dropped on purpose: desktop tab
// state is frontend-owned, and skills already live in the shared ~/.voltui/skills
// root that v1+ also scans, so they need no migration.
type legacyConfig struct {
	APIKey      string                       `json:"apiKey"`
	BaseURL     string                       `json:"baseUrl"`
	Model       string                       `json:"model"`
	Lang        string                       `json:"lang"`
	MCPServers  map[string]legacyMCPServer   `json:"mcpServers"`
	MCPEnv      map[string]map[string]string `json:"mcpEnv"`
	MCPDisabled []string                     `json:"mcpDisabled"`
}

type legacyMCPServer struct {
	Command   string            `json:"command"`
	Args      []string          `json:"args"`
	Env       map[string]string `json:"env"`
	Transport string            `json:"transport"`
	Type      string            `json:"type"`
	URL       string            `json:"url"`
	Headers   map[string]string `json:"headers"`
	Disabled  bool              `json:"disabled"`
}

// MigrationResult summarizes a one-time legacy import for the boot-time notice.
type MigrationResult struct {
	From     string
	To       string
	KeyToEnv bool
	Plugins  int
	Warnings []string
}

// MCPGlobalMigrationResult summarizes the MCP backfill that lifts MCP servers
// from legacy and project-local sources into the user-global config.
type MCPGlobalMigrationResult struct {
	To      string
	Added   int
	Sources int
}

func (r *MigrationResult) Notice() string {
	var b strings.Builder
	fmt.Fprintf(&b, "migrated your previous configuration: %s → %s", r.From, r.To)
	if r.Plugins > 0 {
		fmt.Fprintf(&b, " (%d MCP server(s))", r.Plugins)
	}
	if r.KeyToEnv {
		b.WriteString("; API key saved to voltui's credentials store")
	}
	b.WriteString(". The old files were left untouched.")
	for _, w := range r.Warnings {
		b.WriteString("\n  note: " + w)
	}
	return b.String()
}

// MigrateLegacyIfNeeded performs a one-time, non-destructive import of older
// installs into the current user config when the latter does not exist yet. It
// checks v1-era TOML first, then v0.5/v0.x ~/.voltui/config.json, and never
// modifies or deletes the legacy files. Returns nil when there is nothing to
// migrate, or when the current user config already exists.
func MigrateLegacyIfNeeded() (*MigrationResult, error) {
	return MigrateLegacyIfNeededForRoot(".")
}

func MigrateLegacyIfNeededForRoot(root string) (*MigrationResult, error) {
	credErr := MigrateLegacyCredentialsForRoot(root)
	dest := userConfigPath()
	if dest == "" {
		return nil, credErr
	}
	if _, err := os.Stat(dest); err == nil {
		return nil, credErr
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, credErr
	}
	if res, err := migrateLegacyTOMLIfNeeded(dest, home); res != nil || err != nil {
		if err == nil {
			err = credErr
		}
		return res, err
	}
	src := filepath.Join(home, ".voltui", "config.json")
	data, err := os.ReadFile(src)
	if err != nil {
		return nil, credErr
	}
	var legacy legacyConfig
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF}) // tolerate a UTF-8 BOM (some editors add one)
	if err := json.Unmarshal(data, &legacy); err != nil {
		return nil, fmt.Errorf("parse legacy config %s: %w", src, err)
	}

	cfg := Default()
	res := &MigrationResult{From: src, To: dest}
	if legacy.Lang != "" {
		cfg.Language = legacy.Lang
		_ = cfg.SetDesktopLanguage(legacy.Lang)
	}
	if legacy.Model != "" {
		if entry, ok := cfg.ResolveModel(legacy.Model); ok {
			cfg.DefaultModel = entry.Name + "/" + entry.Model
		} else {
			cfg.DefaultModel = legacy.Model
		}
	}
	migrateLegacyBaseURL(cfg, legacy.BaseURL)
	cfg.Plugins = legacyPlugins(legacy)
	res.Plugins = len(cfg.Plugins)

	var envLines []string
	if key := strings.TrimSpace(legacy.APIKey); key != "" {
		envLines = append(envLines, "DEEPSEEK_API_KEY="+key)
		res.KeyToEnv = true
		if base := strings.TrimSpace(legacy.BaseURL); base != "" && !strings.Contains(base, "deepseek.com") {
			res.Warnings = append(res.Warnings, "your previous base_url was "+base+
				" — it was applied to the built-in DeepSeek providers; verify models if this endpoint is not DeepSeek-compatible")
		}
	}

	if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
		return nil, fmt.Errorf("create config dir: %w", err)
	}
	if err := cfg.WriteFile(dest); err != nil {
		return nil, fmt.Errorf("write %s: %w", dest, err)
	}
	if len(envLines) > 0 {
		if err := writeCredentialsEnv(home, envLines); err != nil {
			return res, fmt.Errorf("write credentials: %w", err)
		}
	}
	return res, credErr
}

// MigrateMCPToUserConfigOnUpgrade runs a one-time best-effort backfill for MCP
// servers found in legacy TOML, known project roots, and legacy v0.x JSON. It
// copies them into the user-global config so the desktop MCP settings page is
// stable across Global/project tabs. Existing global entries win on name
// collisions, and source files are left untouched.
func MigrateMCPToUserConfigOnUpgrade(projectRoots []string) (*MCPGlobalMigrationResult, error) {
	marker := mcpGlobalMigrationMarkerPath()
	if marker == "" {
		return nil, nil
	}
	if _, err := os.Stat(marker); err == nil {
		return nil, nil
	} else if err != nil && !os.IsNotExist(err) {
		return nil, err
	}

	res, err := migrateMCPToUserConfig(projectRoots)
	if err != nil {
		return res, err
	}
	if res == nil {
		return nil, nil
	}
	if err := os.MkdirAll(filepath.Dir(marker), 0o755); err != nil {
		return res, err
	}
	if err := os.WriteFile(marker, []byte("v1\n"), 0o644); err != nil {
		return res, err
	}
	return res, nil
}

func migrateMCPToUserConfig(projectRoots []string) (*MCPGlobalMigrationResult, error) {
	dest := userConfigPath()
	if dest == "" {
		return nil, nil
	}
	userCfg, err := loadForEditStrict(dest, true)
	if err != nil {
		return nil, err
	}
	have := make(map[string]bool, len(userCfg.Plugins))
	for _, p := range userCfg.Plugins {
		if name := strings.TrimSpace(p.Name); name != "" {
			have[name] = true
		}
	}

	result := &MCPGlobalMigrationResult{To: dest}
	addEntries := func(entries []PluginEntry) {
		if len(entries) == 0 {
			return
		}
		result.Sources++
		for _, entry := range entries {
			entry, _ = NormalizePluginCommandLine(entry)
			name := strings.TrimSpace(entry.Name)
			if name == "" || have[name] || validatePlugin(entry) != nil {
				continue
			}
			userCfg.Plugins = append(userCfg.Plugins, entry)
			have[name] = true
			result.Added++
		}
	}

	home, _ := os.UserHomeDir()
	for _, path := range mcpMigrationLegacyTOMLPaths(dest, home) {
		addEntries(loadPluginEntriesFromTOML(path))
	}
	for _, root := range normalizedMCPMigrationRoots(projectRoots) {
		addEntries(loadPluginEntriesFromTOML(filepath.Join(root, "voltui.toml")))
		addEntries(loadPluginEntriesFromTOML(filepath.Join(root, "voltui.toml")))
		if entries, err := loadMCPJSON(filepath.Join(root, mcpJSONFile)); err == nil {
			addEntries(entries)
		}
	}
	addEntries(loadLegacyConfigPlugins(legacyConfigPath()))

	if result.Sources == 0 {
		return nil, nil
	}
	if result.Added > 0 {
		if err := userCfg.SaveTo(dest); err != nil {
			return result, err
		}
	}
	return result, nil
}

func mcpGlobalMigrationMarkerPath() string {
	dir := userSupportDir()
	if dir == "" {
		return ""
	}
	return filepath.Join(dir, "mcp-global-migration-v1")
}

func mcpMigrationLegacyTOMLPaths(dest, home string) []string {
	var paths []string
	for _, path := range legacyTOMLPaths(dest, home) {
		if path == "" || samePath(path, dest) {
			continue
		}
		paths = append(paths, path)
	}
	return paths
}

func loadPluginEntriesFromTOML(path string) []PluginEntry {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil
	}
	if _, err := os.Stat(path); err != nil {
		return nil
	}
	var cfg Config
	if _, err := toml.DecodeFile(path, &cfg); err != nil {
		return nil
	}
	out := make([]PluginEntry, 0, len(cfg.Plugins))
	for _, p := range cfg.Plugins {
		p, _ = NormalizePluginCommandLine(p)
		out = append(out, p)
	}
	return out
}

func loadLegacyConfigPlugins(path string) []PluginEntry {
	if strings.TrimSpace(path) == "" {
		return nil
	}
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}
	var legacy legacyConfig
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})
	if err := json.Unmarshal(data, &legacy); err != nil {
		return nil
	}
	return legacyPlugins(legacy)
}

func normalizedMCPMigrationRoots(roots []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(roots))
	for _, root := range roots {
		root = strings.TrimSpace(root)
		if root == "" {
			continue
		}
		if abs, err := filepath.Abs(root); err == nil {
			root = abs
		}
		root = filepath.Clean(root)
		if seen[root] {
			continue
		}
		seen[root] = true
		out = append(out, root)
	}
	return out
}

// MigrateLegacyCredentialsForRoot is a best-effort per-workspace credentials
// backfill hook used by desktop tab startup. The primary legacy migration path
// already moves known provider keys into VoltUI's global credentials store; this
// hook stays non-blocking so opening a workspace never fails because a legacy
// credential source is unreadable.
func MigrateLegacyCredentialsForRoot(root string) error {
	return nil
}

func migrateLegacyTOMLIfNeeded(dest, home string) (*MigrationResult, error) {
	for _, src := range legacyTOMLPaths(dest, home) {
		if src == "" || filepath.Clean(src) == filepath.Clean(dest) {
			continue
		}
		if _, err := os.Stat(src); err != nil {
			continue
		}
		cfg := Default()
		if err := mergeFile(cfg, src); err != nil {
			return nil, fmt.Errorf("parse legacy config %s: %w", src, err)
		}
		cfg.ConfigVersion = Default().ConfigVersion
		if strings.TrimSpace(cfg.Desktop.CloseBehavior) == "" && strings.TrimSpace(cfg.UI.CloseBehavior) != "" {
			cfg.Desktop.CloseBehavior = cfg.DesktopCloseBehavior()
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return nil, fmt.Errorf("create config dir: %w", err)
		}
		if err := cfg.WriteFile(dest); err != nil {
			return nil, fmt.Errorf("write %s: %w", dest, err)
		}
		res := &MigrationResult{From: src, To: dest, Plugins: len(cfg.Plugins)}
		legacyDir := filepath.Dir(src)
		newDir := filepath.Dir(dest)
		if !sameMigrationPath(legacyDir, newDir) {
			if warnings := migrateSupportData(legacyDir, newDir); len(warnings) > 0 {
				res.Warnings = append(res.Warnings, warnings...)
			}
		}
		return res, nil
	}
	return nil, nil
}

func legacyTOMLPaths(dest, home string) []string {
	paths := []string{
		legacyUserConfigPath(),
		filepath.Join(filepath.Dir(dest), "voltui.toml"),
		filepath.Join(filepath.Dir(dest), "voltui.toml"),
	}
	if home != "" {
		paths = append(paths, filepath.Join(home, ".voltui", "voltui.toml"))
		paths = append(paths, filepath.Join(home, ".voltui", "config.toml"))
		paths = append(paths, filepath.Join(home, ".voltui", "voltui.toml"))
	}
	return paths
}

func migrateLegacyBaseURL(cfg *Config, baseURL string) {
	baseURL = strings.TrimSpace(baseURL)
	if cfg == nil || baseURL == "" {
		return
	}
	for i := range cfg.Providers {
		if cfg.Providers[i].APIKeyEnv == "DEEPSEEK_API_KEY" {
			cfg.Providers[i].BaseURL = baseURL
		}
	}
}

func legacyPlugins(legacy legacyConfig) []PluginEntry {
	if len(legacy.MCPServers) == 0 {
		return nil
	}
	disabled := make(map[string]bool, len(legacy.MCPDisabled))
	for _, n := range legacy.MCPDisabled {
		disabled[n] = true
	}
	names := make([]string, 0, len(legacy.MCPServers))
	for n := range legacy.MCPServers {
		names = append(names, n)
	}
	sort.Strings(names)
	out := make([]PluginEntry, 0, len(names))
	for _, name := range names {
		s := legacy.MCPServers[name]
		pe := PluginEntry{
			Name:    name,
			Type:    normalizeTransport(firstNonEmpty(s.Type, s.Transport)),
			Command: s.Command,
			Args:    s.Args,
			Env:     mergeEnv(s.Env, legacy.MCPEnv[name]),
			URL:     s.URL,
			Headers: s.Headers,
		}
		if s.Disabled || disabled[name] {
			off := false
			pe.AutoStart = &off
		}
		out = append(out, pe)
	}
	return out
}

// normalizeTransport maps the v0.x transport names to v1+ plugin types. stdio is
// the default, so it returns "" (RenderTOML then omits the field).
func normalizeTransport(t string) string {
	switch strings.ToLower(strings.TrimSpace(t)) {
	case "http", "streamable-http":
		return "http"
	case "sse":
		return "sse"
	default:
		return ""
	}
}

func firstNonEmpty(a, b string) string {
	if strings.TrimSpace(a) != "" {
		return a
	}
	return b
}

// mergeEnv overlays the per-server env map onto the spec's own env (overlay wins,
// matching v0.x mcpEnv precedence). Returns nil when both are empty.
func mergeEnv(base, overlay map[string]string) map[string]string {
	if len(base) == 0 && len(overlay) == 0 {
		return nil
	}
	out := make(map[string]string, len(base)+len(overlay))
	for k, v := range base {
		out[k] = v
	}
	for k, v := range overlay {
		out[k] = v
	}
	return out
}

// writeCredentialsEnv merges lines into the voltui-owned global credentials
// file (UserCredentialsPath, e.g. %AppData%\voltui\credentials), replacing any
// existing assignment of the same key, and pins them into the current process env
// so the just-built session resolves the key without a restart. Falls back to
// ~/.env only when the user config dir can't be resolved — never a project .env,
// so a migration keeps secrets out of the user's project tree.
func writeCredentialsEnv(home string, lines []string) error {
	path := UserCredentialsPath()
	if path == "" {
		path = filepath.Join(home, ".env")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	target := make(map[string]bool, len(lines))
	for _, l := range lines {
		if k, _, ok := strings.Cut(l, "="); ok {
			target[strings.TrimSpace(k)] = true
		}
	}
	var kept []string
	if data, err := os.ReadFile(path); err == nil {
		for _, raw := range strings.Split(string(data), "\n") {
			check := strings.TrimPrefix(strings.TrimSpace(raw), "export ")
			if k, _, ok := strings.Cut(check, "="); ok && target[strings.TrimSpace(k)] {
				continue
			}
			kept = append(kept, raw)
		}
		if n := len(kept); n > 0 && kept[n-1] == "" {
			kept = kept[:n-1]
		}
	} else if !os.IsNotExist(err) {
		return err
	}
	var b strings.Builder
	for _, l := range kept {
		b.WriteString(l)
		b.WriteByte('\n')
	}
	for _, l := range lines {
		b.WriteString(l)
		b.WriteByte('\n')
		if k, v, ok := strings.Cut(l, "="); ok {
			os.Setenv(strings.TrimSpace(k), v)
		}
	}
	return os.WriteFile(path, []byte(b.String()), 0o600)
}

func sameMigrationPath(a, b string) bool {
	if strings.TrimSpace(a) == "" || strings.TrimSpace(b) == "" {
		return false
	}
	aa, errA := filepath.Abs(a)
	if errA == nil {
		a = aa
	}
	bb, errB := filepath.Abs(b)
	if errB == nil {
		b = bb
	}
	return filepath.Clean(a) == filepath.Clean(b)
}

func migrateSupportData(legacyDir, newDir string) []string {
	var warnings []string
	items := []string{"sessions", "projects", "skills", "archive", "hooks.json"}
	for _, item := range items {
		src := filepath.Join(legacyDir, item)
		fi, err := os.Stat(src)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			warnings = append(warnings, fmt.Sprintf("failed to read legacy item %s: %v", item, err))
			continue
		}
		dst := filepath.Join(newDir, item)
		if fi.IsDir() {
			if err := copyDir(src, dst); err != nil {
				warnings = append(warnings, fmt.Sprintf("failed to migrate directory %s: %v", item, err))
			} else {
				warnings = append(warnings, fmt.Sprintf("successfully migrated directory %s", item))
			}
			continue
		}
		if err := copyFile(src, dst); err != nil {
			warnings = append(warnings, fmt.Sprintf("failed to migrate file %s: %v", item, err))
		} else {
			warnings = append(warnings, fmt.Sprintf("successfully migrated file %s", item))
		}
	}
	return warnings
}

func copyFile(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	parentMode := os.FileMode(0o755)
	if info.Mode().Perm()&0o077 == 0 {
		parentMode = 0o700
	}
	if err := os.MkdirAll(filepath.Dir(dst), parentMode); err != nil {
		return err
	}

	perm := info.Mode().Perm()
	if perm == 0 {
		perm = 0o600
	}
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, perm)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err = io.Copy(out, in); err != nil {
		return err
	}
	if err := out.Sync(); err != nil {
		return err
	}
	return os.Chmod(dst, perm)
}

func copyDir(src, dst string) error {
	info, err := os.Stat(src)
	if err != nil {
		return err
	}
	entries, err := os.ReadDir(src)
	if err != nil {
		return err
	}

	perm := info.Mode().Perm()
	if perm == 0 {
		perm = 0o700
	}
	if err := os.MkdirAll(dst, perm); err != nil {
		return err
	}
	if err := os.Chmod(dst, perm); err != nil {
		return err
	}

	for _, entry := range entries {
		srcPath := filepath.Join(src, entry.Name())
		dstPath := filepath.Join(dst, entry.Name())
		if entry.IsDir() {
			if err := copyDir(srcPath, dstPath); err != nil {
				return err
			}
			continue
		}
		if err := copyFile(srcPath, dstPath); err != nil {
			return err
		}
	}
	return nil
}
