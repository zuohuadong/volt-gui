package agent

import (
	"context"
	"encoding/json"
	"strings"
	"sync/atomic"
	"testing"

	"voltui/internal/provider"
	"voltui/internal/tool"
)

type scriptedProvider struct {
	name     string
	turns    [][]provider.Chunk
	call     int
	requests []provider.Request
}

func (s *scriptedProvider) Name() string { return s.name }

func (s *scriptedProvider) Stream(_ context.Context, req provider.Request) (<-chan provider.Chunk, error) {
	s.requests = append(s.requests, req)
	turnIndex := s.call
	if turnIndex >= len(s.turns) {
		turnIndex = len(s.turns) - 1
	}
	s.call++
	chunks := make(chan provider.Chunk, len(s.turns[turnIndex]))
	for _, chunk := range s.turns[turnIndex] {
		chunks <- chunk
	}
	close(chunks)
	return chunks, nil
}

func toolCallChunk(id, name, args string) provider.Chunk {
	return provider.Chunk{Type: provider.ChunkToolCall, ToolCall: &provider.ToolCall{ID: id, Name: name, Arguments: args}}
}

func lastAssistantContent(session *Session) string {
	var content string
	for _, message := range session.Messages {
		if message.Role == provider.RoleAssistant {
			content = message.Content
		}
	}
	return content
}

func lastToolResult(session *Session, name string) string {
	var lastContent string
	for _, message := range session.Messages {
		if message.Role == provider.RoleTool && message.Name == name {
			lastContent = message.Content
		}
	}
	return lastContent
}

func sessionHasUserMessageContaining(session *Session, needle string) bool {
	for _, message := range session.Messages {
		if message.Role == provider.RoleUser && strings.Contains(message.Content, needle) {
			return true
		}
	}
	return false
}

func testTaskContext() context.Context {
	return WithParentSession(context.Background(), "parent-session")
}

func extractJobID(backgroundStartMessage string) string {
	quote := strings.Index(backgroundStartMessage, `"`)
	if quote < 0 {
		return ""
	}
	end := strings.Index(backgroundStartMessage[quote+1:], `"`)
	if end < 0 {
		return ""
	}
	return backgroundStartMessage[quote+1 : quote+1+end]
}

type testTaskToolConfig struct {
	provider     provider.Provider
	registry     *tool.Registry
	systemPrompt string
}

func newTestTaskTool(t *testing.T, cfg testTaskToolConfig) *TaskTool {
	t.Helper()
	return NewTaskTool(cfg.provider, nil, cfg.registry, 20, 0, 0, 0, 0, 0, 0, 0.0, "", cfg.systemPrompt, nil, 0, "", "", nil).
		WithTranscripts(NewSubagentStore(t.TempDir()), t.TempDir(), "base-model", "base-effort")
}

type proxyWriterCallingProvider struct{}

func (proxyWriterCallingProvider) Name() string { return "proxy-writer-calling" }

func (proxyWriterCallingProvider) Stream(_ context.Context, req provider.Request) (<-chan provider.Chunk, error) {
	chunks := make(chan provider.Chunk, 2)
	if !hasToolResult(req, "use_capability") {
		chunks <- toolCallChunk("proxy-write-1", "use_capability", `{"action":"call","capability_id":"mcp-tool:test/write","arguments":{}}`)
		chunks <- provider.Chunk{Type: provider.ChunkDone}
		close(chunks)
		return chunks, nil
	}
	chunks <- provider.Chunk{Type: provider.ChunkText, Text: "writer blocked"}
	chunks <- provider.Chunk{Type: provider.ChunkDone}
	close(chunks)
	return chunks, nil
}

func hasToolResult(req provider.Request, name string) bool {
	for _, message := range req.Messages {
		if message.Role == provider.RoleTool && message.Name == name {
			return true
		}
	}
	return false
}

type parallelResolvedWriterTarget struct {
	calls *int32
}

func (parallelResolvedWriterTarget) Name() string        { return "mcp__test__write" }
func (parallelResolvedWriterTarget) Description() string { return "" }
func (parallelResolvedWriterTarget) Schema() json.RawMessage {
	return json.RawMessage(`{"type":"object"}`)
}
func (parallelResolvedWriterTarget) ReadOnly() bool { return false }
func (target parallelResolvedWriterTarget) Execute(context.Context, json.RawMessage) (string, error) {
	atomic.AddInt32(target.calls, 1)
	return "writer executed", nil
}
