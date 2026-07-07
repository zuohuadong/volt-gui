// Command sign is the CI-side manifest tool for desktop releases. It is never
// shipped in any artifact — the release workflow invokes it via `go run
// ./cmd/sign manifest`.
//
// Subcommands:
//
//	manifest <dir> <ver> <tag>   Scan <dir> for the per-platform artifacts, compute
//	                             size + sha256, and write <dir>/latest.json with GitHub
//	                             release download URLs. The R2 mirror step rewrites those
//	                             URLs to the CDN afterwards.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"voltui/desktop/internal/update"
)

// platforms are the manifest keys we publish. A built artifact is matched to a key
// by substring (file names embed the key, e.g. VoltUI-darwin-arm64.zip), so the
// generator and the updater agree on update.PlatformKey output.
var platforms = []string{"darwin-arm64", "darwin-amd64", "windows-amd64", "windows-arm64", "linux-amd64"}

func main() {
	if len(os.Args) < 2 {
		usage()
	}
	var err error
	switch os.Args[1] {
	case "manifest":
		if len(os.Args) != 5 {
			usage()
		}
		err = genManifest(os.Args[2], os.Args[3], os.Args[4])
	default:
		usage()
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, "sign:", err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage:\n  manifest <dir> <version> <tag>")
	os.Exit(2)
}

// genManifest scans dir for the per-platform artifacts and writes dir/latest.json.
// version is the semver compared by the updater (e.g. "v1.1.0"); tag is the GitHub
// release tag used in download URLs (e.g. "desktop-v1.1.0").
func genManifest(dir, version, tag string) error {
	repo := os.Getenv("GITHUB_REPOSITORY")
	if repo == "" {
		repo = "zuohuadong/volt-gui"
	}
	m := update.Manifest{
		Version:      version,
		DownloadPage: "https://voltui.io/#start",
		Platforms:    map[string]update.Asset{},
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return err
	}
	for _, e := range entries {
		name := e.Name()
		if e.IsDir() || name == "latest.json" || !isUpdaterArtifact(name) {
			continue
		}
		key := matchPlatform(name)
		if key == "" {
			continue
		}
		size, sum, err := hashFile(filepath.Join(dir, name))
		if err != nil {
			return err
		}
		url := fmt.Sprintf("https://github.com/%s/releases/download/%s/%s", repo, tag, name)
		m.Platforms[key] = update.Asset{URL: url, Size: size, SHA256: sum}
		fmt.Printf("manifest: %s -> %s (%d bytes)\n", key, name, size)
	}
	if len(m.Platforms) == 0 {
		return fmt.Errorf("manifest: no platform artifacts found in %s", dir)
	}
	b, err := json.MarshalIndent(m, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, "latest.json"), append(b, '\n'), 0o644)
}

func isUpdaterArtifact(name string) bool {
	return strings.HasSuffix(name, ".tar.gz") ||
		strings.HasSuffix(name, ".zip") ||
		strings.HasSuffix(name, "-installer.exe")
}

// matchPlatform returns the platform key embedded in a file name, or "" if none.
func matchPlatform(name string) string {
	// The .deb is a human-download package (like the macOS .dmg); the Linux updater
	// channel is the .tar.gz. Skip it so it doesn't shadow the tarball's linux-amd64 key.
	if strings.HasSuffix(name, ".deb") {
		return ""
	}
	// The Windows updater channel is the per-arch -installer.exe; the portable .zip
	// is a human download, so skip it or it would shadow the installer's key.
	if strings.Contains(name, "windows-") && !strings.HasSuffix(name, "-installer.exe") {
		return ""
	}
	for _, p := range platforms {
		if strings.Contains(name, p) {
			return p
		}
	}
	return ""
}

// hashFile returns the size and lowercase-hex SHA-256 of a file, streaming it so
// large artifacts don't have to fit in memory.
func hashFile(path string) (int64, string, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, "", err
	}
	defer f.Close()
	h := sha256.New()
	n, err := io.Copy(h, f)
	if err != nil {
		return 0, "", err
	}
	return n, hex.EncodeToString(h.Sum(nil)), nil
}
