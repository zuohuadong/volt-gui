package usage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"voltui/internal/event"
	"voltui/internal/provider"
)

func TestRecordingSinkWritesContentFreeLedgerRecord(t *testing.T) {
	path := filepath.Join(t.TempDir(), "usage.jsonl")
	now := time.Date(2026, 7, 8, 12, 30, 0, 0, time.UTC)
	sink := NewRecordingSink(event.Discard, Metadata{
		Surface:       "chat",
		Model:         func() string { return "deepseek/deepseek-v4-flash" },
		SessionPath:   func() string { return "/tmp/private/session-1.jsonl" },
		WorkspaceRoot: func() string { return "/tmp/private/project-alpha" },
		Now:           func() time.Time { return now },
		LedgerPath:    func() string { return path },
	})

	sink.Emit(event.Event{
		Kind:        event.Usage,
		UsageSource: event.UsageSourcePlanner,
		Usage: &provider.Usage{
			PromptTokens:     1000,
			CompletionTokens: 200,
			TotalTokens:      1200,
			ReasoningTokens:  25,
			CacheHitTokens:   800,
			CacheMissTokens:  200,
		},
		Pricing: &provider.Pricing{CacheHit: 0.02, Input: 1, Output: 2, Currency: "¥"},
	})

	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if strings.Contains(string(b), "private/session") || strings.Contains(string(b), "project-alpha/") {
		t.Fatalf("usage ledger leaked full local paths: %s", string(b))
	}
	var rec Record
	if err := json.Unmarshal([]byte(strings.TrimSpace(string(b))), &rec); err != nil {
		t.Fatalf("Unmarshal: %v\n%s", err, string(b))
	}
	if rec.Timestamp != now || rec.Surface != "chat" || rec.Model != "deepseek/deepseek-v4-flash" {
		t.Fatalf("record metadata = %+v", rec)
	}
	if rec.SessionID != "session-1" || rec.Workspace != "project-alpha" || rec.WorkspaceHash == "" {
		t.Fatalf("record local labels = session %q workspace %q hash %q", rec.SessionID, rec.Workspace, rec.WorkspaceHash)
	}
	if rec.PromptTokens != 1000 || rec.CompletionTokens != 200 || rec.TotalTokens != 1200 || rec.CacheHitTokens != 800 || rec.CacheMissTokens != 200 {
		t.Fatalf("record usage = %+v", rec)
	}
	if rec.Currency != "¥" || rec.Cost <= 0 {
		t.Fatalf("record cost = %f %q, want positive ¥", rec.Cost, rec.Currency)
	}
}

func TestLoadReportFiltersAndAggregatesUsage(t *testing.T) {
	path := filepath.Join(t.TempDir(), "usage.jsonl")
	base := time.Date(2026, 7, 8, 10, 0, 0, 0, time.UTC)
	records := []Record{
		{
			SchemaVersion:    SchemaVersion,
			Timestamp:        base.Add(-48 * time.Hour),
			Surface:          "run",
			Model:            "old",
			UsageSource:      event.UsageSourceExecutor,
			PromptTokens:     900,
			CompletionTokens: 100,
			TotalTokens:      1000,
		},
		{
			SchemaVersion:    SchemaVersion,
			Timestamp:        base.Add(-2 * time.Hour),
			Surface:          "run",
			Model:            "deepseek",
			UsageSource:      event.UsageSourceExecutor,
			PromptTokens:     1000,
			CompletionTokens: 200,
			TotalTokens:      1200,
			CacheHitTokens:   750,
			CacheMissTokens:  250,
			Cost:             0.00115,
			Currency:         "¥",
		},
		{
			SchemaVersion:    SchemaVersion,
			Timestamp:        base.Add(-time.Hour),
			Surface:          "desktop",
			Model:            "deepseek",
			UsageSource:      event.UsageSourceSubagent,
			PromptTokens:     300,
			CompletionTokens: 80,
			TotalTokens:      380,
			CacheHitTokens:   100,
			CacheMissTokens:  200,
			Cost:             0.0004,
			Currency:         "¥",
		},
	}
	for _, rec := range records {
		if err := AppendRecord(path, rec); err != nil {
			t.Fatalf("AppendRecord: %v", err)
		}
	}
	if err := os.WriteFile(path, append(mustReadFile(t, path), []byte("not-json\n")...), 0o644); err != nil {
		t.Fatalf("append bad line: %v", err)
	}

	report, err := LoadReport(path, Query{Since: base.Add(-24 * time.Hour)})
	if err != nil {
		t.Fatalf("LoadReport: %v", err)
	}
	if report.Records != 2 || report.Skipped != 1 {
		t.Fatalf("records/skipped = %d/%d, want 2/1", report.Records, report.Skipped)
	}
	if report.Totals.Requests != 2 || report.Totals.TotalTokens != 1580 || report.Totals.PromptTokens != 1300 || report.Totals.CompletionTokens != 280 {
		t.Fatalf("totals = %+v", report.Totals)
	}
	if report.Totals.CacheHitTokens != 850 || report.Totals.CacheMissTokens != 450 {
		t.Fatalf("cache totals = hit %d miss %d", report.Totals.CacheHitTokens, report.Totals.CacheMissTokens)
	}
	if got := report.Totals.CostByCurrency["¥"]; got < 0.00154 || got > 0.00156 {
		t.Fatalf("cost total = %.8f, want ~0.00155", got)
	}
	if len(report.ByModel) == 0 || report.ByModel[0].Key != "deepseek" || report.ByModel[0].Totals.TotalTokens != 1580 {
		t.Fatalf("by model = %+v", report.ByModel)
	}
	if len(report.BySource) != 2 || report.BySource[0].Key != event.UsageSourceExecutor {
		t.Fatalf("by source order = %+v", report.BySource)
	}
}

func mustReadFile(t *testing.T, path string) []byte {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	return b
}
