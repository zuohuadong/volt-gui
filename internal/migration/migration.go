package migration

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"reasonix/internal/agent"
	"reasonix/internal/config"
	"reasonix/internal/event"
)

// SessionImport records one legacy session source that contributed sessions.
type SessionImport struct {
	Source      string
	Destination string
	Count       int
}

// Result summarizes an explicit migration rescue run.
type Result struct {
	Config         *config.MigrationResult
	ConfigErr      error
	SessionImports []SessionImport
	SessionErrs    []error
}

// Summary returns the final user-visible status for a migration rescue run.
func (r Result) Summary() string {
	importedSessions := 0
	for _, imp := range r.SessionImports {
		importedSessions += imp.Count
	}
	warnings := 0
	if r.ConfigErr != nil {
		warnings++
	}
	warnings += len(r.SessionErrs)
	switch {
	case warnings > 0:
		return fmt.Sprintf("migration rescue completed with %d warning(s): imported %d past session(s)", warnings, importedSessions)
	case r.Config != nil || importedSessions > 0:
		parts := []string{}
		if r.Config != nil {
			parts = append(parts, "config/credentials")
		}
		if importedSessions > 0 {
			parts = append(parts, fmt.Sprintf("%d past session(s)", importedSessions))
		}
		return "migration rescue complete: imported " + strings.Join(parts, " and ")
	default:
		return "migration rescue complete: no legacy data needed migration"
	}
}

// RunLegacyRescue retries the non-destructive legacy migration path and emits
// progress notices suitable for both the CLI TUI and desktop frontend.
func RunLegacyRescue(sink event.Sink) Result {
	sink = event.Sync(sink)
	emit := func(level event.Level, text string) {
		sink.Emit(event.Event{Kind: event.Notice, Level: level, Text: text})
	}
	result := Result{}
	emit(event.LevelInfo, "migration rescue: checking legacy config and credentials")
	migrated, err := config.MigrateLegacyIfNeeded()
	result.Config = migrated
	result.ConfigErr = err
	if err != nil {
		emit(event.LevelWarn, "migration rescue: config migration warning: "+err.Error())
	} else if migrated != nil {
		emit(event.LevelInfo, migrated.Notice())
	} else {
		emit(event.LevelInfo, "migration rescue: current config is already present or no legacy config was found")
	}
	emit(event.LevelInfo, "migration rescue: scanning legacy sessions")
	sessionResult := migrateLegacySessionSources(sink, true)
	result.SessionImports = sessionResult.imports
	result.SessionErrs = sessionResult.errs
	emit(event.LevelInfo, result.Summary())
	return result
}

// MigrateLegacySessionSources imports older session stores during normal boot.
// It preserves the historical boot-time behavior: notify only when something was
// imported, and otherwise stay quiet.
func MigrateLegacySessionSources(sink event.Sink) []SessionImport {
	sink = event.Sync(sink)
	return migrateLegacySessionSources(sink, false).imports
}

type sessionMigrationResult struct {
	imports []SessionImport
	errs    []error
}

func migrateLegacySessionSources(sink event.Sink, verbose bool) sessionMigrationResult {
	dest := config.SessionDir()
	if strings.TrimSpace(dest) == "" {
		return sessionMigrationResult{}
	}
	type legacySource struct {
		dir     string
		dest    string
		label   string
		migrate func(srcDir, globalDest string, projectDir func(string) string) (int, error)
	}
	var sources []legacySource
	addFlatSource := func(dir, label string, migrate func(string, string, func(string) string) (int, error)) {
		sources = append(sources, legacySource{
			dir:     dir,
			dest:    dest,
			label:   label,
			migrate: migrate,
		})
	}
	addProjectSources := func(root string) {
		root = strings.TrimSpace(root)
		if root == "" || config.MemoryUserDir() == "" {
			return
		}
		projectsDir := filepath.Join(root, "projects")
		entries, err := os.ReadDir(projectsDir)
		if err != nil {
			return
		}
		for _, entry := range entries {
			if !entry.IsDir() {
				continue
			}
			slug := entry.Name()
			srcDir := filepath.Join(projectsDir, slug, "sessions")
			dstDir := filepath.Join(config.MemoryUserDir(), "projects", slug, "sessions")
			sources = append(sources, legacySource{
				dir:     srcDir,
				dest:    dstDir,
				label:   srcDir,
				migrate: agent.MigrateLegacySessionsFromConfigDir,
			})
		}
	}
	if home, herr := os.UserHomeDir(); herr == nil {
		reasonixHome := filepath.Join(home, ".reasonix")
		addFlatSource(filepath.Join(reasonixHome, "sessions"), "~/.reasonix/sessions", agent.MigrateLegacySessions)
		addProjectSources(reasonixHome)
	}
	for _, legacyConfig := range config.LegacyUserConfigPaths() {
		legacyDir := filepath.Join(filepath.Dir(legacyConfig), "sessions")
		addFlatSource(legacyDir, legacyDir, agent.MigrateLegacySessionsFromConfigDir)
		addProjectSources(filepath.Dir(legacyConfig))
	}
	// Back-fill v0.x sessions from the current user config session directory as
	// well. This covers users whose platform config root was redirected before the
	// Go rewrite; their event logs can already live where v2 stores sessions.
	addFlatSource(dest, dest, agent.MigrateLegacySessionsFromConfigDir)

	seen := map[string]bool{}
	result := sessionMigrationResult{}
	for _, src := range sources {
		if strings.TrimSpace(src.dir) == "" {
			continue
		}
		sourceDest := strings.TrimSpace(src.dest)
		if sourceDest == "" {
			sourceDest = dest
		}
		key := filepath.Clean(src.dir) + "=>" + filepath.Clean(sourceDest)
		if seen[key] {
			continue
		}
		seen[key] = true
		n, err := src.migrate(src.dir, sourceDest, config.ProjectSessionDir)
		if err != nil {
			result.errs = append(result.errs, fmt.Errorf("%s: %w", src.label, err))
			if verbose {
				sink.Emit(event.Event{Kind: event.Notice, Level: event.LevelWarn, Text: "migration rescue: skipped " + src.label + ": " + err.Error()})
			}
			continue
		}
		if n > 0 {
			result.imports = append(result.imports, SessionImport{Source: src.label, Destination: sourceDest, Count: n})
			sink.Emit(event.Event{Kind: event.Notice, Level: event.LevelInfo, Text: fmt.Sprintf("imported %d past session(s) from %s — resume them with --resume or the history panel", n, src.label)})
		}
	}
	if verbose && len(result.imports) == 0 && len(result.errs) == 0 {
		sink.Emit(event.Event{Kind: event.Notice, Level: event.LevelInfo, Text: "migration rescue: no legacy sessions needed migration"})
	}
	return result
}
