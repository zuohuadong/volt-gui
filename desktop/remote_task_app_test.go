//go:build bot

package main

import (
	"io"
	"log/slog"
	"strings"
	"testing"

	"voltui/internal/bot"
)

func TestDesktopRemoteTaskAPIsFailHonestlyWhenRuntimeIsStopped(t *testing.T) {
	app := &App{botRuntime: newDesktopBotRuntime()}
	checks := []struct {
		name string
		run  func() error
	}{
		{name: "bindings", run: func() error { _, err := app.ListRemoteBindings(); return err }},
		{name: "tasks", run: func() error { _, err := app.ListRemoteTasks(); return err }},
		{name: "task", run: func() error { _, err := app.RemoteTask("missing"); return err }},
		{name: "audit", run: func() error { _, err := app.ListRemoteAudit(); return err }},
		{name: "cancel", run: func() error { _, err := app.CancelRemoteTask("missing"); return err }},
		{name: "revoke", run: func() error { _, err := app.RevokeRemoteBinding("missing"); return err }},
	}
	for _, check := range checks {
		t.Run(check.name, func(t *testing.T) {
			if err := check.run(); err == nil || !strings.Contains(err.Error(), "not started") {
				t.Fatalf("error = %v, want honest runtime-not-started error", err)
			}
		})
	}
}

func TestDesktopRemoteTaskAPIsExposeAndGovernRuntimeState(t *testing.T) {
	store, err := bot.NewRemoteStore(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	endpoint := bot.RemoteEndpoint{Platform: bot.PlatformFeishu, ConnectionID: "feishu-lark", Domain: "lark", ChatType: bot.ChatDM, ChatID: "chat-1"}
	binding, _, err := store.EnsureBinding(bot.RemoteBinding{
		Endpoint: endpoint, ActorID: "owner", Status: bot.RemoteBindingActive,
		WorkspaceRoots: []string{"/workspace"}, ProjectIDs: []string{"project-1"}, PermissionCeiling: bot.RemotePermissionAsk,
	})
	if err != nil {
		t.Fatal(err)
	}
	beginQueued := func(messageID string) bot.RemoteTaskRecord {
		t.Helper()
		task, _, beginErr := store.BeginTask(binding.ID, bot.RemoteTaskSpec{
			Endpoint: endpoint, ActorID: "owner", MessageID: messageID, Goal: "test task",
			WorkspaceRoot: "/workspace", ProjectID: "project-1", PermissionMode: bot.RemotePermissionAsk,
		})
		if beginErr != nil {
			t.Fatal(beginErr)
		}
		queued, transitionErr := store.TransitionTask(task.ID, bot.RemoteTaskQueued, "")
		if transitionErr != nil {
			t.Fatal(transitionErr)
		}
		return queued
	}
	first := beginQueued("task-1")
	second := beginQueued("task-2")
	gw := bot.NewGateway(bot.GatewayConfig{RemoteStore: store}, nil, slog.New(slog.NewTextHandler(io.Discard, nil)))
	app := &App{botRuntime: &desktopBotRuntime{gw: gw}}

	bindings, err := app.ListRemoteBindings()
	if err != nil || len(bindings) != 1 || bindings[0].ID != binding.ID {
		t.Fatalf("bindings = %+v, %v", bindings, err)
	}
	tasks, err := app.ListRemoteTasks()
	if err != nil || len(tasks) != 2 {
		t.Fatalf("tasks = %+v, %v", tasks, err)
	}
	detail, err := app.RemoteTask(first.ID)
	if err != nil || detail.ID != first.ID {
		t.Fatalf("detail = %+v, %v", detail, err)
	}
	cancelled, err := app.CancelRemoteTask(first.ID)
	if err != nil || cancelled.Status != bot.RemoteTaskCancelled {
		t.Fatalf("cancelled = %+v, %v", cancelled, err)
	}
	revoked, err := app.RevokeRemoteBinding(binding.ID)
	if err != nil || revoked.Status != bot.RemoteBindingRevoked {
		t.Fatalf("revoked = %+v, %v", revoked, err)
	}
	if current, err := app.RemoteTask(second.ID); err != nil || current.Status != bot.RemoteTaskRevoked {
		t.Fatalf("second after revoke = %+v, %v", current, err)
	}
	audit, err := app.ListRemoteAudit()
	if err != nil || len(audit) == 0 {
		t.Fatalf("audit = %+v, %v", audit, err)
	}
}
