// Package calculation evaluates deterministic arithmetic without binary
// floating-point rounding or executing user-provided code.
package calculation

import (
	"fmt"
	"math/big"
	"strings"
	"unicode"
)

const (
	maxExpressionBytes = 4096
	maxOperations      = 512
	maxNesting         = 64
	maxLiteralBytes    = 256
	defaultScale       = 12
	maxScale           = 100
)

// Mode selects the validation and formatting contract for a calculation.
type Mode string

const (
	ModeGeneral Mode = "general"
	ModeFinance Mode = "finance"
)

// Rounding names the deterministic rule used when a result exceeds Scale.
type Rounding string

const (
	RoundHalfUp   Rounding = "half_up"
	RoundHalfEven Rounding = "half_even"
	RoundDown     Rounding = "down"
	RoundUp       Rounding = "up"
)

// Request describes one arithmetic calculation. Finance mode intentionally
// requires callers to choose Scale and Rounding instead of relying on defaults.
type Request struct {
	Expression string
	Mode       Mode
	Scale      *int
	Rounding   Rounding
	Currency   string
}

// Result contains both the displayed decimal and the exact reduced fraction.
type Result struct {
	Expression string   `json:"expression"`
	Value      string   `json:"value"`
	Exact      string   `json:"exact"`
	Mode       Mode     `json:"mode"`
	Scale      int      `json:"scale"`
	Rounding   Rounding `json:"rounding"`
	Rounded    bool     `json:"rounded"`
	Currency   string   `json:"currency,omitempty"`
}

// Evaluate parses and evaluates a deliberately small arithmetic language:
// decimal literals, +, -, *, /, parentheses, unary signs, and postfix percent.
func Evaluate(req Request) (Result, error) {
	expression := strings.TrimSpace(req.Expression)
	if expression == "" {
		return Result{}, fmt.Errorf("expression is required")
	}
	if len(expression) > maxExpressionBytes {
		return Result{}, fmt.Errorf("expression exceeds %d bytes", maxExpressionBytes)
	}
	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if len(currency) > 16 {
		return Result{}, fmt.Errorf("currency exceeds 16 bytes")
	}

	mode := req.Mode
	if mode == "" {
		mode = ModeGeneral
	}
	if mode != ModeGeneral && mode != ModeFinance {
		return Result{}, fmt.Errorf("unsupported mode %q", mode)
	}

	scale, rounding, err := precisionRules(req, mode)
	if err != nil {
		return Result{}, err
	}

	p := parser{input: expression}
	value, err := p.parse()
	if err != nil {
		return Result{}, err
	}
	display, rounded := formatDecimal(value, scale, rounding, mode == ModeFinance)

	return Result{
		Expression: expression,
		Value:      display,
		Exact:      value.RatString(),
		Mode:       mode,
		Scale:      scale,
		Rounding:   rounding,
		Rounded:    rounded,
		Currency:   currency,
	}, nil
}

func precisionRules(req Request, mode Mode) (int, Rounding, error) {
	if mode == ModeFinance && req.Scale == nil {
		return 0, "", fmt.Errorf("finance mode requires an explicit scale")
	}
	if mode == ModeFinance && req.Rounding == "" {
		return 0, "", fmt.Errorf("finance mode requires an explicit rounding rule")
	}

	scale := defaultScale
	if req.Scale != nil {
		scale = *req.Scale
	}
	if scale < 0 || scale > maxScale {
		return 0, "", fmt.Errorf("scale must be between 0 and %d", maxScale)
	}

	rounding := req.Rounding
	if rounding == "" {
		rounding = RoundHalfEven
	}
	switch rounding {
	case RoundHalfUp, RoundHalfEven, RoundDown, RoundUp:
		return scale, rounding, nil
	default:
		return 0, "", fmt.Errorf("unsupported rounding rule %q", rounding)
	}
}

func formatDecimal(value *big.Rat, scale int, rounding Rounding, fixed bool) (string, bool) {
	factor := new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(scale)), nil)
	absNumerator := new(big.Int).Abs(new(big.Int).Set(value.Num()))
	scaledNumerator := new(big.Int).Mul(absNumerator, factor)
	quotient, remainder := new(big.Int), new(big.Int)
	quotient.QuoRem(scaledNumerator, value.Denom(), remainder)
	rounded := remainder.Sign() != 0

	if shouldIncrement(quotient, remainder, value.Denom(), rounding) {
		quotient.Add(quotient, big.NewInt(1))
	}
	negative := value.Sign() < 0 && quotient.Sign() != 0
	digits := quotient.String()

	var out string
	if scale == 0 {
		out = digits
	} else if len(digits) <= scale {
		out = "0." + strings.Repeat("0", scale-len(digits)) + digits
	} else {
		point := len(digits) - scale
		out = digits[:point] + "." + digits[point:]
	}
	if !fixed && strings.Contains(out, ".") {
		out = strings.TrimRight(strings.TrimRight(out, "0"), ".")
	}
	if negative {
		out = "-" + out
	}
	return out, rounded
}

func shouldIncrement(quotient, remainder, denominator *big.Int, rounding Rounding) bool {
	if remainder.Sign() == 0 {
		return false
	}
	switch rounding {
	case RoundUp:
		return true
	case RoundDown:
		return false
	case RoundHalfUp, RoundHalfEven:
		twiceRemainder := new(big.Int).Lsh(new(big.Int).Set(remainder), 1)
		cmp := twiceRemainder.Cmp(denominator)
		if cmp > 0 {
			return true
		}
		if cmp < 0 {
			return false
		}
		return rounding == RoundHalfUp || quotient.Bit(0) == 1
	default:
		return false
	}
}

type parser struct {
	input      string
	pos        int
	operations int
	depth      int
}

func (p *parser) parse() (*big.Rat, error) {
	value, err := p.parseExpression()
	if err != nil {
		return nil, err
	}
	p.skipSpace()
	if p.pos != len(p.input) {
		return nil, fmt.Errorf("unexpected character %q at position %d", p.input[p.pos], p.pos+1)
	}
	return value, nil
}

func (p *parser) parseExpression() (*big.Rat, error) {
	left, err := p.parseTerm()
	if err != nil {
		return nil, err
	}
	for {
		op := p.peekOperator('+', '-')
		if op == 0 {
			return left, nil
		}
		if err := p.countOperation(); err != nil {
			return nil, err
		}
		p.pos++
		right, err := p.parseTerm()
		if err != nil {
			return nil, err
		}
		if op == '+' {
			left.Add(left, right)
		} else {
			left.Sub(left, right)
		}
	}
}

func (p *parser) parseTerm() (*big.Rat, error) {
	left, err := p.parseUnary()
	if err != nil {
		return nil, err
	}
	for {
		op := p.peekOperator('*', '/')
		if op == 0 {
			return left, nil
		}
		if err := p.countOperation(); err != nil {
			return nil, err
		}
		p.pos++
		right, err := p.parseUnary()
		if err != nil {
			return nil, err
		}
		if op == '*' {
			left.Mul(left, right)
			continue
		}
		if right.Sign() == 0 {
			return nil, fmt.Errorf("division by zero")
		}
		left.Quo(left, right)
	}
}

func (p *parser) parseUnary() (*big.Rat, error) {
	negative := false
	for {
		p.skipSpace()
		if p.pos >= len(p.input) || (p.input[p.pos] != '+' && p.input[p.pos] != '-') {
			break
		}
		if err := p.countOperation(); err != nil {
			return nil, err
		}
		if p.input[p.pos] == '-' {
			negative = !negative
		}
		p.pos++
	}
	value, err := p.parsePostfix()
	if err != nil {
		return nil, err
	}
	if negative {
		value.Neg(value)
	}
	return value, nil
}

func (p *parser) parsePostfix() (*big.Rat, error) {
	value, err := p.parsePrimary()
	if err != nil {
		return nil, err
	}
	for {
		p.skipSpace()
		if p.pos >= len(p.input) || p.input[p.pos] != '%' {
			return value, nil
		}
		if err := p.countOperation(); err != nil {
			return nil, err
		}
		p.pos++
		value.Quo(value, big.NewRat(100, 1))
	}
}

func (p *parser) parsePrimary() (*big.Rat, error) {
	p.skipSpace()
	if p.pos >= len(p.input) {
		return nil, fmt.Errorf("expected a number or parenthesized expression")
	}
	if p.input[p.pos] == '(' {
		p.depth++
		if p.depth > maxNesting {
			return nil, fmt.Errorf("expression nesting exceeds %d levels", maxNesting)
		}
		p.pos++
		value, err := p.parseExpression()
		if err != nil {
			return nil, err
		}
		p.skipSpace()
		if p.pos >= len(p.input) || p.input[p.pos] != ')' {
			return nil, fmt.Errorf("missing closing parenthesis")
		}
		p.pos++
		p.depth--
		return value, nil
	}
	return p.parseNumber()
}

func (p *parser) parseNumber() (*big.Rat, error) {
	start := p.pos
	digits := 0
	for p.pos < len(p.input) && isASCIIDigit(p.input[p.pos]) {
		p.pos++
		digits++
	}
	if p.pos < len(p.input) && p.input[p.pos] == '.' {
		p.pos++
		for p.pos < len(p.input) && isASCIIDigit(p.input[p.pos]) {
			p.pos++
			digits++
		}
	}
	if digits == 0 {
		return nil, fmt.Errorf("expected a decimal number at position %d", start+1)
	}
	literal := p.input[start:p.pos]
	if len(literal) > maxLiteralBytes {
		return nil, fmt.Errorf("numeric literal exceeds %d bytes", maxLiteralBytes)
	}
	value, ok := new(big.Rat).SetString(literal)
	if !ok {
		return nil, fmt.Errorf("invalid decimal number %q", literal)
	}
	return value, nil
}

func (p *parser) peekOperator(a, b byte) byte {
	p.skipSpace()
	if p.pos >= len(p.input) {
		return 0
	}
	op := p.input[p.pos]
	if op == a || op == b {
		return op
	}
	return 0
}

func (p *parser) skipSpace() {
	for p.pos < len(p.input) && unicode.IsSpace(rune(p.input[p.pos])) {
		p.pos++
	}
}

func (p *parser) countOperation() error {
	p.operations++
	if p.operations > maxOperations {
		return fmt.Errorf("expression exceeds %d operations", maxOperations)
	}
	return nil
}

func isASCIIDigit(b byte) bool { return b >= '0' && b <= '9' }
