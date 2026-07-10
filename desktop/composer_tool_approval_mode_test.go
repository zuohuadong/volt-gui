package main

import (
	"strings"
	"testing"

	"voltui/internal/control"
)

func TestSetToolApprovalModeForTabMapsComposerAutoApprove(t *testing.T) {
	isolateDesktopUserDirs(t)

	const tabID = "composer-tab"
	app := &App{
		tabs: map[string]*WorkspaceTab{
			tabID: {
				ID:               tabID,
				Scope:            "global",
				toolApprovalMode: control.ToolApprovalAsk,
				disabledMCP:      map[string]ServerView{},
			},
		},
		tabOrder:    []string{tabID},
		activeTabID: tabID,
	}

	if err := app.SetToolApprovalModeForTab(tabID, "auto-approve"); err != nil {
		t.Fatalf("SetToolApprovalModeForTab: %v", err)
	}
	if got := app.ListTabs()[0].ToolApprovalMode; got != control.ToolApprovalAuto {
		t.Fatalf("ListTabs()[0].ToolApprovalMode = %q, want %q", got, control.ToolApprovalAuto)
	}
}

func TestSetToolApprovalModeForTabRejectsMissingTab(t *testing.T) {
	app := &App{tabs: map[string]*WorkspaceTab{}}

	err := app.SetToolApprovalModeForTab("missing-tab", control.ToolApprovalAuto)
	if err == nil {
		t.Fatal("SetToolApprovalModeForTab() error = nil, want missing-tab error")
	}
	if !strings.Contains(err.Error(), "tab") || !strings.Contains(err.Error(), "not found") {
		t.Fatalf("SetToolApprovalModeForTab() error = %q, want a clear missing-tab error", err)
	}
}
