package main

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"

	"reasonix/internal/bot"
	"reasonix/internal/event"
)

type bridgeNotifyCall struct {
	connectionID string
	domain       string
	msg          bot.OutboundMessage
}

type bridgeTestEnv struct {
	hub      *botBridgeHub
	notified chan bridgeNotifyCall
	approves chan [2]string // [tabID, id+":"+allow]
	answers  chan [2]string // [tabID, id]
}

func newBridgeTestEnv(tabs []TabMeta) *bridgeTestEnv {
	env := &bridgeTestEnv{
		notified: make(chan bridgeNotifyCall, 16),
		approves: make(chan [2]string, 16),
		answers:  make(chan [2]string, 16),
	}
	env.hub = newBotBridgeHub(
		func() []TabMeta { return tabs },
		func(tabID, id string, allow, session, persist bool) {
			env.approves <- [2]string{tabID, fmt.Sprintf("%s:%t", id, allow)}
		},
		func(tabID, id string, answers []QuestionAnswer) {
			env.answers <- [2]string{tabID, id}
		},
		func(ctx context.Context, connectionID, domain string, msg bot.OutboundMessage) (bot.SendResult, error) {
			env.notified <- bridgeNotifyCall{connectionID: connectionID, domain: domain, msg: msg}
			return bot.SendResult{MessageID: "sent-1"}, nil
		},
		slog.New(slog.NewTextHandler(io.Discard, nil)),
	)
	return env
}

func (env *bridgeTestEnv) waitNotification(t *testing.T) bridgeNotifyCall {
	t.Helper()
	select {
	case call := <-env.notified:
		return call
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for bridge notification")
		return bridgeNotifyCall{}
	}
}

func (env *bridgeTestEnv) expectNoNotification(t *testing.T) {
	t.Helper()
	select {
	case call := <-env.notified:
		t.Fatalf("unexpected notification: %+v", call)
	case <-time.After(100 * time.Millisecond):
	}
}

func testWatchRoute() bot.DesktopWatchRoute {
	return bot.DesktopWatchRoute{
		ConnectionID: "feishu-main",
		Domain:       "feishu",
		Platform:     bot.PlatformFeishu,
		ChatType:     bot.ChatDM,
		ChatID:       "chat-god",
	}
}

func TestBridgeApprovalNotifiesWatchersAndRoutesApproval(t *testing.T) {
	env := newBridgeTestEnv([]TabMeta{{ID: "tab-1", Label: "修复登录"}})
	env.hub.SetWatch(testWatchRoute(), true)

	env.hub.observe("tab-1", event.Event{Kind: event.ApprovalRequest, Approval: event.Approval{
		ID: "appr-1", Tool: "bash", Subject: "rm -rf build",
	}})

	call := env.waitNotification(t)
	if call.connectionID != "feishu-main" || call.msg.ChatID != "chat-god" {
		t.Fatalf("notification routed to %s/%s, want feishu-main/chat-god", call.connectionID, call.msg.ChatID)
	}
	for _, want := range []string{"修复登录", "bash", "rm -rf build", "/desktop approve appr-1"} {
		if !strings.Contains(call.msg.Text, want) {
			t.Fatalf("notification text = %q, want it to contain %q", call.msg.Text, want)
		}
	}
	if call.msg.Card == nil {
		t.Fatal("approval notification should carry an interactive card")
	}

	feedback, err := env.hub.Approve("appr-1", true)
	if err != nil {
		t.Fatalf("Approve: %v", err)
	}
	if !strings.Contains(feedback, "先到者为准") {
		t.Fatalf("feedback = %q, want first-wins note", feedback)
	}
	select {
	case got := <-env.approves:
		if got[0] != "tab-1" || got[1] != "appr-1:true" {
			t.Fatalf("approve routed as %v, want tab-1/appr-1:true", got)
		}
	case <-time.After(time.Second):
		t.Fatal("approve was not routed to the tab")
	}

	// 同一 ID 第二次应答:pending 已清,返回未找到。
	if _, err := env.hub.Approve("appr-1", false); err == nil {
		t.Fatal("second Approve on the same id should fail")
	}
}

func TestBridgePendingRecordedWithoutWatchers(t *testing.T) {
	env := newBridgeTestEnv([]TabMeta{{ID: "tab-1", Label: "会话"}})

	env.hub.observe("tab-1", event.Event{Kind: event.ApprovalRequest, Approval: event.Approval{ID: "appr-2", Tool: "bash"}})
	env.expectNoNotification(t)

	if _, err := env.hub.Approve("appr-2", false); err != nil {
		t.Fatalf("Approve without watchers should still work: %v", err)
	}
	select {
	case got := <-env.approves:
		if got[1] != "appr-2:false" {
			t.Fatalf("deny routed as %v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("deny was not routed")
	}
}

func TestBridgeTurnDoneClearsPendingAndNotifies(t *testing.T) {
	env := newBridgeTestEnv([]TabMeta{{ID: "tab-1", Label: "会话一"}})
	env.hub.SetWatch(testWatchRoute(), true)

	env.hub.observe("tab-1", event.Event{Kind: event.ApprovalRequest, Approval: event.Approval{ID: "appr-3", Tool: "bash"}})
	env.waitNotification(t)

	env.hub.observe("tab-1", event.Event{Kind: event.TurnDone})
	call := env.waitNotification(t)
	if !strings.Contains(call.msg.Text, "✅") || !strings.Contains(call.msg.Text, "会话一") {
		t.Fatalf("turn-done text = %q", call.msg.Text)
	}

	if _, err := env.hub.Approve("appr-3", true); err == nil {
		t.Fatal("pending approval should be cleared by TurnDone")
	}
}

func TestBridgeSuppressesCanceledTurnAndErrorsNotify(t *testing.T) {
	env := newBridgeTestEnv([]TabMeta{{ID: "tab-1", Label: "会话一"}})
	env.hub.SetWatch(testWatchRoute(), true)

	env.hub.observe("tab-1", event.Event{Kind: event.TurnDone, Err: errors.New("context canceled")})
	env.expectNoNotification(t)

	env.hub.observe("tab-1", event.Event{Kind: event.TurnDone, Err: errors.New("boom")})
	call := env.waitNotification(t)
	if !strings.Contains(call.msg.Text, "❌") || !strings.Contains(call.msg.Text, "boom") {
		t.Fatalf("error text = %q", call.msg.Text)
	}
}

func TestBridgeAskAnswerRoundTrip(t *testing.T) {
	env := newBridgeTestEnv([]TabMeta{{ID: "tab-2", Label: "问答会话"}})
	env.hub.SetWatch(testWatchRoute(), true)

	env.hub.observe("tab-2", event.Event{Kind: event.AskRequest, Ask: event.Ask{
		ID: "ask-1",
		Questions: []event.AskQuestion{{
			ID:      "q1",
			Prompt:  "选一个方案",
			Options: []event.AskOption{{Label: "A"}, {Label: "B"}},
		}},
	}})
	call := env.waitNotification(t)
	if !strings.Contains(call.msg.Text, "/desktop answer ask-1") {
		t.Fatalf("ask notification = %q, want answer hint", call.msg.Text)
	}
	if call.msg.Card == nil {
		t.Fatal("single-choice ask should carry option buttons")
	}

	questions, ok := env.hub.AskQuestions("ask-1")
	if !ok || len(questions) != 1 {
		t.Fatalf("AskQuestions = %v/%v", questions, ok)
	}
	if _, err := env.hub.Answer("ask-1", []event.AskAnswer{{QuestionID: "q1", Selected: []string{"B"}}}); err != nil {
		t.Fatalf("Answer: %v", err)
	}
	select {
	case got := <-env.answers:
		if got[0] != "tab-2" || got[1] != "ask-1" {
			t.Fatalf("answer routed as %v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("answer was not routed")
	}
}

func TestBridgeWatchLifecycleStopsNotifications(t *testing.T) {
	env := newBridgeTestEnv(nil)
	route := testWatchRoute()

	env.hub.SetWatch(route, true)
	if !env.hub.Watching(route) {
		t.Fatal("route should be watching after SetWatch(true)")
	}
	env.hub.SetWatch(route, false)
	if env.hub.Watching(route) {
		t.Fatal("route should not be watching after SetWatch(false)")
	}

	env.hub.observe("tab-x", event.Event{Kind: event.TurnDone})
	env.expectNoNotification(t)
}
