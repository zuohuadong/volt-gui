//go:build bot

package main

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"voltui/internal/agent"
	"voltui/internal/control"
	"voltui/internal/event"
	"voltui/internal/provider"
	"voltui/internal/tool"
)

type usageProvider struct {
	usage *provider.Usage
}

func (p usageProvider) Name() string { return "usage" }

func (p usageProvider) Stream(_ context.Context, _ provider.Request) (<-chan provider.Chunk, error) {
	ch := make(chan provider.Chunk, 2)
	ch <- provider.Chunk{Type: provider.ChunkText, Text: "ok"}
	ch <- provider.Chunk{Type: provider.ChunkUsage, Usage: p.usage}
	close(ch)
	return ch, nil
}

func TestTelemetryLoadsLegacyReadFileArray(t *testing.T) {
	path := filepath.Join(t.TempDir(), "session.jsonl.telemetry.json")
	if err := os.WriteFile(path, []byte(`[{"path":"README.md","turn":2,"time":1000}]`), 0o644); err != nil {
		t.Fatalf("write legacy telemetry: %v", err)
	}

	got := loadTelemetry(path)
	if len(got) != 1 || got[0].Path != "README.md" {
		t.Fatalf("legacy read files = %+v", got)
	}
}

func TestWorkspaceTabRecordsReadFileTelemetry(t *testing.T) {
	tab := &WorkspaceTab{ID: "tab"}
	app := &App{tabs: map[string]*WorkspaceTab{"tab": tab}}
	sink := &tabEventSink{tabID: "tab", app: app}

	sink.Emit(event.Event{
		Kind: event.ToolResult,
		Tool: event.Tool{
			Name:      "read_file",
			Args:      `{"path":"README.md","offset":5,"limit":10}`,
			Output:    "File truncated",
			Truncated: true,
		},
	})

	got := tab.readTelemetrySnapshot()
	if len(got) != 1 {
		t.Fatalf("read telemetry len = %d, want 1", len(got))
	}
	if rec := got[0]; rec.Path != "README.md" || rec.Offset != 5 || rec.Limit != 10 || !rec.Truncated {
		t.Fatalf("read telemetry = %+v, want README.md offset/limit/truncated", rec)
	}
}

func TestContextPanelUsesLastUsageBreakdown(t *testing.T) {
	lastUsage := &provider.Usage{
		PromptTokens:     10,
		CompletionTokens: 4,
		TotalTokens:      14,
		CacheHitTokens:   7,
		CacheMissTokens:  3,
		ReasoningTokens:  2,
	}
	ag := agent.New(
		usageProvider{usage: lastUsage},
		tool.NewRegistry(),
		agent.NewSession("system"),
		agent.Options{ContextWindow: 200},
		event.Discard,
	)
	if err := ag.Run(context.Background(), "hello"); err != nil {
		t.Fatal(err)
	}
	tab := &WorkspaceTab{
		ID:    "tab",
		Ctrl:  control.New(control.Options{Executor: ag, Sink: event.Discard}),
		Scope: "global",
		Ready: true,
	}
	app := &App{tabs: map[string]*WorkspaceTab{"tab": tab}}

	panel := app.ContextPanel("tab")
	if panel.UsedTokens != 10 || panel.WindowTokens != 200 {
		t.Fatalf("context panel gauge = used:%d window:%d, want 10/200", panel.UsedTokens, panel.WindowTokens)
	}
	if panel.PromptTokens != 10 || panel.CompletionTokens != 4 || panel.ReasoningTokens != 2 {
		t.Fatalf("context panel breakdown = prompt:%d completion:%d reasoning:%d, want last usage 10/4/2",
			panel.PromptTokens, panel.CompletionTokens, panel.ReasoningTokens)
	}
	if panel.CacheHitTokens != 7 || panel.CacheMissTokens != 3 {
		t.Fatalf("context panel cache breakdown = hit:%d miss:%d, want last usage 7/3",
			panel.CacheHitTokens, panel.CacheMissTokens)
	}
}
