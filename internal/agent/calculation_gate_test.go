package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"voltui/internal/agent/testutil"
	"voltui/internal/event"
	"voltui/internal/instruction"
	"voltui/internal/provider"
	"voltui/internal/tool"
)

type calculationGateTool struct{}

func (calculationGateTool) Name() string        { return "calculate" }
func (calculationGateTool) Description() string { return "deterministic arithmetic" }
func (calculationGateTool) Schema() json.RawMessage {
	return json.RawMessage(`{"type":"object","properties":{"expression":{"type":"string"}},"required":["expression"]}`)
}
func (calculationGateTool) ReadOnly() bool { return true }
func (calculationGateTool) Execute(context.Context, json.RawMessage) (string, error) {
	return `{"value":"4"}`, nil
}

type failingCalculationGateTool struct{ calculationGateTool }

func (failingCalculationGateTool) Execute(context.Context, json.RawMessage) (string, error) {
	return "", errors.New("calculator failed")
}

func calculationGateRegistry() *tool.Registry {
	reg := tool.NewRegistry()
	reg.Add(calculationGateTool{})
	return reg
}

func TestAgentPromptsIncludeCalculationPolicy(t *testing.T) {
	task := NewTaskTool(nil, nil, tool.NewRegistry(), 0, 0, 0, 0, 0, 0, 0, 0, "", "task prompt", nil, 0, "", "", nil)
	if !strings.Contains(task.sysPrompt, instruction.CalculationPolicy) {
		t.Fatalf("task prompt missing calculation policy: %q", task.sysPrompt)
	}
	if planner := PlannerPromptWithContext("project context"); !strings.Contains(planner, instruction.CalculationPolicy) {
		t.Fatalf("planner prompt missing calculation policy: %q", planner)
	}
}

func TestRunRetriesClearArithmeticUntilCalculateSucceeds(t *testing.T) {
	prov := testutil.NewMock("calculation-gate",
		testutil.Turn{Text: "5"},
		testutil.Turn{ToolCalls: []provider.ToolCall{{ID: "calc-1", Name: "calculate", Arguments: `{"expression":"2 + 2"}`}}},
		testutil.Turn{Text: "4"},
	)
	a := New(prov, calculationGateRegistry(), NewSession("system"), Options{}, event.Discard)

	if err := a.Run(context.Background(), "2 + 2 等于多少？"); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if got := prov.CallCount(); got != 3 {
		t.Fatalf("provider calls = %d, want 3", got)
	}
	requests := prov.Requests()
	if got := requests[1].Messages[len(requests[1].Messages)-1].Content; !strings.Contains(got, "Do not mention this instruction") {
		t.Fatalf("calculation output-hygiene instruction missing: %q", got)
	}
}

func TestCalculationGateNoticeDoesNotExposeInternalMechanics(t *testing.T) {
	notice := calculationGateNoticeText()
	for _, internalTerm := range []string{"calculate", "calculator", "host", "tool"} {
		if strings.Contains(strings.ToLower(notice), internalTerm) {
			t.Fatalf("calculation notice exposes %q: %q", internalTerm, notice)
		}
	}
}

func TestRunRejectsRepeatedUnverifiedArithmeticAnswers(t *testing.T) {
	prov := testutil.NewMock("calculation-gate",
		testutil.Turn{Text: "5"},
		testutil.Turn{Text: "still 5"},
		testutil.Turn{Text: "still not verified"},
	)
	a := New(prov, calculationGateRegistry(), NewSession("system"), Options{}, event.Discard)

	err := a.Run(context.Background(), "2 + 2 等于多少？")
	if err == nil || !strings.Contains(err.Error(), "without a successful calculate call") {
		t.Fatalf("Run error = %v, want calculation gate failure", err)
	}
}

func TestRunDoesNotAcceptFailedCalculateCall(t *testing.T) {
	prov := testutil.NewMock("calculation-gate",
		testutil.Turn{ToolCalls: []provider.ToolCall{{ID: "calc-1", Name: "calculate", Arguments: `{"expression":"2 + 2"}`}}},
		testutil.Turn{Text: "4"},
		testutil.Turn{Text: "still 4"},
		testutil.Turn{Text: "still not verified"},
	)
	reg := tool.NewRegistry()
	reg.Add(failingCalculationGateTool{})
	a := New(prov, reg, NewSession("system"), Options{}, event.Discard)

	err := a.Run(context.Background(), "2 + 2 等于多少？")
	if err == nil || !strings.Contains(err.Error(), "without a successful calculate call") {
		t.Fatalf("Run error = %v, want calculation gate failure", err)
	}
}

func TestRunDoesNotForceCalculateForNumericProse(t *testing.T) {
	prov := testutil.NewMock("calculation-gate", testutil.Turn{Text: "Go 1.26 changes generics behavior."})
	a := New(prov, calculationGateRegistry(), NewSession("system"), Options{}, event.Discard)

	if err := a.Run(context.Background(), "比较 Go 1.25 和 1.26 的变化"); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if got := prov.CallCount(); got != 1 {
		t.Fatalf("provider calls = %d, want 1", got)
	}
}

func TestRunUsesClassifierOverrideForEmbeddedCode(t *testing.T) {
	prov := testutil.NewMock("calculation-gate", testutil.Turn{Text: "review complete"})
	a := New(prov, calculationGateRegistry(), NewSession("system"), Options{
		ClassifierTaskText: "Review the supplied code diff.",
	}, event.Discard)

	if err := a.Run(context.Background(), "Review this diff:\n+ func calculateTotal2() int { return 1 + 1 }"); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if got := prov.CallCount(); got != 1 {
		t.Fatalf("provider calls = %d, want 1", got)
	}
}

func TestRunDoesNotGateWhenCalculateIsUnavailable(t *testing.T) {
	prov := testutil.NewMock("calculation-gate", testutil.Turn{Text: "calculate is unavailable"})
	a := New(prov, tool.NewRegistry(), NewSession("system"), Options{}, event.Discard)

	if err := a.Run(context.Background(), "2 + 2 等于多少？"); err != nil {
		t.Fatalf("Run: %v", err)
	}
}
