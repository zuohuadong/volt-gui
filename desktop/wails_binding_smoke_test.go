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

type captureSink struct {
	mu     sync.Mutex
	events []event.Event
	ch     chan event.Event
}

func newCaptureSink() *captureSink {
	return &captureSink{ch: make(chan event.Event, 32)}
}

func (s *captureSink) Emit(e event.Event) {
	s.mu.Lock()
	s.events = append(s.events, e)
	s.mu.Unlock()
	select {
	case s.ch <- e:
	default:
	}
}

func (s *captureSink) waitFor(t *testing.T, kind event.Kind) event.Event {
	t.Helper()
	deadline := time.After(2 * time.Second)
	for {
		select {
		case e := <-s.ch:
			if e.Kind == kind {
				return e
			}
		case <-deadline:
			t.Fatalf("timed out waiting for event kind %v; events=%#v", kind, s.snapshot())
		}
	}
}

func (s *captureSink) snapshot() []event.Event {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]event.Event, len(s.events))
	copy(out, s.events)
	return out
}

type streamingDesktopRunner struct {
	sink    event.Sink
	session *agent.Session
	inputs  chan string
}

func (r *streamingDesktopRunner) Run(_ context.Context, input string) error {
	r.inputs <- input
	r.session.Add(provider.Message{Role: provider.RoleUser, Content: input})
	r.sink.Emit(event.Event{Kind: event.Reasoning, Text: "checking constraints"})
	r.sink.Emit(event.Event{Kind: event.Text, Text: "drafting response"})
	r.session.Add(provider.Message{Role: provider.RoleAssistant, Content: "1. Implement the plan\n   - Verify the binding smoke"})
	r.sink.Emit(event.Event{Kind: event.Message, Text: "drafting response"})
	return nil
}

func newSmokeApp(t *testing.T) (*App, *WorkspaceTab, *captureSink, *streamingDesktopRunner) {
	t.Helper()
	isolateDesktopUserDirs(t)

	sessionDir := config.SessionDir()
	if err := os.MkdirAll(sessionDir, 0o755); err != nil {
		t.Fatalf("mkdir session dir: %v", err)
	}
	sessionPath := agent.NewSessionPath(sessionDir, "wails-smoke")
	sess := agent.NewSession("system")
	sink := newCaptureSink()
	runner := &streamingDesktopRunner{sink: sink, session: sess, inputs: make(chan string, 4)}
	exec := agent.New(nil, nil, sess, agent.Options{}, sink)
	ctrl := control.New(control.Options{
		Runner:      runner,
		Executor:    exec,
		Sink:        sink,
		SessionDir:  sessionDir,
		SessionPath: sessionPath,
		Label:       "wails-smoke",
	})

	app := NewApp()
	app.ctx = context.Background()
	app.readyHook = func() {}
	tab := testTab("smoke", t.TempDir())
	tab.Ctrl = ctrl
	tab.model = "deepseek-flash/deepseek-v4-flash"
	app.tabs = map[string]*WorkspaceTab{tab.ID: tab}
	app.tabOrder = []string{tab.ID}
	app.activeTabID = tab.ID
	t.Cleanup(func() {
		if tab.Ctrl != nil {
			tab.Ctrl.Close()
		}
	})
	return app, tab, sink, runner
}

func TestWailsBindingSmokeRunModesPlanAndChat(t *testing.T) {
	app, tab, sink, runner := newSmokeApp(t)

	app.SetModeForTab(tab.ID, "plan")
	if !tab.Ctrl.PlanMode() || tab.Ctrl.Bypass() {
		t.Fatalf("plan mode = plan:%v bypass:%v, want true/false", tab.Ctrl.PlanMode(), tab.Ctrl.Bypass())
	}

	app.SubmitDisplayToTab(tab.ID, "short display", "full model input")
	firstInput := <-runner.inputs
	if !strings.HasPrefix(firstInput, control.PlanModeMarker) || !strings.Contains(firstInput, "full model input") {
		t.Fatalf("first runner input should be composed plan input, got %q", firstInput)
	}
	approval := sink.waitFor(t, event.ApprovalRequest)
	if approval.Approval.ID == "" || approval.Approval.Tool != "exit_plan_mode" {
		t.Fatalf("approval = %+v, want exit_plan_mode", approval.Approval)
	}

	app.ApproveTab(tab.ID, approval.Approval.ID, true, false, false)
	secondInput := <-runner.inputs
	if !strings.Contains(secondInput, "Plan approved") {
		t.Fatalf("second runner input = %q, want approved execution prompt", secondInput)
	}
	sink.waitFor(t, event.TurnDone)
	waitNotRunning(t, tab.Ctrl)
	if tab.Ctrl.PlanMode() {
		t.Fatal("approved plan should leave plan mode off")
	}

	history := app.HistoryForTab(tab.ID)
	firstUser := firstUserHistory(history)
	if firstUser == nil || firstUser.Content != "short display" {
		t.Fatalf("HistoryForTab display mapping = %#v, want first user bubble to use short display", history)
	}
	if !hasEventKind(sink.snapshot(), event.Reasoning) || !hasEventKind(sink.snapshot(), event.Text) || !hasEventKind(sink.snapshot(), event.Message) {
		t.Fatalf("stream events missing from sink: %#v", sink.snapshot())
	}

	app.SetModeForTab(tab.ID, "yolo")
	if tab.Ctrl.PlanMode() || !tab.Ctrl.Bypass() {
		t.Fatalf("yolo mode = plan:%v bypass:%v, want false/true", tab.Ctrl.PlanMode(), tab.Ctrl.Bypass())
	}
	app.SetModeForTab(tab.ID, "normal")
	if tab.Ctrl.PlanMode() || tab.Ctrl.Bypass() {
		t.Fatalf("normal mode = plan:%v bypass:%v, want false/false", tab.Ctrl.PlanMode(), tab.Ctrl.Bypass())
	}
}

func TestWailsBindingSmokeAnswerQuestion(t *testing.T) {
	app, tab, sink, _ := newSmokeApp(t)

	done := make(chan []event.AskAnswer, 1)
	go func() {
		answers, _ := tab.Ctrl.Ask(context.Background(), []event.AskQuestion{{
			ID:     "scope",
			Header: "Scope",
			Prompt: "Choose scope",
			Options: []event.AskOption{
				{Label: "Small"},
				{Label: "Large"},
			},
		}})
		done <- answers
	}()

	ask := sink.waitFor(t, event.AskRequest)
	app.AnswerQuestionForTab(tab.ID, ask.Ask.ID, []QuestionAnswer{{QuestionID: "scope", Selected: []string{"Large"}}})

	select {
	case answers := <-done:
		if len(answers) != 1 || answers[0].QuestionID != "scope" || len(answers[0].Selected) != 1 || answers[0].Selected[0] != "Large" {
			t.Fatalf("answers = %#v, want Large scope answer", answers)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("AnswerQuestionForTab did not unblock controller Ask")
	}
}

func TestWailsBindingSmokeModelAndEffortForTab(t *testing.T) {
	app, tab, _, _ := newSmokeApp(t)
	projectRoot := tab.WorkspaceRoot
	t.Setenv("SMOKE_MODEL_KEY", "test-key")
	configBody := `default_model = "smoke-a/deepseek-v4-flash"
[codegraph]
enabled = false

[[providers]]
name = "smoke-a"
kind = "openai"
base_url = "https://api.deepseek.com"
model = "deepseek-v4-flash"
models = ["deepseek-v4-flash"]
api_key_env = "SMOKE_MODEL_KEY"
effort = "medium"

[[providers]]
name = "smoke-b"
kind = "openai"
base_url = "https://api.deepseek.com"
model = "deepseek-v4-flash"
models = ["deepseek-v4-flash"]
api_key_env = "SMOKE_MODEL_KEY"
effort = "max"
`
	if err := os.WriteFile(filepath.Join(projectRoot, "voltui.toml"), []byte(configBody), 0o644); err != nil {
		t.Fatalf("write project config: %v", err)
	}
	tab.model = "smoke-a/deepseek-v4-flash"

	models := app.ModelsForTab(tab.ID)
	if !hasModel(models, "smoke-a/deepseek-v4-flash", true) || !hasModel(models, "smoke-b/deepseek-v4-flash", false) {
		t.Fatalf("ModelsForTab = %#v, want smoke-a current and smoke-b available", models)
	}
	if err := app.SetModelForTab(tab.ID, "smoke-b/deepseek-v4-flash"); err != nil {
		t.Fatalf("SetModelForTab: %v", err)
	}
	if tab.model != "smoke-b/deepseek-v4-flash" {
		t.Fatalf("tab model = %q, want smoke-b/deepseek-v4-flash", tab.model)
	}
	if got := app.EffortForTab(tab.ID); !got.Supported || got.Current != "max" {
		t.Fatalf("EffortForTab after model switch = %+v, want max", got)
	}
	if err := app.SetEffortForTab(tab.ID, "high"); err != nil {
		t.Fatalf("SetEffortForTab: %v", err)
	}
	if got := app.EffortForTab(tab.ID).Current; got != "high" {
		t.Fatalf("EffortForTab after effort switch = %q, want high", got)
	}
}

func hasEventKind(events []event.Event, kind event.Kind) bool {
	for _, e := range events {
		if e.Kind == kind {
			return true
		}
	}
	return false
}

func firstUserHistory(history []HistoryMessage) *HistoryMessage {
	for i := range history {
		if history[i].Role == "user" {
			return &history[i]
		}
	}
	return nil
}

func hasModel(models []ModelInfo, ref string, current bool) bool {
	for _, model := range models {
		if model.Ref == ref && model.Current == current {
			return true
		}
	}
	return false
}
