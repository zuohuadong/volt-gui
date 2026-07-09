package bot

import (
	"fmt"
	"strings"
	"testing"

	"reasonix/internal/event"
)

type fakeDesktopBridge struct {
	sessions  []DesktopSessionInfo
	watching  map[string]bool
	approved  []string
	denied    []string
	answered  map[string][]event.AskAnswer
	questions map[string][]event.AskQuestion
}

func newFakeDesktopBridge() *fakeDesktopBridge {
	return &fakeDesktopBridge{
		watching:  make(map[string]bool),
		answered:  make(map[string][]event.AskAnswer),
		questions: make(map[string][]event.AskQuestion),
	}
}

func (f *fakeDesktopBridge) Sessions() []DesktopSessionInfo { return f.sessions }
func (f *fakeDesktopBridge) SetWatch(route DesktopWatchRoute, enable bool) {
	f.watching[route.Key()] = enable
}
func (f *fakeDesktopBridge) Watching(route DesktopWatchRoute) bool {
	return f.watching[route.Key()]
}
func (f *fakeDesktopBridge) Approve(id string, allow bool) (string, error) {
	if id == "gone" {
		return "", fmt.Errorf("未找到待处理的审批 %s", id)
	}
	if allow {
		f.approved = append(f.approved, id)
	} else {
		f.denied = append(f.denied, id)
	}
	return "已提交", nil
}
func (f *fakeDesktopBridge) AskQuestions(id string) ([]event.AskQuestion, bool) {
	qs, ok := f.questions[id]
	return qs, ok
}
func (f *fakeDesktopBridge) Answer(id string, answers []event.AskAnswer) (string, error) {
	f.answered[id] = answers
	return "已提交回答", nil
}

func desktopTestMessage(text string) InboundMessage {
	return InboundMessage{
		Platform:     PlatformFeishu,
		ConnectionID: "feishu-main",
		Domain:       "feishu",
		ChatType:     ChatDM,
		ChatID:       "chat-god",
		UserID:       "admin-user",
		Text:         text,
	}
}

func TestHandleDesktopCommandWithoutBridge(t *testing.T) {
	gw := &BotGateway{cfg: GatewayConfig{}}
	got := gw.handleDesktopCommand(desktopTestMessage("/desktop status"))
	if !strings.Contains(got, "未运行在桌面端进程内") {
		t.Fatalf("reply = %q, want standalone-mode notice", got)
	}
}

func TestHandleDesktopCommandStatusListsSessions(t *testing.T) {
	bridge := newFakeDesktopBridge()
	bridge.sessions = []DesktopSessionInfo{
		{TabID: "tab-1", Label: "修复登录", Workspace: "blade", Running: true, Ready: true},
		{TabID: "tab-2", Label: "", Topic: "周报", Ready: true, PendingPrompt: true},
	}
	gw := &BotGateway{cfg: GatewayConfig{Desktop: bridge}}

	got := gw.handleDesktopCommand(desktopTestMessage("/desktop status"))
	for _, want := range []string{"2 个", "修复登录", "▶️ 执行中", "周报", "⚠️ 等待审批/回答", "tab-1", "blade"} {
		if !strings.Contains(got, want) {
			t.Fatalf("status reply = %q, want it to contain %q", got, want)
		}
	}
}

func TestHandleDesktopCommandStatusEmpty(t *testing.T) {
	gw := &BotGateway{cfg: GatewayConfig{Desktop: newFakeDesktopBridge()}}
	got := gw.handleDesktopCommand(desktopTestMessage("/desktop"))
	if !strings.Contains(got, "没有 live 会话") {
		t.Fatalf("reply = %q, want empty-sessions notice", got)
	}
}

func TestHandleDesktopCommandWatchLifecycle(t *testing.T) {
	bridge := newFakeDesktopBridge()
	gw := &BotGateway{cfg: GatewayConfig{Desktop: bridge}}
	msg := desktopTestMessage("/desktop watch on")

	got := gw.handleDesktopCommand(msg)
	if !strings.Contains(got, "已订阅") {
		t.Fatalf("watch on reply = %q", got)
	}
	route := desktopRouteFromMessage(msg)
	if !bridge.watching[route.Key()] {
		t.Fatal("watch on did not subscribe the message route")
	}

	msg.Text = "/desktop watch off"
	got = gw.handleDesktopCommand(msg)
	if !strings.Contains(got, "已退订") {
		t.Fatalf("watch off reply = %q", got)
	}
	if bridge.watching[route.Key()] {
		t.Fatal("watch off did not unsubscribe the message route")
	}
}

func TestHandleDesktopCommandApproveAndDeny(t *testing.T) {
	bridge := newFakeDesktopBridge()
	gw := &BotGateway{cfg: GatewayConfig{Desktop: bridge}}

	if got := gw.handleDesktopCommand(desktopTestMessage("/desktop approve appr-1")); !strings.Contains(got, "已提交") {
		t.Fatalf("approve reply = %q", got)
	}
	if got := gw.handleDesktopCommand(desktopTestMessage("/desktop deny appr-2")); !strings.Contains(got, "已提交") {
		t.Fatalf("deny reply = %q", got)
	}
	if len(bridge.approved) != 1 || bridge.approved[0] != "appr-1" {
		t.Fatalf("approved = %v, want [appr-1]", bridge.approved)
	}
	if len(bridge.denied) != 1 || bridge.denied[0] != "appr-2" {
		t.Fatalf("denied = %v, want [appr-2]", bridge.denied)
	}

	if got := gw.handleDesktopCommand(desktopTestMessage("/desktop approve gone")); !strings.Contains(got, "未找到") {
		t.Fatalf("missing-approval reply = %q", got)
	}
	if got := gw.handleDesktopCommand(desktopTestMessage("/desktop approve")); got != desktopCommandUsage {
		t.Fatalf("missing-arg reply = %q, want usage", got)
	}
}

func TestHandleDesktopCommandAnswerParsesSelection(t *testing.T) {
	bridge := newFakeDesktopBridge()
	bridge.questions["ask-1"] = []event.AskQuestion{{
		ID:      "q1",
		Prompt:  "选一个",
		Options: []event.AskOption{{Label: "方案 A"}, {Label: "方案 B"}},
	}}
	gw := &BotGateway{cfg: GatewayConfig{Desktop: bridge}}

	got := gw.handleDesktopCommand(desktopTestMessage("/desktop answer ask-1 2"))
	if !strings.Contains(got, "已提交回答") {
		t.Fatalf("answer reply = %q", got)
	}
	answers := bridge.answered["ask-1"]
	if len(answers) != 1 || answers[0].QuestionID != "q1" {
		t.Fatalf("answers = %+v, want one answer for q1", answers)
	}
	if len(answers[0].Selected) != 1 || answers[0].Selected[0] != "方案 B" {
		t.Fatalf("selected = %v, want numeric index resolved to 方案 B", answers[0].Selected)
	}

	if got := gw.handleDesktopCommand(desktopTestMessage("/desktop answer ask-gone 1")); !strings.Contains(got, "未找到") {
		t.Fatalf("missing-ask reply = %q", got)
	}
}
