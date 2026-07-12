package builtin

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"voltui/internal/tool"
)

func TestCalculateBuiltinRegistrationAndPolicy(t *testing.T) {
	registered, ok := tool.LookupBuiltin("calculate")
	if !ok {
		t.Fatal("calculate built-in is not registered")
	}
	if !registered.ReadOnly() {
		t.Fatal("calculate must be read-only")
	}
	classifier, ok := registered.(tool.PlanModeClassifier)
	if !ok || !classifier.PlanModeSafe() {
		t.Fatal("calculate must explicitly opt into plan mode")
	}
	description := registered.Description()
	for _, want := range []string{"MUST", "numeric result", "financial"} {
		if !strings.Contains(description, want) {
			t.Fatalf("description = %q, want policy term %q", description, want)
		}
	}
}

func TestCalculateReturnsStructuredExactResult(t *testing.T) {
	out, err := (calculate{}).Execute(context.Background(), json.RawMessage(`{
		"expression":"19.90 * 3",
		"mode":"finance",
		"scale":2,
		"rounding":"half_up",
		"currency":"CNY"
	}`))
	if err != nil {
		t.Fatal(err)
	}
	var got struct {
		Value    string `json:"value"`
		Exact    string `json:"exact"`
		Currency string `json:"currency"`
		Rounded  bool   `json:"rounded"`
	}
	if err := json.Unmarshal([]byte(out), &got); err != nil {
		t.Fatalf("tool output is not JSON: %v\n%s", err, out)
	}
	if got.Value != "59.70" || got.Exact != "597/10" || got.Currency != "CNY" || got.Rounded {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestCalculateFinanceRejectsImplicitRounding(t *testing.T) {
	_, err := (calculate{}).Execute(context.Background(), json.RawMessage(`{
		"expression":"10 / 3",
		"mode":"finance"
	}`))
	if err == nil {
		t.Fatal("finance mode without scale and rounding must fail")
	}
}

func TestCalculateRejectsUnknownArguments(t *testing.T) {
	_, err := (calculate{}).Execute(context.Background(), json.RawMessage(`{
		"expression":"1 + 2",
		"precision":2
	}`))
	if err == nil {
		t.Fatal("unknown arguments must not be silently ignored")
	}
}

func TestCalculateRejectsNullArguments(t *testing.T) {
	tests := []string{
		`{"expression":null}`,
		`{"expression":"1+2","mode":null}`,
		`{"expression":"1+2","scale":null}`,
		`{"expression":"1+2","rounding":null}`,
		`{"expression":"1+2","currency":null}`,
	}
	for _, args := range tests {
		if _, err := (calculate{}).Execute(context.Background(), json.RawMessage(args)); err == nil || !strings.Contains(err.Error(), "must not be null") {
			t.Fatalf("Execute(%s) error = %v, want null rejection", args, err)
		}
	}
}
