package agent

import (
	"os"
	"path/filepath"
	"testing"

	"voltui/internal/provider"
)

const legacyEventLog = `{"type":"model.turn.started","id":1,"ts":"t","turn":0,"model":"deepseek"}
{"type":"user.message","id":2,"ts":"t","turn":0,"text":"list the files"}
{"type":"model.delta","id":3,"ts":"t","turn":0,"channel":"content","text":"sure"}
{"type":"model.final","id":4,"ts":"t","turn":0,"content":"On it.","toolCalls":[{"id":"call_1","type":"function","function":{"name":"ls","arguments":"{\"path\":\".\"}"}}],"usage":{},"costUsd":0}
{"type":"tool.result","id":5,"ts":"t","turn":0,"callId":"call_1","ok":true,"output":"a.go\nb.go","durationMs":3}
{"type":"model.final","id":6,"ts":"t","turn":0,"content":"There are two files.","toolCalls":[],"usage":{},"costUsd":0}
`

func TestMigrateLegacySessionsReconstructsConversation(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()
	if err := os.WriteFile(filepath.Join(src, "chat-1.events.jsonl"), []byte(legacyEventLog), 0o644); err != nil {
		t.Fatal(err)
	}

	n, err := MigrateLegacySessions(src, dest)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 1 {
		t.Fatalf("imported %d sessions, want 1", n)
	}

	loaded, err := LoadSession(filepath.Join(dest, "chat-1.jsonl"))
	if err != nil {
		t.Fatalf("reload migrated session: %v", err)
	}
	got := loaded.Messages
	if len(got) != 4 {
		t.Fatalf("message count = %d, want 4 (user, assistant+toolcall, tool, assistant):\n%+v", len(got), got)
	}
	if got[0].Role != provider.RoleUser || got[0].Content != "list the files" {
		t.Errorf("msg0 = %+v, want user 'list the files'", got[0])
	}
	if got[1].Role != provider.RoleAssistant || len(got[1].ToolCalls) != 1 ||
		got[1].ToolCalls[0].ID != "call_1" || got[1].ToolCalls[0].Name != "ls" {
		t.Errorf("msg1 = %+v, want assistant with ls tool call call_1", got[1])
	}
	if got[2].Role != provider.RoleTool || got[2].ToolCallID != "call_1" ||
		got[2].Name != "ls" || got[2].Content != "a.go\nb.go" {
		t.Errorf("msg2 = %+v, want tool result for call_1 named ls", got[2])
	}
	if got[3].Role != provider.RoleAssistant || got[3].Content != "There are two files." {
		t.Errorf("msg3 = %+v, want final assistant text", got[3])
	}
}

func TestMigrateLegacySessionsBackfillsAlongsideExisting(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()
	os.WriteFile(filepath.Join(src, "chat-1.events.jsonl"), []byte(legacyEventLog), 0o644)
	os.WriteFile(filepath.Join(dest, "existing.jsonl"), []byte(`{"role":"user","content":"hi"}`+"\n"), 0o644)

	n, err := MigrateLegacySessions(src, dest)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 1 {
		t.Errorf("should back-fill the legacy session even when dest has others, imported %d", n)
	}
	if _, err := os.Stat(filepath.Join(dest, "chat-1.jsonl")); err != nil {
		t.Errorf("legacy session should have been imported: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dest, "existing.jsonl")); err != nil {
		t.Errorf("pre-existing v1+ session must be left intact: %v", err)
	}
}

func TestMigrateLegacySessionsRunsOnce(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()
	os.WriteFile(filepath.Join(src, "chat-1.events.jsonl"), []byte(legacyEventLog), 0o644)

	if n, err := MigrateLegacySessions(src, dest); err != nil || n != 1 {
		t.Fatalf("first run: n=%d err=%v, want 1", n, err)
	}
	// User deletes the imported session, then a second launch happens.
	if err := os.Remove(filepath.Join(dest, "chat-1.jsonl")); err != nil {
		t.Fatal(err)
	}
	if n, err := MigrateLegacySessions(src, dest); err != nil || n != 0 {
		t.Fatalf("second run must be a no-op (marker present): n=%d err=%v", n, err)
	}
	if _, err := os.Stat(filepath.Join(dest, "chat-1.jsonl")); !os.IsNotExist(err) {
		t.Errorf("a deleted import must not reappear after the one-time migration")
	}
	if _, err := os.Stat(filepath.Join(dest, legacyEventsHomeImportMarker)); err != nil {
		t.Errorf("source-specific import marker missing: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dest, legacyImportMarker)); err != nil {
		t.Errorf("legacy compatibility import marker missing: %v", err)
	}
}

func TestMigrateLegacySessionsHonorsLegacyMarkerForHomeSource(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()
	os.WriteFile(filepath.Join(src, "chat-1.events.jsonl"), []byte(legacyEventLog), 0o644)
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dest, legacyImportMarker), nil, 0o644); err != nil {
		t.Fatal(err)
	}

	n, err := MigrateLegacySessions(src, dest)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 0 {
		t.Fatalf("legacy marker should protect the home source from re-importing, got %d", n)
	}
	if _, err := os.Stat(filepath.Join(dest, "chat-1.jsonl")); !os.IsNotExist(err) {
		t.Errorf("legacy marker should keep deleted/imported sessions from reappearing")
	}
	if _, err := os.Stat(filepath.Join(dest, legacyEventsHomeImportMarker)); err != nil {
		t.Errorf("legacy marker should be upgraded to source marker: %v", err)
	}
}

func TestMigrateLegacySessionsSourceMarkersAreIndependent(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()
	os.WriteFile(filepath.Join(src, "appdata-chat.events.jsonl"), []byte(legacyEventLog), 0o644)
	if err := os.MkdirAll(dest, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dest, legacyImportMarker), nil, 0o644); err != nil {
		t.Fatal(err)
	}

	const appDataMarker = ".legacy-imported.v0-events-appdata"
	n, err := migrateLegacySessions(src, dest, appDataMarker, false)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 1 {
		t.Fatalf("independent source marker should allow a new source import, got %d", n)
	}
	if _, err := os.Stat(filepath.Join(dest, "appdata-chat.jsonl")); err != nil {
		t.Errorf("new source session should have been imported: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dest, appDataMarker)); err != nil {
		t.Errorf("new source marker missing: %v", err)
	}
}

func TestMigrateLegacySessionsSkipsAlreadyImported(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()
	os.WriteFile(filepath.Join(src, "chat-1.events.jsonl"), []byte(legacyEventLog), 0o644)
	os.WriteFile(filepath.Join(dest, "chat-1.jsonl"), []byte(`{"role":"user","content":"edited"}`+"\n"), 0o644)

	n, err := MigrateLegacySessions(src, dest)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 0 {
		t.Errorf("a same-named existing session must not be overwritten, imported %d", n)
	}
	loaded, err := LoadSession(filepath.Join(dest, "chat-1.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if len(loaded.Messages) != 1 || loaded.Messages[0].Content != "edited" {
		t.Errorf("existing same-named session was clobbered: %+v", loaded.Messages)
	}
}

func TestMigrateLegacySessionsNoSrcIsNoop(t *testing.T) {
	n, err := MigrateLegacySessions(filepath.Join(t.TempDir(), "nope"), t.TempDir())
	if err != nil || n != 0 {
		t.Errorf("missing legacy session dir should be a silent no-op, got n=%d err=%v", n, err)
	}
}

func TestMigrateLegacySessionsSkipsEmptyLog(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()
	os.WriteFile(filepath.Join(src, "empty.events.jsonl"), []byte(`{"type":"model.turn.started","id":1,"ts":"t","turn":0}`+"\n"), 0o644)

	n, err := MigrateLegacySessions(src, dest)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 0 {
		t.Errorf("a log with no user/assistant/tool messages should not produce a session, imported %d", n)
	}
}

const legacyMessageLog = `{"role":"user","content":"hello from v0.x"}
{"role":"assistant","content":"hi there","tool_calls":[{"id":"call_1","name":"read_file","arguments":"{\"path\":\"main.go\"}"}]}
{"role":"tool","tool_call_id":"call_1","name":"read_file","content":"package main"}
{"role":"assistant","content":"I found the file."}
`

func TestMigrateLegacySessionsImportsJsonlOnly(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()
	os.WriteFile(filepath.Join(src, "acp-chat.jsonl"), []byte(legacyMessageLog), 0o644)
	writeLegacyMeta(t, src, "acp-chat", "", "ACP session about main.go")

	n, err := MigrateLegacySessions(src, dest, nil)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 1 {
		t.Fatalf("imported %d sessions, want 1 (jsonl-only)", n)
	}

	destPath := filepath.Join(dest, "acp-chat.jsonl")
	data, err := os.ReadFile(destPath)
	if err != nil {
		t.Fatalf("imported session missing: %v", err)
	}
	if !strings.Contains(string(data), `"hello from v0.x"`) {
		t.Errorf("imported content wrong:\n%s", data)
	}

	// Title from the meta sidecar should be stored.
	titles, err := os.ReadFile(filepath.Join(dest, ".titles.json"))
	if err != nil {
		t.Fatalf("titles file: %v", err)
	}
	m := map[string]string{}
	if err := json.Unmarshal(titles, &m); err != nil || m["acp-chat.jsonl"] != "ACP session about main.go" {
		t.Errorf("title = %q (err=%v), want ACP session about main.go", m["acp-chat.jsonl"], err)
	}

	// Marker must be stamped.
	if _, err := os.Stat(filepath.Join(dest, legacyJsonlPassMarker)); err != nil {
		t.Errorf("jsonl pass marker missing: %v", err)
	}
}

func TestMigrateLegacySessionsPrefersJsonlWhenNewer(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()

	eventsPath := filepath.Join(src, "chat-1.events.jsonl")
	jsonlPath := filepath.Join(src, "chat-1.jsonl")

	// Write the event log first (older mtime).
	os.WriteFile(eventsPath, []byte(legacyEventLog), 0o644)
	time.Sleep(10 * time.Millisecond) // ensure mtime differs
	// Write the .jsonl second (newer mtime) — it should be preferred.
	os.WriteFile(jsonlPath, []byte(legacyMessageLog), 0o644)
	writeLegacyMeta(t, src, "chat-1", "", "newer jsonl wins")

	n, err := MigrateLegacySessions(src, dest, nil)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 1 {
		t.Fatalf("imported %d, want 1", n)
	}

	data, err := os.ReadFile(filepath.Join(dest, "chat-1.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	// The .jsonl content ("hello from v0.x") should win over the reconstructed
	// event log content ("list the files").
	if !strings.Contains(string(data), `"hello from v0.x"`) {
		t.Errorf("expected .jsonl content to be preferred:\n%s", data)
	}
}

func TestMigrateLegacySessionsFallsBackToEventsWhenJsonlOlder(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()

	jsonlPath := filepath.Join(src, "chat-1.jsonl")
	eventsPath := filepath.Join(src, "chat-1.events.jsonl")

	// Write the .jsonl first (older mtime).
	os.WriteFile(jsonlPath, []byte(legacyMessageLog), 0o644)
	time.Sleep(10 * time.Millisecond)
	// Write the events log second (newer mtime) — events should be reconstructed.
	os.WriteFile(eventsPath, []byte(legacyEventLog), 0o644)
	writeLegacyMeta(t, src, "chat-1", "", "events are newer")

	n, err := MigrateLegacySessions(src, dest, nil)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 1 {
		t.Fatalf("imported %d, want 1", n)
	}

	data, err := os.ReadFile(filepath.Join(dest, "chat-1.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	// The reconstructed event-log content ("list the files") should win because
	// the events log has a newer mtime.
	if !strings.Contains(string(data), `"list the files"`) {
		t.Errorf("expected events content to be reconstructed:\n%s", data)
	}
}

func TestMigrateLegacySessionsImportsJsonlBakFallback(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()

	// Only a .jsonl.bak — no .jsonl, no .events.jsonl. Should recover from bak.
	os.WriteFile(filepath.Join(src, "recovered.jsonl.bak"), []byte(legacyMessageLog), 0o644)
	writeLegacyMeta(t, src, "recovered", "", "recovered from bak")

	n, err := MigrateLegacySessions(src, dest, nil)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 1 {
		t.Fatalf("imported %d, want 1 (.bak recovery)", n)
	}

	data, err := os.ReadFile(filepath.Join(dest, "recovered.jsonl"))
	if err != nil {
		t.Fatalf("recovered session missing: %v", err)
	}
	if !strings.Contains(string(data), `"hello from v0.x"`) {
		t.Errorf("recovered content wrong:\n%s", data)
	}
}

func TestMigrateLegacySessionsSkipsBakWhenJsonlExists(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()

	// Both .jsonl and .jsonl.bak exist — prefer .jsonl.
	os.WriteFile(filepath.Join(src, "chat.jsonl"), []byte(legacyMessageLog), 0o644)
	os.WriteFile(filepath.Join(src, "chat.jsonl.bak"), []byte(`{"role":"user","content":"stale backup"}`+"\n"), 0o644)
	writeLegacyMeta(t, src, "chat", "", "from jsonl not bak")

	n, err := MigrateLegacySessions(src, dest, nil)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 1 {
		t.Fatalf("imported %d, want 1", n)
	}

	data, err := os.ReadFile(filepath.Join(dest, "chat.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(data), `"hello from v0.x"`) {
		t.Errorf("expected .jsonl content, not .bak:\n%s", data)
	}
}

func TestMigrateLegacySessionsSkipsNonMessageJsonl(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()

	// A .jsonl file that is NOT in message format (starts with event-log "id").
	os.WriteFile(filepath.Join(src, "bad.jsonl"), []byte(`{"id":1,"type":"model.turn.started"}`+"\n"), 0o644)

	n, err := MigrateLegacySessions(src, dest, nil)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 0 {
		t.Errorf("non-message .jsonl should be skipped, imported %d", n)
	}
}

func TestMigrateLegacySessionsRecursesIntoSubdirectories(t *testing.T) {
	src := t.TempDir()
	global := t.TempDir()
	workspace := t.TempDir()
	projRoot := t.TempDir()
	router := func(ws string) string { return filepath.Join(projRoot, filepath.Base(ws), "sessions") }

	// Set up a project-scoped subdirectory with sessions.
	subDir := filepath.Join(src, "Users_Yuki_git_polytone-audio-engine")
	if err := os.MkdirAll(subDir, 0o755); err != nil {
		t.Fatal(err)
	}
	os.WriteFile(filepath.Join(subDir, "proj-chat.events.jsonl"), []byte(legacyEventLog), 0o644)
	writeLegacyMeta(t, subDir, "proj-chat", workspace, "project session")

	// Also add a subdirectory that has no session files — should be skipped.
	emptySub := filepath.Join(src, "empty-dir")
	os.MkdirAll(emptySub, 0o755)

	n, err := MigrateLegacySessions(src, global, router)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 1 {
		t.Fatalf("imported %d, want 1 (subdirectory session)", n)
	}

	// Should land in the project session dir, not global.
	projDest := filepath.Join(projRoot, filepath.Base(workspace), "sessions", "proj-chat.jsonl")
	if _, err := os.Stat(projDest); err != nil {
		t.Errorf("subdirectory session not in project dir %s: %v", projDest, err)
	}
	if _, err := os.Stat(filepath.Join(global, "proj-chat.jsonl")); !os.IsNotExist(err) {
		t.Errorf("subdirectory session should not land in global dir")
	}
}

func TestMigrateLegacySessionsJsonlPassIsIdempotent(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()

	os.WriteFile(filepath.Join(src, "desktop-session.jsonl"), []byte(legacyMessageLog), 0o644)

	// First run imports it.
	n, err := MigrateLegacySessions(src, dest, nil)
	if err != nil || n != 1 {
		t.Fatalf("first run: n=%d err=%v, want 1", n, err)
	}
	// Delete the imported session.
	os.Remove(filepath.Join(dest, "desktop-session.jsonl"))

	// Second run: jsonl pass marker exists, must not re-import.
	n, err = MigrateLegacySessions(src, dest, nil)
	if err != nil || n != 0 {
		t.Fatalf("second run must be no-op: n=%d err=%v", n, err)
	}
	if _, err := os.Stat(filepath.Join(dest, "desktop-session.jsonl")); !os.IsNotExist(err) {
		t.Errorf("deleted session must not reappear after jsonl pass marker")
	}
}

func TestMigrateLegacySessionsJsonlPassRunsForExistingUpgrader(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()

	os.WriteFile(filepath.Join(src, "acp-chat.jsonl"), []byte(legacyMessageLog), 0o644)

	// Simulate an upgrader whose events pass already completed in a prior
	// version: the routed marker is stamped but the v3-jsonl marker is not.
	writeImportMarkers(dest, legacyRoutedHomeImportMarker)

	n, err := MigrateLegacySessions(src, dest, nil)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 1 {
		t.Fatalf("imported %d, want 1 (.jsonl-only must reach existing upgraders)", n)
	}
	if _, err := os.Stat(filepath.Join(dest, "acp-chat.jsonl")); err != nil {
		t.Errorf("jsonl-only session not imported for existing upgrader: %v", err)
	}
}

// legacyNestedFunctionLog uses the OpenAI-style nested-function tool-call format
// that the TS version wrote: name and arguments live under "function".
const legacyNestedFunctionLog = `{"role":"user","content":"read the file"}
{"role":"assistant","content":"","tool_calls":[{"id":"call_1","type":"function","function":{"name":"read_file","arguments":"{\"path\":\"main.go\"}"}}],"reasoning_content":"need to read it"}
{"role":"tool","tool_call_id":"call_1","name":"read_file","content":"package main\nfunc main() {}"}
{"role":"assistant","content":"Found the main function."}
`

func TestTransformAndCopyJsonlFlattensNestedToolCalls(t *testing.T) {
	src := t.TempDir()
	dest := t.TempDir()
	os.WriteFile(filepath.Join(src, "chat.jsonl"), []byte(legacyNestedFunctionLog), 0o644)
	writeLegacyMeta(t, src, "chat", "", "nested tool calls test")

	n, err := MigrateLegacySessions(src, dest, nil)
	if err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if n != 1 {
		t.Fatalf("imported %d, want 1", n)
	}

	// Reload and verify the tool calls are flat, not nested.
	loaded, err := LoadSession(filepath.Join(dest, "chat.jsonl"))
	if err != nil {
		t.Fatal(err)
	}
	msgs := loaded.Messages
	if len(msgs) != 4 {
		t.Fatalf("message count = %d, want 4", len(msgs))
	}
	// Message 1: assistant with tool call.
	if len(msgs[1].ToolCalls) != 1 {
		t.Fatalf("assistant tool_calls = %d, want 1", len(msgs[1].ToolCalls))
	}
	tc := msgs[1].ToolCalls[0]
	if tc.ID != "call_1" {
		t.Errorf("tool call id = %q, want call_1", tc.ID)
	}
	if tc.Name != "read_file" {
		t.Errorf("tool call name = %q, want read_file", tc.Name)
	}
	if tc.Arguments != `{"path":"main.go"}` {
		t.Errorf("tool call arguments = %q, want {\"path\":\"main.go\"}", tc.Arguments)
	}
	// Message 2: tool result.
	if msgs[2].Role != provider.RoleTool || msgs[2].ToolCallID != "call_1" || msgs[2].Name != "read_file" {
		t.Errorf("tool result = %+v, want tool result for call_1", msgs[2])
	}
	// Message 3: final assistant text.
	if msgs[3].Content != "Found the main function." {
		t.Errorf("final content = %q", msgs[3].Content)
	}
}
