package control

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"voltui/internal/agent"
	"voltui/internal/event"
	"voltui/internal/guardian"
	"voltui/internal/permission"
	"voltui/internal/provider"
	"voltui/internal/tool"
)

const dynamicBashCommand = "git status $(touch /tmp/voltui-dynamic-approval)"

type dynamicApprovalResult struct {
	allow bool
	err   error
}

func requestDynamicBashApproval(c *Controller) <-chan dynamicApprovalResult {
	done := make(chan dynamicApprovalResult, 1)
	go func() {
		allow, _, err := gateApprover{c}.Approve(context.Background(), "bash", dynamicBashCommand, dynamicBashArgs())
		done <- dynamicApprovalResult{allow: allow, err: err}
	}()
	return done
}

func dynamicBashArgs() json.RawMessage {
	return json.RawMessage(`{"command":"git status $(touch /tmp/voltui-dynamic-approval)"}`)
}

func waitDynamicApproval(t *testing.T, approvals <-chan event.Approval) event.Approval {
	t.Helper()
	select {
	case approval := <-approvals:
		return approval
	case <-time.After(2 * time.Second):
		t.Fatal("dynamic Bash approval prompt was not emitted")
		return event.Approval{}
	}
}

func assertDynamicApprovalPending(t *testing.T, done <-chan dynamicApprovalResult) {
	t.Helper()
	select {
	case got := <-done:
		t.Fatalf("dynamic Bash approval completed without a human decision: %+v", got)
	case <-time.After(50 * time.Millisecond):
	}
}

func approveDynamicRequest(t *testing.T, c *Controller, approval event.Approval, done <-chan dynamicApprovalResult) {
	t.Helper()
	c.Approve(approval.ID, true, false, false)
	select {
	case got := <-done:
		if got.err != nil || !got.allow {
			t.Fatalf("manual approval = %+v, want allow", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("dynamic Bash approval stayed blocked")
	}
}

func TestDynamicBashRequiresInteractiveHumanInAutoAndApprovedPlan(t *testing.T) {
	setups := map[string]func(*Controller){
		"auto":          func(c *Controller) { c.SetToolApprovalMode(ToolApprovalAuto) },
		"approved plan": func(c *Controller) { c.approval.setPlanAutoApprove(true) },
	}
	for name, setup := range setups {
		t.Run(name, func(t *testing.T) {
			approvals := make(chan event.Approval, 1)
			c := New(Options{Sink: approvalSink(approvals)})
			setup(c)
			done := requestDynamicBashApproval(c)
			approval := waitDynamicApproval(t, approvals)
			assertDynamicApprovalPending(t, done)
			approveDynamicRequest(t, c, approval, done)
		})
	}
}

func approvalSink(approvals chan<- event.Approval) event.Sink {
	return event.FuncSink(func(e event.Event) {
		if e.Kind == event.ApprovalRequest {
			approvals <- e.Approval
		}
	})
}

func TestExactOnlyBashDoesNotPromptInAutoOrApprovedPlan(t *testing.T) {
	setups := map[string]func(*Controller){
		"auto":          func(c *Controller) { c.SetToolApprovalMode(ToolApprovalAuto) },
		"approved plan": func(c *Controller) { c.approval.setPlanAutoApprove(true) },
	}
	for name, setup := range setups {
		t.Run(name, func(t *testing.T) {
			assertExactOnlyBashAllowed(t, setup)
		})
	}
}

func assertExactOnlyBashAllowed(t *testing.T, setup func(*Controller)) {
	t.Helper()
	approvals := make(chan event.Approval, 4)
	c := New(Options{Sink: approvalSink(approvals)})
	setup(c)
	gate := c.newInteractiveGate()
	for _, command := range []string{"REV=HEAD git diff", "git status > status.txt", "rm *.log", "echo $HOME"} {
		args, err := json.Marshal(map[string]string{"command": command})
		if err != nil {
			t.Fatal(err)
		}
		allow, reason, err := gate.Check(context.Background(), "bash", args, false)
		if err != nil || !allow || reason != "" {
			t.Errorf("command %q = (%v,%q,%v), want allow without prompt", command, allow, reason, err)
		}
	}
	select {
	case approval := <-approvals:
		t.Fatalf("exact-only Bash unexpectedly prompted: %+v", approval)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestDynamicBashPendingApprovalOnlyYoloCanDrain(t *testing.T) {
	approvals := make(chan event.Approval, 1)
	c := New(Options{Sink: approvalSink(approvals)})
	done := requestDynamicBashApproval(c)
	_ = waitDynamicApproval(t, approvals)
	c.SetToolApprovalMode(ToolApprovalAuto)
	assertDynamicApprovalPending(t, done)
	c.SetToolApprovalMode(ToolApprovalYolo)
	select {
	case got := <-done:
		if got.err != nil || !got.allow {
			t.Fatalf("YOLO-drained approval = %+v, want allow", got)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("YOLO did not drain dynamic Bash approval")
	}
}

func TestDynamicBashExactSessionAndPersistentGrants(t *testing.T) {
	approvals := make(chan event.Approval, 2)
	remembered := make(chan string, 1)
	c := New(Options{Sink: approvalSink(approvals), OnRemember: func(rule string) RememberResult {
		remembered <- rule
		return RememberResult{Saved: true}
	}})
	done := requestDynamicBashApproval(c)
	approval := waitDynamicApproval(t, approvals)
	c.Approve(approval.ID, true, true, true)
	if got := <-done; got.err != nil || !got.allow {
		t.Fatalf("initial approval = %+v, want allow", got)
	}
	if got, want := <-remembered, "Bash="+dynamicBashCommand; got != want {
		t.Fatalf("remembered rule = %q, want %q", got, want)
	}
	allow, _, err := gateApprover{c}.Approve(context.Background(), "bash", dynamicBashCommand, dynamicBashArgs())
	if err != nil || !allow {
		t.Fatalf("exact session grant = (%v,%v), want allow", allow, err)
	}
	select {
	case approval := <-approvals:
		t.Fatalf("exact session grant unexpectedly prompted: %+v", approval)
	case <-time.After(50 * time.Millisecond):
	}
}

func TestDynamicBashSkipsGuardianAllow(t *testing.T) {
	guardianProvider := &recordingProvider{
		name: "guardian", streams: [][]provider.Chunk{textTurn(`{"risk_level":"low","user_authorization":"high","outcome":"allow","rationale":"safe"}`)},
	}
	guardianSession := guardian.NewSession(guardianProvider, tool.NewRegistry(), guardian.PolicyPrompt(), "guardian-test", 0, nil, event.Discard)
	executor := agent.New(&recordingProvider{name: "executor"}, tool.NewRegistry(), agent.NewSession("sys"), agent.Options{}, event.Discard)
	approvals := make(chan event.Approval, 1)
	c := New(Options{Executor: executor, Guardian: guardianSession, Sink: approvalSink(approvals)})
	done := requestDynamicBashApproval(c)
	approval := waitDynamicApproval(t, approvals)
	if len(guardianProvider.requests) != 0 {
		t.Fatalf("dynamic Bash Guardian reviews = %d, want 0", len(guardianProvider.requests))
	}
	approveDynamicRequest(t, c, approval, done)
}

func TestHeadlessDynamicBashRequiresExactLiteralGrant(t *testing.T) {
	gate := NewHeadlessPermissionGate(permission.New("allow", []string{"Bash"}, nil, nil))
	allow, reason, err := gate.Check(context.Background(), "bash", dynamicBashArgs(), false)
	if err != nil || allow || !strings.Contains(reason, "requires human approval") {
		t.Fatalf("headless broad allow = (%v,%q,%v), want human-approval denial", allow, reason, err)
	}
	exactGate := NewHeadlessPermissionGate(permission.New("ask", []string{"Bash=" + dynamicBashCommand}, nil, nil))
	allow, reason, err = exactGate.Check(context.Background(), "bash", dynamicBashArgs(), false)
	if err != nil || !allow || reason != "" {
		t.Fatalf("headless exact literal = (%v,%q,%v), want allow", allow, reason, err)
	}
}
