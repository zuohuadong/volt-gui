package calculation

import (
	"strings"
	"testing"
)

func intPtr(v int) *int { return &v }

func TestEvaluateUsesExactDecimalArithmetic(t *testing.T) {
	got, err := Evaluate(Request{
		Expression: "19.90 * 3",
		Mode:       ModeFinance,
		Scale:      intPtr(2),
		Rounding:   RoundHalfUp,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Value != "59.70" {
		t.Fatalf("Value = %q, want 59.70", got.Value)
	}
	if got.Exact != "597/10" {
		t.Fatalf("Exact = %q, want 597/10", got.Exact)
	}
	if got.Rounded {
		t.Fatal("an exactly representable amount must not be marked rounded")
	}
}

func TestEvaluateSupportsPercentageLiterals(t *testing.T) {
	got, err := Evaluate(Request{
		Expression: "100 * (1 + 6%)",
		Mode:       ModeFinance,
		Scale:      intPtr(2),
		Rounding:   RoundHalfUp,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Value != "106.00" {
		t.Fatalf("Value = %q, want 106.00", got.Value)
	}
}

func TestEvaluateRoundsFinancialResultsExplicitly(t *testing.T) {
	tests := []struct {
		name     string
		expr     string
		rounding Rounding
		want     string
	}{
		{name: "half up positive tie", expr: "1.005", rounding: RoundHalfUp, want: "1.01"},
		{name: "half up negative tie", expr: "-1.005", rounding: RoundHalfUp, want: "-1.01"},
		{name: "half even lower", expr: "2.345", rounding: RoundHalfEven, want: "2.34"},
		{name: "half even upper", expr: "2.355", rounding: RoundHalfEven, want: "2.36"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := Evaluate(Request{
				Expression: tt.expr,
				Mode:       ModeFinance,
				Scale:      intPtr(2),
				Rounding:   tt.rounding,
			})
			if err != nil {
				t.Fatal(err)
			}
			if got.Value != tt.want {
				t.Fatalf("Value = %q, want %s", got.Value, tt.want)
			}
			if !got.Rounded {
				t.Fatal("tie rounding must be reported")
			}
		})
	}
}

func TestEvaluateGeneralDivisionReturnsExactFraction(t *testing.T) {
	got, err := Evaluate(Request{
		Expression: "1 / 3",
		Mode:       ModeGeneral,
		Scale:      intPtr(6),
		Rounding:   RoundHalfEven,
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Value != "0.333333" || got.Exact != "1/3" || !got.Rounded {
		t.Fatalf("unexpected result: %+v", got)
	}
}

func TestEvaluateDirectionalRoundingUsesMagnitudeSemantics(t *testing.T) {
	tests := []struct {
		rounding Rounding
		want     string
	}{
		{rounding: RoundDown, want: "-1.23"},
		{rounding: RoundUp, want: "-1.24"},
	}
	for _, tt := range tests {
		got, err := Evaluate(Request{
			Expression: "-1.231",
			Mode:       ModeFinance,
			Scale:      intPtr(2),
			Rounding:   tt.rounding,
		})
		if err != nil {
			t.Fatal(err)
		}
		if got.Value != tt.want {
			t.Fatalf("%s Value = %q, want %s", tt.rounding, got.Value, tt.want)
		}
	}
}

func TestEvaluateHalfEvenHandlesNegativeAndWholeNumberTies(t *testing.T) {
	tests := []struct {
		expr  string
		scale int
		want  string
	}{
		{expr: "-2.345", scale: 2, want: "-2.34"},
		{expr: "-2.355", scale: 2, want: "-2.36"},
		{expr: "2.5", scale: 0, want: "2"},
		{expr: "3.5", scale: 0, want: "4"},
		{expr: "-2.5", scale: 0, want: "-2"},
		{expr: "-3.5", scale: 0, want: "-4"},
	}
	for _, tt := range tests {
		got, err := Evaluate(Request{Expression: tt.expr, Mode: ModeFinance, Scale: intPtr(tt.scale), Rounding: RoundHalfEven})
		if err != nil {
			t.Fatal(err)
		}
		if got.Value != tt.want {
			t.Fatalf("%s scale %d = %q, want %s", tt.expr, tt.scale, got.Value, tt.want)
		}
	}
}

func TestEvaluateEnforcesParserResourceBoundaries(t *testing.T) {
	validOps := strings.Repeat("1+", maxOperations) + "1"
	if _, err := Evaluate(Request{Expression: validOps}); err != nil {
		t.Fatalf("max operations should pass: %v", err)
	}
	if _, err := Evaluate(Request{Expression: validOps + "+1"}); err == nil {
		t.Fatal("operations above maximum should fail")
	}

	validNesting := strings.Repeat("(", maxNesting) + "1" + strings.Repeat(")", maxNesting)
	if _, err := Evaluate(Request{Expression: validNesting}); err != nil {
		t.Fatalf("max nesting should pass: %v", err)
	}
	tooDeep := "(" + validNesting + ")"
	if _, err := Evaluate(Request{Expression: tooDeep}); err == nil {
		t.Fatal("nesting above maximum should fail")
	}

	validLiteral := strings.Repeat("9", maxLiteralBytes)
	if _, err := Evaluate(Request{Expression: validLiteral}); err != nil {
		t.Fatalf("max literal should pass: %v", err)
	}
	if _, err := Evaluate(Request{Expression: validLiteral + "9"}); err == nil {
		t.Fatal("literal above maximum should fail")
	}

	validExpression := "1" + strings.Repeat(" ", maxExpressionBytes-3) + "+1"
	if len(validExpression) != maxExpressionBytes {
		t.Fatalf("test expression length = %d", len(validExpression))
	}
	if _, err := Evaluate(Request{Expression: validExpression}); err != nil {
		t.Fatalf("max expression should pass: %v", err)
	}
	tooLongExpression := "1" + strings.Repeat(" ", maxExpressionBytes-2) + "+1"
	if _, err := Evaluate(Request{Expression: tooLongExpression}); err == nil {
		t.Fatal("expression above maximum should fail")
	}
}

func TestEvaluateFinanceRequiresExplicitPrecisionRules(t *testing.T) {
	_, err := Evaluate(Request{Expression: "1 + 2", Mode: ModeFinance})
	if err == nil {
		t.Fatal("finance calculation without scale and rounding must fail")
	}
}

func TestEvaluateRejectsInvalidOrUnsafeExpressions(t *testing.T) {
	tests := []string{
		"1 / 0",
		"sqrt(4)",
		"1 + unknown",
		"1; panic()",
	}
	for _, expr := range tests {
		t.Run(expr, func(t *testing.T) {
			_, err := Evaluate(Request{Expression: expr, Mode: ModeGeneral})
			if err == nil {
				t.Fatalf("Evaluate(%q) succeeded, want error", expr)
			}
		})
	}
}
