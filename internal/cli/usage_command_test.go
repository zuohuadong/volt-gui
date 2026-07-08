package cli

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"voltui/internal/event"
	usageledger "voltui/internal/usage"
)

func TestUsageCommandPrintsLocalSummary(t *testing.T) {
	t.Setenv("VOLTUI_HOME", t.TempDir())
	now := time.Now().UTC()
	for _, rec := range []usageledger.Record{
		{
			SchemaVersion:    usageledger.SchemaVersion,
			Timestamp:        now.Add(-2 * time.Hour),
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
			SchemaVersion:    usageledger.SchemaVersion,
			Timestamp:        now.Add(-time.Hour),
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
	} {
		if err := usageledger.AppendRecord("", rec); err != nil {
			t.Fatalf("AppendRecord: %v", err)
		}
	}

	out := captureStdout(t, func() {
		if rc := usageCommand([]string{"--all"}); rc != 0 {
			t.Fatalf("usageCommand rc = %d, want 0", rc)
		}
	})
	for _, want := range []string{"Local usage", "Total:", "1,580", "deepseek", "subagent", "desktop"} {
		if !strings.Contains(out, want) {
			t.Fatalf("usage output missing %q:\n%s", want, out)
		}
	}
}

func TestUsageCommandPrintsJSON(t *testing.T) {
	t.Setenv("VOLTUI_HOME", t.TempDir())
	if err := usageledger.AppendRecord("", usageledger.Record{
		SchemaVersion:    usageledger.SchemaVersion,
		Timestamp:        time.Now().UTC(),
		Surface:          "run",
		Model:            "deepseek",
		UsageSource:      event.UsageSourceExecutor,
		PromptTokens:     10,
		CompletionTokens: 2,
		TotalTokens:      12,
	}); err != nil {
		t.Fatalf("AppendRecord: %v", err)
	}

	out := captureStdout(t, func() {
		if rc := usageCommand([]string{"--all", "--json"}); rc != 0 {
			t.Fatalf("usageCommand rc = %d, want 0", rc)
		}
	})
	var report usageledger.Report
	if err := json.Unmarshal([]byte(out), &report); err != nil {
		t.Fatalf("usage JSON did not decode: %v\n%s", err, out)
	}
	if report.Records != 1 || report.Totals.TotalTokens != 12 {
		t.Fatalf("report = %+v, want one 12-token record", report)
	}
}

func TestParseUsageSince(t *testing.T) {
	now := time.Date(2026, 7, 8, 12, 0, 0, 0, time.UTC)
	got, err := parseUsageSince("7d", now)
	if err != nil {
		t.Fatalf("parseUsageSince 7d: %v", err)
	}
	if want := now.AddDate(0, 0, -7); !got.Equal(want) {
		t.Fatalf("7d = %s, want %s", got, want)
	}
	got, err = parseUsageSince("2026-07-01", now)
	if err != nil {
		t.Fatalf("parseUsageSince date: %v", err)
	}
	if got.Format("2006-01-02") != "2026-07-01" {
		t.Fatalf("date parse = %s", got)
	}
	if _, err := parseUsageSince("-1d", now); err == nil {
		t.Fatal("negative days parsed successfully, want error")
	}
}
