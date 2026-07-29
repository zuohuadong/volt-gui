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
