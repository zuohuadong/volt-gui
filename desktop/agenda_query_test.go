package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"voltui/internal/agent"
	"voltui/internal/config"
	"voltui/internal/control"
	"voltui/internal/event"
	"voltui/internal/provider"
)

func TestFormatTodayAgendaReplyListsTodayCalendarAndTodos(t *testing.T) {
	today := time.Date(2026, time.July, 10, 9, 0, 0, 0, time.Local)
	reply := formatTodayAgendaReply(today,
		[]WorkbenchCalendarEventView{{
			Date:  "2026-07-10",
			Title: "版本评审会议",
			Time:  "09:30",
			Place: "线上会议室",
		}},
		[]WorkbenchTodoView{{
			Title:    "确认发布清单",
			Priority: "高",
			DueAt:    "2026-07-10T15:00:00+08:00",
			Status:   "pending",
		}},
	)

	for _, want := range []string{"今天的安排", "09:30", "版本评审会议", "线上会议室", "确认发布清单", "高"} {
		if !strings.Contains(reply, want) {
			t.Fatalf("reply = %q, want %q", reply, want)
		}
	}
}

func TestFormatTodayAgendaReplyExplainsWhenThereAreNoItems(t *testing.T) {
	today := time.Date(2026, time.July, 10, 9, 0, 0, 0, time.Local)
	reply := formatTodayAgendaReply(today, nil, nil)
	if !strings.Contains(reply, "暂时没有") || !strings.Contains(reply, "日程或待办") {
		t.Fatalf("reply = %q, want no-items explanation", reply)
	}
}

func TestSubmitTodayAgendaUsesLocalTurnAndPersistsHistory(t *testing.T) {
	isolateDesktopUserDirs(t)
	today := time.Now()
	if err := os.MkdirAll(config.SessionDir(), 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}

	app := NewApp()
	if _, err := app.SaveCalendarEvent(WorkbenchCalendarEventInput{
		Title:  "本地日程回归会议",
		Date:   today.Format("2006-01-02"),
		Time:   "10:30",
		Place:  "本地会议室",
		Status: "已排期",
	}); err != nil {
		t.Fatalf("SaveCalendarEvent: %v", err)
	}
	if _, err := app.SaveTodo(WorkbenchTodoInput{
		Title:    "本地待办回归",
		DueAt:    today.Format(time.RFC3339),
		Priority: "高",
		Status:   "pending",
	}); err != nil {
		t.Fatalf("SaveTodo: %v", err)
	}

	sessionPath := filepath.Join(config.SessionDir(), "agenda-local.jsonl")
	session := agent.NewSession("system")
	sink := &agendaCaptureSink{}
	runner := &agendaCountingRunner{}
	ctrl := control.New(control.Options{
		Runner:      runner,
		Executor:    agent.New(nil, nil, session, agent.Options{}, sink),
		Sink:        sink,
		SessionDir:  config.SessionDir(),
		SessionPath: sessionPath,
		Label:       "agenda-local",
	})
	defer ctrl.Close()
	app.setTestCtrl(ctrl, "test/model")

	const prompt = "今天有没有什么安排"
	if err := app.SubmitDisplayToTab("test", prompt, prompt); err != nil {
		t.Fatalf("SubmitDisplayToTab: %v", err)
	}
	if calls := runner.CallCount(); calls != 0 {
		t.Fatalf("provider runner calls = %d, want 0 for local agenda query", calls)
	}
	if sink.hasKind(event.ToolDispatch) || sink.hasKind(event.ToolProgress) || sink.hasKind(event.ToolResult) {
		t.Fatalf("local agenda query emitted tool events: %#v", sink.snapshot())
	}
	if !sink.hasKind(event.TurnStarted) || !sink.hasKind(event.Text) || !sink.hasKind(event.Message) || !sink.hasKind(event.TurnDone) {
		t.Fatalf("local agenda query did not emit a complete chat event stream: %#v", sink.snapshot())
	}

	history := app.HistoryForTab("test")
	if !historyContains(history, prompt) || !historyContains(history, "本地日程回归会议") || !historyContains(history, "本地待办回归") {
		t.Fatalf("live history = %#v, want local user and answer turn", history)
	}
	for _, message := range history {
		if len(message.ToolCalls) != 0 || message.ToolCallID != "" {
			t.Fatalf("local agenda history should not contain tool calls: %#v", history)
		}
	}

	loaded, err := agent.LoadSession(sessionPath)
	if err != nil {
		t.Fatalf("LoadSession: %v", err)
	}
	recovered := control.New(control.Options{
		Executor:    agent.New(nil, nil, loaded, agent.Options{}, event.Discard),
		Sink:        event.Discard,
		SessionDir:  config.SessionDir(),
		SessionPath: sessionPath,
		Label:       "agenda-recovered",
	})
	defer recovered.Close()
	app.tabs["test"].Ctrl = recovered
	reloaded := app.HistoryForTab("test")
	if !historyContains(reloaded, prompt) || !historyContains(reloaded, "本地日程回归会议") || !historyContains(reloaded, "本地待办回归") {
		t.Fatalf("reloaded history = %#v, want persisted local turn", reloaded)
	}
}

func TestAgendaDisplayRoutesNonLocalIntentToAgent(t *testing.T) {
	for _, tc := range []struct {
		name string
		run  func(app *App, tabID string) error
	}{
		{
			name: "display preserves referenced input",
			run: func(app *App, tabID string) error {
				return app.SubmitDisplayToTab(tabID, "今天有没有什么安排", "请读取 @README.md 后告诉我今天有没有什么安排")
			},
		},
		{
			name: "edited display preserves file intent",
			run: func(app *App, tabID string) error {
				return app.SubmitEditedDisplayToTab(tabID, "今天有没有什么安排", "请检查文件 README.md 后告诉我今天有没有什么安排", "今天有没有什么安排")
			},
		},
		{
			name: "display preserves calendar write intent",
			run: func(app *App, tabID string) error {
				return app.SubmitDisplayToTab(tabID, "今天有没有什么安排", "请新建今天下午的日程")
			},
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			app, ctrl, runner := newAgendaRouteFixture(t)
			defer ctrl.Close()

			if err := tc.run(app, "test"); err != nil {
				t.Fatalf("submit: %v", err)
			}
			waitNotRunning(t, ctrl)
			if calls := runner.CallCount(); calls != 1 {
				t.Fatalf("provider runner calls = %d, want 1 for a non-local agenda intent", calls)
			}
			if historyContains(app.HistoryForTab("test"), "今天的安排（") {
				t.Fatalf("non-local agenda intent was answered locally: %#v", app.HistoryForTab("test"))
			}
		})
	}
}

func TestIsTodayAgendaQueryRejectsMutationIntent(t *testing.T) {
	for _, tc := range []struct {
		name    string
		display string
		input   string
	}{
		{name: "arrange meeting", display: "帮我安排今天的会议"},
		{name: "arrange once", display: "今天的会议安排一下"},
		{name: "create from raw input", display: "今天有没有什么安排", input: "请新建今天下午的日程"},
		{name: "cancel", display: "取消今天的会议"},
		{name: "add todo", display: "添加今天的待办"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if isTodayAgendaQuery(tc.display, tc.input) {
				t.Fatalf("isTodayAgendaQuery(%q, %q) = true, want false for a mutation intent", tc.display, tc.input)
			}
		})
	}
	if !isTodayAgendaQuery("今天有没有什么安排") {
		t.Fatal("pure agenda question should still use the local read-only route")
	}
}

func TestIsTodayAgendaQueryRejectsExplicitWorkspaceIntent(t *testing.T) {
	for _, query := range []string{
		"今天有没有什么安排，顺便读取 @README.md",
		"检查 src/main.go 后告诉我今天有什么安排",
		"打开 README.md，今天有什么安排",
	} {
		if isTodayAgendaQuery(query) {
			t.Fatalf("isTodayAgendaQuery(%q) = true, want false for an explicit workspace intent", query)
		}
	}
	if !isTodayAgendaQuery("今天/明天有什么安排") {
		t.Fatal("Chinese date separators without a workspace path should remain a local agenda query")
	}
}

func newAgendaRouteFixture(t *testing.T) (*App, *control.Controller, *agendaRecordingRunner) {
	t.Helper()
	isolateDesktopUserDirs(t)
	workspace := t.TempDir()
	if err := os.WriteFile(filepath.Join(workspace, "README.md"), []byte("reference context"), 0o644); err != nil {
		t.Fatalf("write README: %v", err)
	}
	if err := os.MkdirAll(config.SessionDir(), 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}
	session := agent.NewSession("system")
	runner := &agendaRecordingRunner{session: session}
	ctrl := control.New(control.Options{
		Runner:        runner,
		Executor:      agent.New(nil, nil, session, agent.Options{}, event.Discard),
		Sink:          event.Discard,
		SessionDir:    config.SessionDir(),
		SessionPath:   filepath.Join(config.SessionDir(), "agenda-route.jsonl"),
		WorkspaceRoot: workspace,
		Label:         "agenda-route",
	})
	app := NewApp()
	app.setTestCtrl(ctrl, "test/model")
	app.tabs["test"].WorkspaceRoot = workspace
	return app, ctrl, runner
}

type agendaCountingRunner struct {
	mu    sync.Mutex
	calls int
}

type agendaRecordingRunner struct {
	session *agent.Session
	mu      sync.Mutex
	calls   int
}

func (r *agendaRecordingRunner) Run(_ context.Context, input string) error {
	r.mu.Lock()
	r.calls++
	r.mu.Unlock()
	r.session.Add(provider.Message{Role: provider.RoleUser, Content: input})
	r.session.Add(provider.Message{Role: provider.RoleAssistant, Content: "agent response"})
	return nil
}

func (r *agendaRecordingRunner) CallCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.calls
}

func (r *agendaCountingRunner) Run(_ context.Context, _ string) error {
	r.mu.Lock()
	r.calls++
	r.mu.Unlock()
	return nil
}

func (r *agendaCountingRunner) CallCount() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.calls
}

type agendaCaptureSink struct {
	mu     sync.Mutex
	events []event.Event
}

func (s *agendaCaptureSink) Emit(value event.Event) {
	s.mu.Lock()
	s.events = append(s.events, value)
	s.mu.Unlock()
}

func (s *agendaCaptureSink) snapshot() []event.Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	return append([]event.Event(nil), s.events...)
}

func (s *agendaCaptureSink) hasKind(want event.Kind) bool {
	for _, value := range s.snapshot() {
		if value.Kind == want {
			return true
		}
	}
	return false
}

func historyContains(messages []HistoryMessage, want string) bool {
	for _, message := range messages {
		if strings.Contains(message.Content, want) {
			return true
		}
	}
	return false
}
