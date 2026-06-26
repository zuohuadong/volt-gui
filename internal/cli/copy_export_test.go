package cli

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"

	"reasonix/internal/agent"
	"reasonix/internal/control"
	"reasonix/internal/event"
	"reasonix/internal/provider"
)

func newTestChatTUIWithMessages(t *testing.T, workspaceRoot string, msgs ...provider.Message) chatTUI {
	t.Helper()
	sess := agent.NewSession("system prompt should not export")
	for _, msg := range msgs {
		sess.Add(msg)
	}
	exec := agent.New(nil, nil, sess, agent.Options{}, event.Discard)
	ctrl := control.New(control.Options{Executor: exec, WorkspaceRoot: workspaceRoot})
	return newChatTUI(ctrl, "", make(chan event.Event, 1), 80)
}

func requireClipboardCommand(t *testing.T, cmd tea.Cmd, want string) {
	t.Helper()
	if cmd == nil {
		t.Fatal("expected clipboard command, got nil")
	}
	gotMsg := cmd()
	wantMsg := tea.SetClipboard(want)()
	if !reflect.DeepEqual(gotMsg, wantMsg) {
		t.Fatalf("clipboard command = %#v, want %#v", gotMsg, wantMsg)
	}
}

func TestSlashCopyDirectIndexUsesCurrentTurnNewestFirst(t *testing.T) {
	m := newTestChatTUIWithMessages(t, "",
		provider.Message{Role: provider.RoleUser, Content: "old prompt"},
		provider.Message{Role: provider.RoleAssistant, Content: "old answer"},
		provider.Message{Role: provider.RoleUser, Content: "current prompt"},
		provider.Message{Role: provider.RoleAssistant, Content: "first current answer"},
		provider.Message{Role: provider.RoleAssistant, Content: "..."},
		provider.Message{Role: provider.RoleTool, Content: "tool result"},
		provider.Message{Role: provider.RoleAssistant, Content: "second current answer"},
	)

	requireClipboardCommand(t, m.runCopyCommand("/copy 1"), "second current answer")
	requireClipboardCommand(t, m.runCopyCommand("/copy 2"), "first current answer")
	if cmd := m.runCopyCommand("/copy 3"); cmd != nil {
		t.Fatalf("out-of-range /copy should not return a command, got %#v", cmd())
	}
}

func TestSlashCopyPickerCopiesSelectedAssistantMessage(t *testing.T) {
	m := newTestChatTUIWithMessages(t, "",
		provider.Message{Role: provider.RoleUser, Content: "current prompt"},
		provider.Message{Role: provider.RoleAssistant, Content: "first current answer"},
		provider.Message{Role: provider.RoleAssistant, Content: "second current answer"},
	)

	if cmd := m.runCopyCommand("/copy"); cmd != nil {
		t.Fatalf("bare /copy should open picker without command, got %#v", cmd())
	}
	if m.copyPick == nil {
		t.Fatal("bare /copy did not open the picker")
	}
	if got, want := m.copyPick.parts, []string{"second current answer", "first current answer"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("picker parts = %#v, want %#v", got, want)
	}

	next, _ := m.handleCopyPickerKey(tea.KeyPressMsg{Code: tea.KeyDown})
	m = next.(chatTUI)
	next, cmd := m.handleCopyPickerKey(tea.KeyPressMsg{Code: tea.KeyEnter})
	m = next.(chatTUI)

	if m.copyPick != nil {
		t.Fatal("picker should close after copying")
	}
	requireClipboardCommand(t, cmd, "first current answer")
}

func TestSlashExportFiltersInternalAndReferencedContext(t *testing.T) {
	dir := t.TempDir()
	expandedReference := control.PlanModeMarker + "\n\n" +
		"Referenced context:\n\n" +
		"<file path=\"auth_private.go\">\nconst hiddenReference = true\n</file>\n\n" +
		"please explain @auth_private.go"
	m := newTestChatTUIWithMessages(t, dir,
		provider.Message{Role: provider.RoleUser, Content: expandedReference},
		provider.Message{Role: provider.RoleUser, Content: agent.MidTurnSteerPrefix + "\ninternal steer should not export"},
		provider.Message{
			Role:             provider.RoleAssistant,
			Content:          "visible answer",
			ReasoningContent: "private thinking should not export",
			ToolCalls: []provider.ToolCall{{
				ID:        "call_1",
				Name:      "read_file",
				Arguments: `{"path":"private-tool-input.txt"}`,
			}},
		},
		provider.Message{Role: provider.RoleTool, ToolCallID: "call_1", Name: "read_file", Content: "tool output should not export"},
	)

	m.runExportCommand("/export")

	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var exported []string
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), "session-") && strings.HasSuffix(entry.Name(), ".md") {
			exported = append(exported, filepath.Join(dir, entry.Name()))
		}
	}
	if len(exported) != 1 {
		t.Fatalf("exported files = %v, want one session markdown file", exported)
	}
	data, err := os.ReadFile(exported[0])
	if err != nil {
		t.Fatal(err)
	}
	got := string(data)
	for _, want := range []string{
		"# reasonix session",
		"## User",
		"please explain @auth_private.go",
		"## Assistant",
		"visible answer",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("export missing %q:\n%s", want, got)
		}
	}
	for _, unwanted := range []string{
		"system prompt should not export",
		"Referenced context:",
		"<file path=",
		"hiddenReference",
		"internal steer should not export",
		"private thinking should not export",
		"private-tool-input.txt",
		"tool output should not export",
	} {
		if strings.Contains(got, unwanted) {
			t.Fatalf("export leaked %q:\n%s", unwanted, got)
		}
	}
}
