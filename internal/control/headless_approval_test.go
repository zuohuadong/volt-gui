package control

import (
	"context"
	"testing"
	"time"

	"reasonix/internal/agent"
	"reasonix/internal/event"
	"reasonix/internal/permission"
	"reasonix/internal/provider"
	"reasonix/internal/tool"
)

// TestApplyHeadlessApprovalModeAutoDoesNotPrompt reproduces the `reasonix run
// --permission-mode auto` hang: a tool matching an explicit Ask rule must be
// allowed without emitting an approval prompt, because a headless run has no key
// loop to answer it and the default approval timeout is infinite. The turn must
// complete and the write must execute.
func TestApplyHeadlessApprovalModeAutoDoesNotPrompt(t *testing.T) {
	writer := &recordingWriter{}
	reg := tool.NewRegistry()
	reg.Add(writer)

	prov := &scriptedTurns{turns: [][]provider.Chunk{
		toolCallTurn("c1", "write_file", `{"path":"a.txt"}`),
		textTurn("Done."),
	}}
	ag := agent.New(prov, reg, agent.NewSession(""), agent.Options{}, event.Discard)

	prompts := 0
	c := New(Options{
		Runner:   ag,
		Executor: ag,
		// An explicit Ask rule for the writer is the exact hang scenario.
		Policy: permission.New("ask", nil, []string{"write_file"}, nil),
		Sink: event.FuncSink(func(e event.Event) {
			if e.Kind == event.ApprovalRequest {
				prompts++
			}
		}),
		// ApprovalTimeout intentionally zero: a wrongful prompt would block forever.
	})
	c.ApplyHeadlessApprovalMode(ToolApprovalAuto)

	done := make(chan error, 1)
	go func() { done <- c.runTurnWithRaw(context.Background(), "edit", "edit") }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("runTurnWithRaw: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("headless auto approval must not block on an Ask-rule writer")
	}
	if prompts != 0 {
		t.Fatalf("approval prompts = %d, want 0 (headless run has no UI to answer)", prompts)
	}
	writer.mu.Lock()
	defer writer.mu.Unlock()
	if len(writer.paths) != 1 || writer.paths[0] != "a.txt" {
		t.Fatalf("executed writes = %v, want a.txt allowed", writer.paths)
	}
}

// TestApplyHeadlessApprovalModeDontAskDeniesWithoutPrompting checks that dontAsk
// denies a would-ask tool through the non-blocking deny approver rather than
// emitting a prompt or hanging.
func TestApplyHeadlessApprovalModeDontAskDeniesWithoutPrompting(t *testing.T) {
	writer := &recordingWriter{}
	reg := tool.NewRegistry()
	reg.Add(writer)

	prov := &scriptedTurns{turns: [][]provider.Chunk{
		toolCallTurn("c1", "write_file", `{"path":"a.txt"}`),
		textTurn("Done."),
	}}
	ag := agent.New(prov, reg, agent.NewSession(""), agent.Options{}, event.Discard)

	prompts := 0
	c := New(Options{
		Runner:   ag,
		Executor: ag,
		Policy:   permission.New("ask", nil, []string{"write_file"}, nil),
		Sink: event.FuncSink(func(e event.Event) {
			if e.Kind == event.ApprovalRequest {
				prompts++
			}
		}),
	})
	c.ApplyHeadlessApprovalMode(ToolApprovalDontAsk)

	done := make(chan error, 1)
	go func() { done <- c.runTurnWithRaw(context.Background(), "edit", "edit") }()
	select {
	case err := <-done:
		if err != nil {
			t.Fatalf("runTurnWithRaw: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("headless dontAsk must not block")
	}
	if prompts != 0 {
		t.Fatalf("approval prompts = %d, want 0 (dontAsk denies silently)", prompts)
	}
	writer.mu.Lock()
	defer writer.mu.Unlock()
	if len(writer.paths) != 0 {
		t.Fatalf("executed writes = %v, want none (dontAsk must deny)", writer.paths)
	}
}

// TestInteractiveGateIgnoresSessionAllowForFreshHumanTools guards the memory
// contract: --allowed-tools (SessionAllow) must never satisfy a tool that
// requires fresh human approval every call, even though SessionAllow outranks Ask
// rules for ordinary tools.
func TestInteractiveGateIgnoresSessionAllowForFreshHumanTools(t *testing.T) {
	policy := permission.New("ask", nil, nil, nil).
		WithSessionAllow([]string{"remember", "forget", "write_file"})
	c := New(Options{Policy: policy})

	gate := c.newInteractiveGate()
	for _, name := range []string{memoryRememberTool, memoryForgetTool} {
		if got := gate.Policy.DecideSubject(name, false, ""); got != permission.Ask {
			t.Fatalf("%s decision = %v, want Ask (SessionAllow must not cover fresh-human tools)", name, got)
		}
	}
	// An ordinary tool in the allowlist is still honored.
	if got := gate.Policy.DecideSubject("write_file", false, ""); got != permission.Allow {
		t.Fatalf("write_file decision = %v, want Allow (SessionAllow still applies to ordinary tools)", got)
	}
}
