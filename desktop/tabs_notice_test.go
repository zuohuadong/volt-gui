package main

import (
	"strings"
	"testing"
)

func TestSessionBindingWorkspaceNoticeHidesLocalPaths(t *testing.T) {
	const oldRoot = `C:\Users\tester\old-project`
	const nextRoot = `/Users/tester/new-project`
	notice := sessionBindingWorkspaceNotice("project", oldRoot, "project", nextRoot)

	if !strings.Contains(notice, "已切换到会话保存的工作区") {
		t.Fatalf("notice = %q, want an actionable Chinese explanation", notice)
	}
	if strings.Contains(notice, oldRoot) || strings.Contains(notice, nextRoot) || strings.Contains(notice, "Session belongs to") {
		t.Fatalf("notice leaked an internal workspace path: %q", notice)
	}
}

func TestApplySessionBindingDeduplicatesWorkspaceNotice(t *testing.T) {
	recorder := &desktopRecordSink{}
	sink := &tabEventSink{tabID: "tab"}
	sink.SetBotSink(recorder)
	tab := &WorkspaceTab{
		ID:            "tab",
		Scope:         "project",
		WorkspaceRoot: "/workspace/old",
		sink:          sink,
	}
	app := &App{tabs: map[string]*WorkspaceTab{}}
	binding := sessionBinding{path: "/sessions/one.jsonl", scope: "global"}

	app.applySessionBindingToTab(tab, binding)
	if len(recorder.events) != 1 {
		t.Fatalf("first workspace repair emitted %d notices, want 1", len(recorder.events))
	}

	tab.Scope = "project"
	tab.WorkspaceRoot = "/workspace/old"
	app.applySessionBindingToTab(tab, binding)
	if len(recorder.events) != 1 {
		t.Fatalf("duplicate workspace repair emitted %d notices, want 1", len(recorder.events))
	}

	tab.Scope = "project"
	tab.WorkspaceRoot = "/workspace/old"
	app.applySessionBindingToTab(tab, sessionBinding{path: "/sessions/two.jsonl", scope: "global"})
	if len(recorder.events) != 2 {
		t.Fatalf("a different session binding emitted %d notices, want 2", len(recorder.events))
	}
}

func TestApplySessionBindingDoesNotDeduplicateBeforeSinkExists(t *testing.T) {
	tab := &WorkspaceTab{ID: "tab", Scope: "project", WorkspaceRoot: "/workspace/old"}
	app := &App{tabs: map[string]*WorkspaceTab{}}
	binding := sessionBinding{path: "/sessions/one.jsonl", scope: "global"}

	app.applySessionBindingToTab(tab, binding)
	if tab.sessionBindingNoticeKey != "" {
		t.Fatal("binding without an event sink was marked as already notified")
	}

	recorder := &desktopRecordSink{}
	tab.sink = &tabEventSink{tabID: "tab"}
	tab.sink.SetBotSink(recorder)
	tab.Scope = "project"
	tab.WorkspaceRoot = "/workspace/old"
	app.applySessionBindingToTab(tab, binding)
	if len(recorder.events) != 1 {
		t.Fatalf("workspace repair after attaching the sink emitted %d notices, want 1", len(recorder.events))
	}
}

func TestApplySessionBindingDoesNotDeduplicateBeforeSinkHasAudience(t *testing.T) {
	tab := &WorkspaceTab{
		ID:            "tab",
		Scope:         "project",
		WorkspaceRoot: "/workspace/old",
		sink:          &tabEventSink{tabID: "tab"},
	}
	app := &App{tabs: map[string]*WorkspaceTab{}}
	binding := sessionBinding{path: "/sessions/one.jsonl", scope: "global"}

	app.applySessionBindingToTab(tab, binding)
	if tab.sessionBindingNoticeKey != "" {
		t.Fatal("binding without a runtime or bot audience was marked as already notified")
	}

	recorder := &desktopRecordSink{}
	tab.sink.SetBotSink(recorder)
	tab.Scope = "project"
	tab.WorkspaceRoot = "/workspace/old"
	app.applySessionBindingToTab(tab, binding)
	if len(recorder.events) != 1 {
		t.Fatalf("workspace repair after attaching an audience emitted %d notices, want 1", len(recorder.events))
	}
}
