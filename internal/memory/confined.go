package memory

import (
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	fileencoding "voltui/internal/fileutil/encoding"
)

// LoadConfinedDir loads instruction documents directly in dir while confining
// every document and recursive import to workspaceRoot.
func LoadConfinedDir(dir, workspaceRoot string) []Source {
	if !pathWithinRoot(dir, workspaceRoot) {
		return nil
	}
	seen := docSeen{}
	loader := confinedLoader{workspaceRoot: workspaceRoot, seen: &seen}
	docs := loader.loadDir(dir, docNames, ScopeProject)
	return append(docs, loader.loadDir(dir, localNames, ScopeLocal)...)
}

type confinedLoader struct {
	workspaceRoot string
	seen          *docSeen
}

func (loader confinedLoader) loadDir(dir string, names []string, scope Scope) []Source {
	var sources []Source
	for _, name := range names {
		path := filepath.Join(dir, name)
		body, fileInfo, ok, _ := readConfinedDocument(path, loader.workspaceRoot)
		if !ok || loader.seen != nil && !loader.seen.add(fileInfo) {
			continue
		}
		resolver := confinedImportResolver{
			workspaceRoot: loader.workspaceRoot,
			active:        map[string]bool{physicalPathIdentity(path): true},
		}
		body = resolver.resolve(body, path, 0)
		sources = append(sources, Source{Path: path, Scope: scope, Body: body})
	}
	return sources
}

func readConfinedDocument(path, workspaceRoot string) (string, os.FileInfo, bool, string) {
	boundary := realDirectory(workspaceRoot)
	root, err := os.OpenRoot(boundary)
	if err != nil {
		return "", nil, false, ""
	}
	defer root.Close()
	file, rejection := openConfinedDocument(root, path, boundary)
	if file == nil {
		return "", nil, false, rejection
	}
	body, fileInfo, ok := readOpenedInstruction(file)
	return body, fileInfo, ok, ""
}

func openConfinedDocument(root *os.Root, path, boundary string) (*os.File, string) {
	rel, err := filepath.Rel(boundary, absOf(path))
	if err == nil && filepath.IsLocal(rel) {
		if file, openErr := root.Open(rel); openErr == nil {
			return file, ""
		}
	}
	realPath, err := filepath.EvalSymlinks(path)
	if err != nil {
		return nil, ""
	}
	if !pathWithinRoot(realPath, boundary) {
		return nil, "symlink_escape"
	}
	rel, err = filepath.Rel(boundary, realPath)
	if err != nil || !filepath.IsLocal(rel) {
		return nil, "symlink_escape"
	}
	file, err := root.Open(rel)
	if err != nil {
		return nil, ""
	}
	return file, ""
}

func readOpenedInstruction(file *os.File) (string, os.FileInfo, bool) {
	defer file.Close()
	fileInfo, err := file.Stat()
	if err != nil {
		return "", nil, false
	}
	body, err := io.ReadAll(file)
	if err != nil {
		return "", nil, false
	}
	decoded := strings.TrimSpace(string(fileencoding.DecodeToUTF8(body)))
	return decoded, fileInfo, decoded != ""
}

type confinedImportResolver struct {
	workspaceRoot string
	active        map[string]bool
}

func (resolver confinedImportResolver) resolve(body, sourcePath string, depth int) string {
	if depth >= maxImportDepth {
		return body
	}
	lines := strings.Split(body, "\n")
	for lineIndex, line := range lines {
		lines[lineIndex] = resolver.resolveImportLine(line, sourcePath, depth)
	}
	return strings.Join(lines, "\n")
}

func (resolver confinedImportResolver) resolveImportLine(line, sourcePath string, depth int) string {
	target, ok := importTarget(line)
	if !ok {
		return line
	}
	resolved, imported, rejection, ok := resolver.readImport(target, sourcePath)
	if rejection != "" {
		return rejectedImportLine(line, rejection)
	}
	if !ok {
		return line
	}
	return resolver.expandImport(line, resolved, imported, depth)
}

func (resolver confinedImportResolver) readImport(target, sourcePath string) (string, string, string, bool) {
	resolved, rejection := confinedImportPath(target, filepath.Dir(sourcePath), resolver.workspaceRoot)
	if rejection != "" {
		return "", "", rejection, false
	}
	imported, _, ok, rejection := readConfinedDocument(resolved, resolver.workspaceRoot)
	return resolved, imported, rejection, ok
}

func (resolver confinedImportResolver) expandImport(line, resolved, imported string, depth int) string {
	identity := physicalPathIdentity(resolved)
	if resolver.active[identity] {
		return line + "  <!-- skipped: import cycle -->"
	}
	resolver.active[identity] = true
	expanded := resolver.resolve(imported, resolved, depth+1)
	delete(resolver.active, identity)
	return expanded
}

func confinedImportPath(target, sourceDir, workspaceRoot string) (string, string) {
	pathTarget, rejection := expandedImportTarget(target)
	if rejection != "" {
		return "", rejection
	}
	path := filepath.Clean(filepath.FromSlash(pathTarget))
	if !filepath.IsAbs(path) {
		path = filepath.Join(sourceDir, path)
	}
	if !pathWithinRoot(path, workspaceRoot) {
		return "", "outside_workspace"
	}
	if realPath, err := filepath.EvalSymlinks(path); err == nil && !pathWithinRoot(realPath, realDirectory(workspaceRoot)) {
		return "", "symlink_escape"
	}
	return path, ""
}

func expandedImportTarget(target string) (string, string) {
	if target == "~" || strings.HasPrefix(target, "~/") || strings.HasPrefix(target, `~\`) {
		home, err := os.UserHomeDir()
		if err != nil || strings.TrimSpace(home) == "" {
			return "", "outside_workspace"
		}
		return filepath.Join(home, filepath.FromSlash(strings.TrimLeft(target[1:], `/\`))), ""
	} else if strings.HasPrefix(target, "~") {
		return "", "outside_workspace"
	}
	return target, ""
}

func rejectedImportLine(line, rejection string) string {
	return fmt.Sprintf("%s  <!-- rejected: import_%s -->", line, rejection)
}

func pathWithinRoot(path, root string) bool {
	path = absOf(path)
	root = absOf(root)
	if path == "" || root == "" {
		return false
	}
	rel, err := filepath.Rel(root, path)
	return err == nil && (rel == "." || filepath.IsLocal(rel))
}

func realDirectory(path string) string {
	resolved, err := filepath.EvalSymlinks(path)
	if err == nil {
		return resolved
	}
	return absOf(path)
}

func physicalPathIdentity(path string) string {
	resolved, err := filepath.EvalSymlinks(path)
	if err == nil {
		return absOf(resolved)
	}
	return absOf(path)
}
