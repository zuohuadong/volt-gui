package agent

import (
	"context"
	"strings"
	"testing"

	"voltui/internal/provider"
	"voltui/internal/tool"
)

// TestReadOnlyChurnGuardEscalatesRepeatedInspection covers the office-document
// failure mode where the model proofreads by re-running grep/bash/python checks
// round after round. Every call succeeds and is read-only, so the failure
// storm breaker and the blocked streak never see the loop, and the todo stall
// guard treats each re-worded search as unique progress. After
// readOnlyChurnBreakThreshold consecutive read-only-only rounds the host must
// tell the model to stop re-checking and deliver.
func TestReadOnlyChurnGuardEscalatesRepeatedInspection(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(okTool{name: "read_file"})
	reg.Add(okTool{name: "grep"})
	sink, notices := noticeRecorder()
	a := New(nil, reg, NewSession(""), Options{}, sink)

	var last string
	for i := 0; i < readOnlyChurnBreakThreshold; i++ {
		// Vary tools and arguments every round, mirroring a model that re-words
		// each self-check so no identical-call guard can fire.
		name := "read_file"
		if i%2 == 1 {
			name = "grep"
		}
		call := provider.ToolCall{Name: name, Arguments: `{"round":` + strings.Repeat("x", i+1) + `}`}
		last = executeBatchOutputs(a, context.Background(), []provider.ToolCall{call})[0]
		if i < readOnlyChurnBreakThreshold-1 && strings.Contains(last, "[loop guard]") {
			t.Fatalf("round %d should not carry the loop guard yet, got: %q", i+1, last)
		}
	}

	if !strings.Contains(last, "[loop guard]") {
		t.Fatalf("after %d read-only-only rounds the result should carry the loop guard, got: %q", readOnlyChurnBreakThreshold, last)
	}
	if !strings.Contains(last, "deliver the final result") {
		t.Errorf("loop-guard text should direct the model to deliver, got: %q", last)
	}
	if len(*notices) == 0 {
		t.Errorf("loop guard should emit a notice to the user")
	}
	if len(*notices) != 1 {
		t.Errorf("loop guard should fire once per run, got %d notices", len(*notices))
	}

	// Ignoring the directive must not re-inject it every round: repeated
	// injections would grow the transcript tail and re-trigger compaction,
	// cratering the prompt cache the stuck guard exists to protect.
	next := executeBatchOutputs(a, context.Background(), []provider.ToolCall{{Name: "read_file", Arguments: `{"again":true}`}})[0]
	if strings.Contains(next, "[loop guard]") {
		t.Errorf("guard must not re-fire while the churn run continues, got: %q", next)
	}
	if len(*notices) != 1 {
		t.Errorf("continued churn should not emit more notices, got %d", len(*notices))
	}
}

// TestReadOnlyChurnGuardResetsOnMutation: a mutating round is real progress, so
// it must reset the consecutive read-only counter; the guard only fires after
// another full run of read-only-only rounds.
func TestReadOnlyChurnGuardResetsOnMutation(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(okTool{name: "read_file"})
	reg.Add(fakeTool{name: "edit_file", readOnly: false})
	sink, _ := noticeRecorder()
	a := New(nil, reg, NewSession(""), Options{}, sink)

	readRound := func() string {
		call := provider.ToolCall{Name: "read_file", Arguments: `{}`}
		return executeBatchOutputs(a, context.Background(), []provider.ToolCall{call})[0]
	}

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		readRound()
	}
	edit := provider.ToolCall{Name: "edit_file", Arguments: `{}`}
	executeBatchOutputs(a, context.Background(), []provider.ToolCall{edit})

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		if got := readRound(); strings.Contains(got, "[loop guard]") {
			t.Fatalf("mutation should have reset the counter; round %d carried the guard: %q", i+1, got)
		}
	}
	if got := readRound(); !strings.Contains(got, "[loop guard]") {
		t.Fatalf("guard should fire after a fresh run of %d read-only-only rounds, got: %q", readOnlyChurnBreakThreshold, got)
	}
}

// TestReadOnlyChurnGuardResetsOnFailure: a failing read-only round is a real
// blocker the model must react to, not churn, so it resets the counter.
func TestReadOnlyChurnGuardResetsOnFailure(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(okTool{name: "read_file"})
	reg.Add(failTool{name: "grep"})
	sink, _ := noticeRecorder()
	a := New(nil, reg, NewSession(""), Options{}, sink)

	readRound := func() string {
		call := provider.ToolCall{Name: "read_file", Arguments: `{}`}
		return executeBatchOutputs(a, context.Background(), []provider.ToolCall{call})[0]
	}

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		readRound()
	}
	failing := provider.ToolCall{Name: "grep", Arguments: `{}`}
	executeBatchOutputs(a, context.Background(), []provider.ToolCall{failing})

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		if got := readRound(); strings.Contains(got, "[loop guard]") {
			t.Fatalf("failure should have reset the counter; round %d carried the guard: %q", i+1, got)
		}
	}
	if got := readRound(); !strings.Contains(got, "[loop guard]") {
		t.Fatalf("guard should fire after a fresh run of %d read-only-only rounds, got: %q", readOnlyChurnBreakThreshold, got)
	}
}
