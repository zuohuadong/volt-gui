package agent

import (
	"context"
	"strings"
	"testing"

	"voltui/internal/agent/testutil"
	"voltui/internal/event"
	"voltui/internal/provider"
)

func TestAgentToolCallingDisabledOmitsSchemas(t *testing.T) {
	disabled := false
	prov := testutil.NewMock("tool-free", testutil.Turn{Text: "answer"})
	a := New(prov, calculationGateRegistry(), NewSession("system"), Options{ToolCalling: &disabled}, event.Discard)

	if err := a.Run(context.Background(), "answer directly"); err != nil {
		t.Fatalf("Run: %v", err)
	}
	requests := prov.Requests()
	if len(requests) != 1 || len(requests[0].Tools) != 0 {
		t.Fatalf("tool-free request exposed schemas: %+v", requests)
	}
}

func TestAgentToolCallingDisabledRejectsUnexpectedToolCalls(t *testing.T) {
	disabled := false
	prov := testutil.NewMock("tool-free", testutil.Turn{ToolCalls: []provider.ToolCall{{ID: "unexpected", Name: "calculate", Arguments: `{}`}}})
	a := New(prov, calculationGateRegistry(), NewSession("system"), Options{ToolCalling: &disabled}, event.Discard)

	err := a.Run(context.Background(), "answer directly")
	if err == nil || !strings.Contains(err.Error(), "tool calling is disabled") {
		t.Fatalf("Run error = %v, want disabled-tool-call rejection", err)
	}
}

func TestAgentToolCallingDisabledSkipsToolDependentCompletionGates(t *testing.T) {
	disabled := false
	prov := testutil.NewMock("tool-free", testutil.Turn{Text: "Here is a concise plan."})
	a := New(prov, calculationGateRegistry(), NewSession("system"), Options{ToolCalling: &disabled, DeliveryProfile: true}, event.Discard)

	if err := a.Run(context.Background(), "create a concise plan"); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if a.deliveryProfile || a.deliveryTaskExpected || a.deliveryMutationExpected {
		t.Fatalf("tool-free agent retained a delivery requirement: profile=%v task=%v mutation=%v", a.deliveryProfile, a.deliveryTaskExpected, a.deliveryMutationExpected)
	}
	if got := prov.CallCount(); got != 1 {
		t.Fatalf("provider calls = %d, want 1", got)
	}
}

func TestAgentToolCallingDisabledDoesNotRequireCalculationTool(t *testing.T) {
	disabled := false
	prov := testutil.NewMock("tool-free", testutil.Turn{Text: "4"})
	a := New(prov, calculationGateRegistry(), NewSession("system"), Options{ToolCalling: &disabled}, event.Discard)

	if err := a.Run(context.Background(), "calculate 2 + 2"); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if got := prov.CallCount(); got != 1 {
		t.Fatalf("provider calls = %d, want 1", got)
	}
}
