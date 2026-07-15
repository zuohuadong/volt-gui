package main

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"
)

func TestDesktopWorkbenchStateRoundTripsAtomically(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()
	raw := `{"version":2,"projectTasks":[],"inboxTasks":[]}`
	if err := app.SaveDesktopWorkbenchState(raw); err != nil {
		t.Fatalf("save desktop workbench state: %v", err)
	}
	got, err := app.LoadDesktopWorkbenchState()
	if err != nil {
		t.Fatalf("load desktop workbench state: %v", err)
	}
	var gotJSON, wantJSON any
	if err := json.Unmarshal([]byte(got), &gotJSON); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal([]byte(raw), &wantJSON); err != nil {
		t.Fatal(err)
	}
	if strings.TrimSpace(got) == "" || !json.Valid([]byte(got)) || !reflect.DeepEqual(gotJSON, wantJSON) {
		t.Fatalf("state = %q, want JSON equivalent to %q", got, raw)
	}
}

func TestDesktopWorkbenchStateStripsTranscriptBodies(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()
	raw := `{"version":2,"projectTasks":[],"inboxTasks":[{"id":"task-1","title":"任务","transcript":[{"body":"secret body"}]}]}`
	if err := app.SaveDesktopWorkbenchState(raw); err != nil {
		t.Fatalf("save desktop workbench state: %v", err)
	}
	got, err := app.LoadDesktopWorkbenchState()
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(got, "secret body") || strings.Contains(got, "transcript") {
		t.Fatalf("backend snapshot retained transcript content: %s", got)
	}
}

func TestDesktopWorkbenchStateRejectsInvalidOrOversizedPayload(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := NewApp()
	if err := app.SaveDesktopWorkbenchState("not-json"); err == nil {
		t.Fatal("invalid JSON was accepted")
	}
	if err := app.SaveDesktopWorkbenchState(`{"version":2,"blob":"` + strings.Repeat("x", maxDesktopWorkbenchState) + `"}`); err == nil {
		t.Fatal("oversized state was accepted")
	}
}
