package capability

import (
	"testing"

	"reasonix/internal/config"
	"reasonix/internal/plugin"
)

func boolPtr(b bool) *bool { return &b }

func TestLoadCachedToolsForSpecsHonorsFingerprint(t *testing.T) {
	t.Setenv("REASONIX_CACHE_HOME", t.TempDir())
	fresh := plugin.Spec{Name: "gh", Type: "stdio", Command: "gh-mcp"}
	if err := plugin.SaveCachedSchema("gh", plugin.CachedSchema{
		SpecHash: plugin.SpecFingerprint(fresh),
		Tools:    []plugin.CachedTool{{Name: "search_issues", Description: "search", ReadOnly: true}},
	}); err != nil {
		t.Fatal(err)
	}
	stale := plugin.Spec{Name: "old", Type: "stdio", Command: "old-mcp"}
	if err := plugin.SaveCachedSchema("old", plugin.CachedSchema{
		SpecHash: "some-other-fingerprint",
		Tools:    []plugin.CachedTool{{Name: "do_thing"}},
	}); err != nil {
		t.Fatal(err)
	}

	cached, hashOK := LoadCachedToolsForSpecs([]plugin.Spec{fresh, stale, {Name: "absent"}})
	if len(cached["gh"]) != 1 || !hashOK["gh"] {
		t.Fatalf("fresh cache: tools=%v hashOK=%v", cached["gh"], hashOK["gh"])
	}
	if len(cached["old"]) != 1 || hashOK["old"] {
		t.Fatalf("stale cache must load with hashOK=false: tools=%v hashOK=%v", cached["old"], hashOK["old"])
	}
	if _, ok := cached["absent"]; ok {
		t.Fatal("server without cache must be absent")
	}
}

func TestBuildCatalogSurfacesCachedToolsForAutoStartFalse(t *testing.T) {
	cached := map[string][]plugin.CachedTool{
		"gh":  {{Name: "search_issues", Description: "search", ReadOnly: true}},
		"old": {{Name: "do_thing"}},
	}
	hashOK := map[string]bool{"gh": true, "old": false}
	cat := BuildCatalog(CatalogOptions{
		Plugins: []config.PluginEntry{
			{Name: "gh", AutoStart: boolPtr(false)},
			{Name: "old", AutoStart: boolPtr(false)},
		},
		Profile:     ProfileDelivery,
		CachedTools: cached,
		CacheHashOK: hashOK,
	})
	byID := map[string]Entry{}
	for _, e := range cat.Entries {
		byID[e.ID] = e
	}
	toolEntry, ok := byID["mcp-tool:gh/search_issues"]
	if !ok {
		t.Fatalf("cached tool missing from catalog: %v", cat.Entries)
	}
	if !toolEntry.ReadOnly || toolEntry.ToolName == "" {
		t.Fatalf("cached tool entry lost metadata: %+v", toolEntry)
	}
	if server := byID["mcp-server:old"]; server.Status != StatusStale {
		t.Fatalf("fingerprint-mismatched cache should mark the server stale, got %q", server.Status)
	}
	if _, ok := byID["mcp-tool:old/do_thing"]; !ok {
		t.Fatal("stale cached tools should still appear as candidates")
	}
}

func TestRecordRouterUsageAccumulates(t *testing.T) {
	a := &Audit{}
	a.RecordRouterUsage(100, 20, 0.005, 340)
	a.RecordRouterUsage(50, 10, 0.002, 160)
	snap := a.Snapshot()
	if snap.RouterPromptTokens != 150 || snap.RouterCompletionTokens != 30 {
		t.Fatalf("token counters: prompt=%d completion=%d", snap.RouterPromptTokens, snap.RouterCompletionTokens)
	}
	if snap.RouterCost < 0.0069 || snap.RouterCost > 0.0071 {
		t.Fatalf("cost = %v", snap.RouterCost)
	}
	if snap.RouterLatencyMs != 500 {
		t.Fatalf("latency = %v", snap.RouterLatencyMs)
	}
}
