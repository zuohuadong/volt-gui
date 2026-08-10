package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"voltui/internal/agent"
	"voltui/internal/control"
	"voltui/internal/event"
	"voltui/internal/provider"
	"voltui/internal/tool"
)

const officeHistoryTestContract = `质量门禁：
- 最终只能输出一份正文。
- 交付前必须全文校对。`

func TestOfficeOutputHistoryKeepsOnlyTheFinalDocument(t *testing.T) {
	prov := &officeHistoryProvider{responses: []string{
		"# 草稿\n\n尚未校对。",
		"# 最终报告\n\n已校对正文。",
	}}
	runtime := agent.New(prov, tool.NewRegistry(), agent.NewSession("system"), agent.Options{}, event.Discard)

	if err := runtime.Run(context.Background(), officeHistoryTestContract); err != nil {
		t.Fatalf("Run: %v", err)
	}

	resolveUserContent := control.StripComposePrefixes
	history := historyMessages(runtime.Session().Snapshot(), resolveUserContent)
	assertVisibleOfficeHistory(t, history)

	page := historyPageFromProviderMessages(runtime.Session().Snapshot(), resolveUserContent, nil, nil, 0, 60)
	if page.TotalTurns != 1 {
		t.Fatalf("TotalTurns = %d, want 1 visible user turn", page.TotalTurns)
	}
	assertVisibleOfficeHistory(t, page.Messages)

	sessionDir := t.TempDir()
	sessionPath := filepath.Join(sessionDir, "office-history.jsonl")
	if err := runtime.Session().Save(sessionPath); err != nil {
		t.Fatalf("Save: %v", err)
	}
	preview, err := previewSessionMessages(sessionDir, sessionPath)
	if err != nil {
		t.Fatalf("previewSessionMessages: %v", err)
	}
	assertVisibleOfficeHistory(t, preview)
	previewPage, err := previewSessionPage(sessionDir, sessionPath, 0, 60)
	if err != nil {
		t.Fatalf("previewSessionPage: %v", err)
	}
	if previewPage.TotalTurns != 1 {
		t.Fatalf("preview TotalTurns = %d, want 1", previewPage.TotalTurns)
	}
	assertVisibleOfficeHistory(t, previewPage.Messages)
}

func TestOfficeOutputHistoryKeepsToolTraceWithoutDraftText(t *testing.T) {
	call := provider.ToolCall{ID: "call-1", Name: "calculator", Arguments: `{"expression":"2+2"}`}
	messages := []provider.Message{
		{Role: provider.RoleUser, Content: officeHistoryTestContract},
		{
			Role:             provider.RoleAssistant,
			Content:          "让我先计算。",
			ReasoningContent: "内部推演",
			ToolCalls:        []provider.ToolCall{call},
			DisplayToolsOnly: true,
		},
		{Role: provider.RoleTool, ToolCallID: call.ID, Name: call.Name, Content: "4"},
		{Role: provider.RoleUser, Content: "内部校对", DisplayHidden: true},
		{Role: provider.RoleAssistant, Content: "# 最终报告\n\n结果为 4。"},
	}

	history := historyMessages(messages, control.StripComposePrefixes)
	if len(history) != 4 {
		t.Fatalf("history = %+v, want user, tool call, tool result, final assistant", history)
	}
	toolTurn := history[1]
	if toolTurn.Role != "assistant" || toolTurn.Content != "" || toolTurn.Reasoning != "" || len(toolTurn.ToolCalls) != 1 {
		t.Fatalf("tool turn = %+v, want tool metadata without draft text or reasoning", toolTurn)
	}
	if history[3].Content != "# 最终报告\n\n结果为 4。" {
		t.Fatalf("final assistant = %+v", history[3])
	}
}

func TestOfficeOutputPromptHistorySkipsHiddenEventLogUser(t *testing.T) {
	path := filepath.Join(t.TempDir(), "office-prompts.jsonl")
	session := agent.NewSession("system")
	session.Add(provider.Message{Role: provider.RoleUser, Content: "生成最终报告"})
	if err := session.SaveSnapshot(path); err != nil {
		t.Fatalf("SaveSnapshot initial prompt: %v", err)
	}
	session.Add(provider.Message{Role: provider.RoleAssistant, Content: "草稿", DisplayHidden: true})
	session.Add(provider.Message{Role: provider.RoleUser, Content: "内部校对提示", DisplayHidden: true})
	if err := session.SaveSnapshot(path); err != nil {
		t.Fatalf("SaveSnapshot hidden prompt: %v", err)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	entries, err := collectPromptHistoryEntries(path, info, control.StripComposePrefixes)
	assertVisibleOfficePrompts(t, entries, err)
}

func TestOfficeOutputPromptHistorySkipsHiddenJSONLUser(t *testing.T) {
	path := filepath.Join(t.TempDir(), "office-prompts.jsonl")
	var encoded bytes.Buffer
	enc := json.NewEncoder(&encoded)
	for _, message := range []provider.Message{
		{Role: provider.RoleUser, Content: "生成最终报告"},
		{Role: provider.RoleAssistant, Content: "草稿", DisplayHidden: true},
		{Role: provider.RoleUser, Content: "内部校对提示", DisplayHidden: true},
	} {
		if err := enc.Encode(message); err != nil {
			t.Fatalf("Encode: %v", err)
		}
	}
	if err := os.WriteFile(path, encoded.Bytes(), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}

	entries, err := collectPromptHistoryEntries(path, info, control.StripComposePrefixes)
	assertVisibleOfficePrompts(t, entries, err)
}

func TestOfficeOutputDerivedUserContentSkipsHiddenMessages(t *testing.T) {
	msgs := []provider.Message{
		{Role: provider.RoleUser, Content: "visible request"},
		{Role: provider.RoleUser, Content: "hidden proofreading", DisplayHidden: true},
	}
	if got := lastUserMessageContent(msgs); got != "visible request" {
		t.Fatalf("lastUserMessageContent = %q, want visible request", got)
	}

	dir := t.TempDir()
	path := filepath.Join(dir, "office-title.jsonl")
	var encoded bytes.Buffer
	enc := json.NewEncoder(&encoded)
	for _, message := range []provider.Message{
		{Role: provider.RoleUser, Content: "hidden title source", DisplayHidden: true},
		{Role: provider.RoleUser, Content: "visible title source"},
	} {
		if err := enc.Encode(message); err != nil {
			t.Fatalf("Encode: %v", err)
		}
	}
	if err := os.WriteFile(path, encoded.Bytes(), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	title := restoredSessionTopicTitle(dir, path, agent.BranchMeta{})
	if !strings.HasPrefix(title, "visible title") || strings.Contains(title, "hidden title") {
		t.Fatalf("restored title = %q, want visible source only", title)
	}
}

type officeHistoryProvider struct {
	responses []string
	next      int
}

func (p *officeHistoryProvider) Name() string { return "office-history" }

func (p *officeHistoryProvider) Stream(context.Context, provider.Request) (<-chan provider.Chunk, error) {
	if p.next >= len(p.responses) {
		return nil, fmt.Errorf("unexpected office history turn %d", p.next+1)
	}
	response := p.responses[p.next]
	p.next++
	chunks := make(chan provider.Chunk, 2)
	chunks <- provider.Chunk{Type: provider.ChunkText, Text: response}
	chunks <- provider.Chunk{Type: provider.ChunkDone}
	close(chunks)
	return chunks, nil
}

func assertVisibleOfficeHistory(t *testing.T, history []HistoryMessage) {
	t.Helper()
	var dialogue []HistoryMessage
	for _, message := range history {
		if message.Role == "user" || message.Role == "assistant" {
			dialogue = append(dialogue, message)
		}
	}
	if len(dialogue) != 2 {
		t.Fatalf("visible dialogue = %+v, want one user and one assistant", dialogue)
	}
	if dialogue[0].Role != "user" || dialogue[0].Content != officeHistoryTestContract {
		t.Fatalf("visible user = %+v, want original office request", dialogue[0])
	}
	if dialogue[1].Role != "assistant" || dialogue[1].Content != "# 最终报告\n\n已校对正文。" {
		t.Fatalf("visible assistant = %+v, want final document", dialogue[1])
	}
}

func assertVisibleOfficePrompts(t *testing.T, entries []PromptHistoryEntry, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("collectPromptHistoryEntries: %v", err)
	}
	if len(entries) != 1 || entries[0].Text != "生成最终报告" || entries[0].Turn != 0 {
		t.Fatalf("prompt history = %+v, want only the original prompt at turn 0", entries)
	}
}
