package builtin

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"

	"voltui/internal/calculation"
	"voltui/internal/tool"
)

func init() { tool.RegisterBuiltin(calculate{}) }

// calculate is deliberately expression-only: it evaluates arithmetic but never
// executes code, resolves identifiers, reads files, or performs network access.
type calculate struct{}

func (calculate) Name() string { return "calculate" }

func (calculate) Description() string {
	return "MUST use this tool whenever an answer depends on a computed numeric result, including arithmetic, percentages, ratios, totals, unit-related formulas, estimates that should be reproducible, and verification of model reasoning. For every financial, billing, tax, discount, interest, exchange-rate, allocation, or settlement calculation, use mode=finance and explicitly provide scale and rounding; never calculate those values mentally or with binary floating point. The expression language supports decimal numbers, +, -, *, /, parentheses, unary signs, and postfix % (6% means 0.06). Use the model for symbolic explanation or proof, then call this tool to verify any final numeric value."
}

func (calculate) Schema() json.RawMessage {
	return json.RawMessage(`{
"type":"object",
"properties":{
  "expression":{"type":"string","minLength":1,"maxLength":4096,"description":"Arithmetic expression using decimal literals, +, -, *, /, parentheses, unary signs, and postfix percent. Example: 100 * (1 + 6%)."},
  "mode":{"type":"string","enum":["general","finance"],"default":"general","description":"Use finance for any money, billing, tax, discount, interest, exchange-rate, allocation, or settlement calculation."},
  "scale":{"type":"integer","minimum":0,"maximum":100,"description":"Decimal places in the displayed result. Required in finance mode; optional in general mode (default 12)."},
  "rounding":{"type":"string","enum":["half_up","half_even","down","up"],"description":"Rounding rule. down rounds toward zero; up rounds away from zero. Required in finance mode; optional in general mode (default half_even)."},
  "currency":{"type":"string","maxLength":16,"description":"Optional ISO currency code, returned as uppercase result metadata."}
},
"required":["expression"],
"allOf":[{
  "if":{"properties":{"mode":{"const":"finance"}},"required":["mode"]},
  "then":{"required":["scale","rounding"]}
}],
"additionalProperties":false
}`)
}

func (calculate) ReadOnly() bool     { return true }
func (calculate) PlanModeSafe() bool { return true }

func (calculate) Execute(_ context.Context, args json.RawMessage) (string, error) {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(args, &raw); err != nil {
		return "", fmt.Errorf("invalid args: %w", err)
	}
	for name, value := range raw {
		if bytes.Equal(bytes.TrimSpace(value), []byte("null")) {
			return "", fmt.Errorf("invalid args: %s must not be null", name)
		}
	}
	var p struct {
		Expression string               `json:"expression"`
		Mode       calculation.Mode     `json:"mode"`
		Scale      *int                 `json:"scale"`
		Rounding   calculation.Rounding `json:"rounding"`
		Currency   string               `json:"currency"`
	}
	decoder := json.NewDecoder(bytes.NewReader(args))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&p); err != nil {
		return "", fmt.Errorf("invalid args: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return "", fmt.Errorf("invalid args: multiple JSON values")
		}
		return "", fmt.Errorf("invalid args: %w", err)
	}
	result, err := calculation.Evaluate(calculation.Request{
		Expression: p.Expression,
		Mode:       p.Mode,
		Scale:      p.Scale,
		Rounding:   p.Rounding,
		Currency:   p.Currency,
	})
	if err != nil {
		return "", err
	}
	out, err := json.Marshal(result)
	if err != nil {
		return "", fmt.Errorf("encode result: %w", err)
	}
	return string(out), nil
}
