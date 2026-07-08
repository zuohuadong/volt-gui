package update

import "testing"

// TestPlatformKey pins the key format the manifest generator and the updater both
// rely on; if these drift, lookups silently miss.
func TestPlatformKey(t *testing.T) {
	if got := PlatformKey("darwin", "arm64"); got != "darwin-arm64" {
		t.Fatalf("PlatformKey = %q, want darwin-arm64", got)
	}
}

// TestManifestAsset checks the running-platform lookup returns the listed asset
// and reports absence cleanly.
func TestManifestAsset(t *testing.T) {
	want := Asset{URL: "https://example/app", SHA256: "abc", Size: 42}
	m := Manifest{Platforms: map[string]Asset{CurrentPlatform(): want}}
	got, ok := m.Asset()
	if !ok || got != want {
		t.Fatalf("Asset() = %+v, %v; want %+v, true", got, ok, want)
	}
	if _, ok := (Manifest{Platforms: map[string]Asset{}}).Asset(); ok {
		t.Fatal("Asset() should report absence for an empty manifest")
	}
}
