package main

import (
	"archive/zip"
	"fmt"
	"io/fs"
	"math"
	"os"
	"path/filepath"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"
	"voltui/internal/workbench"
)

const (
	cloudflareDropPluginID      = "cloudflare-drop-publish"
	cloudflareDropOfficialURL   = "https://www.cloudflare.com/drop"
	cloudflareDropMaxFileBytes  = 25 * 1024 * 1024
	cloudflareDropMaxTotalBytes = 100 * 1024 * 1024
	cloudflareDropMaxFiles      = 2000
)

var openCloudflareDropURL = func(app *App, target string) error {
	if target != cloudflareDropOfficialURL {
		return fmt.Errorf("Cloudflare Drop target must be the official page")
	}
	return app.openAuthURL(target)
}

// CloudflareDropPreflight contains only the selected source's display metadata
// and aggregate checks. It deliberately does not expose or persist local paths.
type CloudflareDropPreflight struct {
	SourceName       string   `json:"sourceName"`
	SourceType       string   `json:"sourceType"`
	HasRootIndex     bool     `json:"hasRootIndex"`
	FileCount        int      `json:"fileCount"`
	TotalBytes       int64    `json:"totalBytes"`
	LargestFileName  string   `json:"largestFileName"`
	LargestFileBytes int64    `json:"largestFileBytes"`
	Valid            bool     `json:"valid"`
	Issues           []string `json:"issues"`
}

func builtinCloudflareDropPlugin() workbench.Plugin {
	return workbench.Plugin{
		ID:           cloudflareDropPluginID,
		Name:         "Cloudflare Drop Publish",
		Kind:         "native",
		Entry:        cloudflareDropPluginID,
		Version:      "v1.0",
		Capabilities: []string{"static-preview", "local-preflight", "web-handoff"},
		Config:       map[string]string{},
		Enabled:      false,
	}
}

// preflightCloudflareDropSource inspects a native-picker path inside the desktop
// process. It is intentionally not exported to the Wails webview bridge.
func preflightCloudflareDropSource(sourcePath string) (CloudflareDropPreflight, error) {
	info, err := os.Stat(sourcePath)
	if err != nil {
		return CloudflareDropPreflight{}, fmt.Errorf("cannot inspect the selected source")
	}
	if info.IsDir() {
		return preflightCloudflareDropDirectory(sourcePath)
	}
	if !info.Mode().IsRegular() || !strings.EqualFold(filepath.Ext(sourcePath), ".zip") {
		return CloudflareDropPreflight{}, fmt.Errorf("select a folder or ZIP archive")
	}
	return preflightCloudflareDropZIP(sourcePath, info.Size())
}

// PickCloudflareDropFolder selects and preflights a local folder entirely in
// the desktop process. The webview receives only safe display metadata.
func (a *App) PickCloudflareDropFolder() (CloudflareDropPreflight, error) {
	if !a.cloudflareDropPluginEnabled() {
		return CloudflareDropPreflight{}, fmt.Errorf("Cloudflare Drop Publish is disabled")
	}
	if a.ctx == nil {
		return CloudflareDropPreflight{}, nil
	}
	path, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Choose static site folder for local preflight",
		DefaultDirectory: dialogDefaultDirectory(a.activeWorkspaceRoot()),
	})
	if err != nil || path == "" {
		return CloudflareDropPreflight{}, err
	}
	return preflightCloudflareDropSource(filepath.Clean(path))
}

// PickCloudflareDropZIP selects and preflights a ZIP archive entirely in the
// desktop process. The selected path is neither returned nor persisted.
func (a *App) PickCloudflareDropZIP() (CloudflareDropPreflight, error) {
	if !a.cloudflareDropPluginEnabled() {
		return CloudflareDropPreflight{}, fmt.Errorf("Cloudflare Drop Publish is disabled")
	}
	if a.ctx == nil {
		return CloudflareDropPreflight{}, nil
	}
	path, err := runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            "Choose ZIP archive for local preflight",
		DefaultDirectory: dialogDefaultDirectory(a.activeWorkspaceRoot()),
		Filters: []runtime.FileFilter{
			{DisplayName: "ZIP archives (*.zip)", Pattern: "*.zip"},
		},
	})
	if err != nil || path == "" {
		return CloudflareDropPreflight{}, err
	}
	return preflightCloudflareDropSource(filepath.Clean(path))
}

// OpenCloudflareDrop hands the user to the fixed official Drop page. It accepts
// no URL parameter, does not upload data, and cannot navigate to arbitrary URLs.
func (a *App) OpenCloudflareDrop() error {
	if !a.cloudflareDropPluginEnabled() {
		return fmt.Errorf("Cloudflare Drop Publish is disabled")
	}
	return openCloudflareDropURL(a, cloudflareDropOfficialURL)
}

func (a *App) cloudflareDropPluginEnabled() bool {
	for _, plugin := range a.WorkbenchPlugins() {
		if plugin.ID == cloudflareDropPluginID {
			return plugin.Enabled
		}
	}
	return false
}

func preflightCloudflareDropDirectory(sourcePath string) (CloudflareDropPreflight, error) {
	result := CloudflareDropPreflight{
		SourceName: filepath.Base(filepath.Clean(sourcePath)),
		SourceType: "folder",
		Issues:     []string{},
	}
	err := filepath.WalkDir(sourcePath, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.IsDir() {
			return nil
		}
		if entry.Type()&os.ModeSymlink != 0 {
			result.Issues = append(result.Issues, "源目录不能包含符号链接")
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		relative, err := filepath.Rel(sourcePath, path)
		if err != nil {
			return err
		}
		result.FileCount++
		result.TotalBytes += info.Size()
		if info.Size() > result.LargestFileBytes {
			result.LargestFileBytes = info.Size()
			result.LargestFileName = filepath.ToSlash(relative)
		}
		if filepath.ToSlash(relative) == "index.html" {
			result.HasRootIndex = true
		}
		if info.Size() > cloudflareDropMaxFileBytes {
			result.Issues = append(result.Issues, "存在超过 25 MiB 的单个文件")
		}
		return nil
	})
	if err != nil {
		return CloudflareDropPreflight{}, fmt.Errorf("cannot inspect the selected folder")
	}
	return finalizeCloudflareDropPreflight(result), nil
}

func preflightCloudflareDropZIP(sourcePath string, archiveBytes int64) (CloudflareDropPreflight, error) {
	result := CloudflareDropPreflight{
		SourceName: filepath.Base(filepath.Clean(sourcePath)),
		SourceType: "zip",
		Issues:     []string{},
	}
	if archiveBytes > cloudflareDropMaxFileBytes {
		result.Issues = append(result.Issues, "ZIP 文件超过 25 MiB")
	}
	reader, err := zip.OpenReader(sourcePath)
	if err != nil {
		return CloudflareDropPreflight{}, fmt.Errorf("cannot inspect the selected ZIP archive")
	}
	defer reader.Close()
	for _, entry := range reader.File {
		if entry.FileInfo().IsDir() {
			continue
		}
		name := filepath.ToSlash(entry.Name)
		if name == "" || strings.HasPrefix(name, "/") || strings.Contains(name, "../") || strings.HasPrefix(name, "..") {
			result.Issues = append(result.Issues, "ZIP 包含无效文件路径")
			continue
		}
		if entry.Mode()&os.ModeSymlink != 0 {
			result.Issues = append(result.Issues, "ZIP 不能包含符号链接")
			continue
		}
		size := entry.UncompressedSize64
		result.FileCount++
		if size > uint64(math.MaxInt64) || result.TotalBytes > math.MaxInt64-int64(size) {
			result.TotalBytes = math.MaxInt64
		} else {
			result.TotalBytes += int64(size)
		}
		if size > uint64(result.LargestFileBytes) {
			result.LargestFileBytes = int64(minUint64(size, uint64(math.MaxInt64)))
			result.LargestFileName = name
		}
		if name == "index.html" {
			result.HasRootIndex = true
		}
		if size > uint64(cloudflareDropMaxFileBytes) {
			result.Issues = append(result.Issues, "存在超过 25 MiB 的单个文件")
		}
	}
	return finalizeCloudflareDropPreflight(result), nil
}

func minUint64(value, max uint64) uint64 {
	if value > max {
		return max
	}
	return value
}

func finalizeCloudflareDropPreflight(result CloudflareDropPreflight) CloudflareDropPreflight {
	if !result.HasRootIndex {
		result.Issues = append(result.Issues, "根目录缺少 index.html")
	}
	if result.TotalBytes > cloudflareDropMaxTotalBytes {
		result.Issues = append(result.Issues, "文件总量超过 100 MiB")
	}
	if result.FileCount >= cloudflareDropMaxFiles {
		result.Issues = append(result.Issues, "文件数必须少于 2000")
	}
	result.Valid = len(result.Issues) == 0
	return result
}
