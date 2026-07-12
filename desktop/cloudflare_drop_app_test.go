package main

import (
	"archive/zip"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestCloudflareDropPluginIsVisibleDisabledByDefault(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()

	for _, plugin := range app.WorkbenchPlugins() {
		if plugin.ID != cloudflareDropPluginID {
			continue
		}
		if plugin.Enabled {
			t.Fatalf("Cloudflare Drop plugin should be disabled by default: %+v", plugin)
		}
		if plugin.Entry != cloudflareDropPluginID || plugin.Kind != "native" {
			t.Fatalf("Cloudflare Drop plugin metadata = %+v", plugin)
		}
		return
	}
	t.Fatal("Cloudflare Drop plugin was not exposed through WorkbenchPlugins")
}

func TestCloudflareDropPickBindingsDoNotAcceptSourcePaths(t *testing.T) {
	var folderPicker func(*App) (CloudflareDropPreflight, error) = (*App).PickCloudflareDropFolder
	var zipPicker func(*App) (CloudflareDropPreflight, error) = (*App).PickCloudflareDropZIP
	if folderPicker == nil || zipPicker == nil {
		t.Fatal("Cloudflare Drop picker bindings must return preflight metadata without a source-path parameter")
	}
}

func TestCloudflareDropPreflightReturnsOnlyDisplayStatsForEnabledPlugin(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()
	enableCloudflareDropPlugin(t, app)

	source := t.TempDir()
	if err := os.WriteFile(filepath.Join(source, "index.html"), []byte("<!doctype html>"), 0o644); err != nil {
		t.Fatalf("write root index: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(source, "assets"), 0o755); err != nil {
		t.Fatalf("create assets: %v", err)
	}
	if err := os.WriteFile(filepath.Join(source, "assets", "app.js"), []byte("console.log('drop')"), 0o644); err != nil {
		t.Fatalf("write asset: %v", err)
	}

	preflight, err := preflightCloudflareDropSource(source)
	if err != nil {
		t.Fatalf("preflightCloudflareDropSource: %v", err)
	}
	if !preflight.Valid || !preflight.HasRootIndex || preflight.SourceName != filepath.Base(source) || preflight.SourceType != "folder" {
		t.Fatalf("preflight = %+v", preflight)
	}
	if preflight.FileCount != 2 || preflight.TotalBytes <= 0 || preflight.LargestFileName == "" || preflight.LargestFileBytes <= 0 {
		t.Fatalf("preflight stats = %+v", preflight)
	}
	encoded, err := json.Marshal(preflight)
	if err != nil {
		t.Fatalf("marshal preflight: %v", err)
	}
	if strings.Contains(string(encoded), source) {
		t.Fatalf("preflight must not return the absolute local path: %s", encoded)
	}
}

func TestCloudflareDropPreflightRejectsWhenPluginIsDisabled(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()

	if _, err := app.PickCloudflareDropFolder(); err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("PickCloudflareDropFolder disabled error = %v, want disabled rejection", err)
	}
}

func TestCloudflareDropPreflightAcceptsZIPWithRootIndex(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()
	enableCloudflareDropPlugin(t, app)

	archivePath := filepath.Join(t.TempDir(), "landing.zip")
	archiveFile, err := os.Create(archivePath)
	if err != nil {
		t.Fatalf("create ZIP: %v", err)
	}
	writer := zip.NewWriter(archiveFile)
	for name, body := range map[string]string{"index.html": "<!doctype html>", "assets/app.js": "console.log('drop')"} {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatalf("create ZIP entry %s: %v", name, err)
		}
		if _, err := entry.Write([]byte(body)); err != nil {
			t.Fatalf("write ZIP entry %s: %v", name, err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatalf("close ZIP writer: %v", err)
	}
	if err := archiveFile.Close(); err != nil {
		t.Fatalf("close ZIP: %v", err)
	}

	preflight, err := preflightCloudflareDropSource(archivePath)
	if err != nil {
		t.Fatalf("preflightCloudflareDropSource ZIP: %v", err)
	}
	if !preflight.Valid || !preflight.HasRootIndex || preflight.SourceName != "landing.zip" || preflight.SourceType != "zip" || preflight.FileCount != 2 {
		t.Fatalf("ZIP preflight = %+v", preflight)
	}
}

func TestCloudflareDropOpenUsesFixedOfficialURLAndRejectsDisabledPlugin(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()
	if err := app.OpenCloudflareDrop(); err == nil || !strings.Contains(err.Error(), "disabled") {
		t.Fatalf("OpenCloudflareDrop disabled error = %v, want disabled rejection", err)
	}

	enableCloudflareDropPlugin(t, app)
	originalOpen := openCloudflareDropURL
	t.Cleanup(func() { openCloudflareDropURL = originalOpen })
	opened := ""
	openCloudflareDropURL = func(_ *App, target string) error {
		opened = target
		return nil
	}
	if err := app.OpenCloudflareDrop(); err != nil {
		t.Fatalf("OpenCloudflareDrop: %v", err)
	}
	if opened != cloudflareDropOfficialURL {
		t.Fatalf("opened URL = %q, want fixed official URL %q", opened, cloudflareDropOfficialURL)
	}
}

func TestCloudflareDropPreflightRejectsKnownStaticLimits(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()
	enableCloudflareDropPlugin(t, app)

	missingIndex, err := preflightCloudflareDropSource(t.TempDir())
	if err != nil || missingIndex.Valid || !preflightHasIssue(missingIndex, "index.html") {
		t.Fatalf("missing-index preflight = %+v, err = %v", missingIndex, err)
	}

	overFileLimit := t.TempDir()
	writeDropIndex(t, overFileLimit)
	makeSparseFile(t, filepath.Join(overFileLimit, "large.bin"), cloudflareDropMaxFileBytes+1)
	largeFile, err := preflightCloudflareDropSource(overFileLimit)
	if err != nil || largeFile.Valid || !preflightHasIssue(largeFile, "单个文件") {
		t.Fatalf("large-file preflight = %+v, err = %v", largeFile, err)
	}

	overTotalLimit := t.TempDir()
	writeDropIndex(t, overTotalLimit)
	for i := 0; i < 5; i++ {
		makeSparseFile(t, filepath.Join(overTotalLimit, "asset-"+string(rune('a'+i))+".bin"), 21*1024*1024)
	}
	largeTotal, err := preflightCloudflareDropSource(overTotalLimit)
	if err != nil || largeTotal.Valid || !preflightHasIssue(largeTotal, "总量") {
		t.Fatalf("large-total preflight = %+v, err = %v", largeTotal, err)
	}

	overFileCount := t.TempDir()
	writeDropIndex(t, overFileCount)
	for i := 0; i < cloudflareDropMaxFiles-1; i++ {
		if err := os.WriteFile(filepath.Join(overFileCount, "file-"+string(rune('a'+i%26))+"-"+strings.Repeat("x", i/26)), nil, 0o644); err != nil {
			t.Fatalf("write file count fixture: %v", err)
		}
	}
	largeCount, err := preflightCloudflareDropSource(overFileCount)
	if err != nil || largeCount.Valid || !preflightHasIssue(largeCount, "文件数") {
		t.Fatalf("large-count preflight = %+v, err = %v", largeCount, err)
	}
}

func writeDropIndex(t *testing.T, root string) {
	t.Helper()
	if err := os.WriteFile(filepath.Join(root, "index.html"), []byte("<!doctype html>"), 0o644); err != nil {
		t.Fatalf("write root index: %v", err)
	}
}

func makeSparseFile(t *testing.T, path string, size int64) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatalf("create sparse file: %v", err)
	}
	if err := file.Truncate(size); err != nil {
		_ = file.Close()
		t.Fatalf("truncate sparse file: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close sparse file: %v", err)
	}
}

func preflightHasIssue(preflight CloudflareDropPreflight, text string) bool {
	return strings.Contains(strings.Join(preflight.Issues, " / "), text)
}

func enableCloudflareDropPlugin(t *testing.T, app *App) {
	t.Helper()
	plugin := builtinCloudflareDropPlugin()
	if err := app.SaveWorkbenchPlugin(WorkbenchPluginInput{
		ID:           plugin.ID,
		Name:         plugin.Name,
		Kind:         plugin.Kind,
		Entry:        plugin.Entry,
		Version:      plugin.Version,
		Capabilities: plugin.Capabilities,
		Enabled:      true,
	}); err != nil {
		t.Fatalf("enable Cloudflare Drop plugin: %v", err)
	}
}
