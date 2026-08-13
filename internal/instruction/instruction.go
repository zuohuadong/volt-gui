package instruction

import (
	"context"
	"regexp"
	"strings"

	"voltui/internal/memory"
)

// CalculationPolicy keeps numeric answers reproducible across the main agent,
// planner, and sub-agent prompts. It is conditional because explicit tool
// allowlists may intentionally remove calculate from a specialized agent.
const CalculationPolicy = `Calculation policy: when the calculate tool is available, you MUST call it whenever an answer depends on a computed numeric result. This includes arithmetic, percentages, ratios, totals, formula evaluation, estimates that should be reproducible, and verification of numeric reasoning. For money, billing, tax, discounts, interest, exchange rates, allocation, or settlement, always use mode=finance with explicit scale and rounding; never rely on mental arithmetic or binary floating point. Symbolic explanation and proofs may be reasoned about normally, but verify every final numeric value with calculate. Keep the host check and tool execution internal: the final answer must contain only the requested result and any user-relevant formula, unit, or rounding note, without mentioning calculate, tool verification, host gates, or internal checks. If calculate is unavailable, do not invent a precision-sensitive result; state the limitation or hand the calculation to an agent that has the tool.`

var (
	directCalculationPattern = regexp.MustCompile(`^[[:space:][:digit:].,()+*/%×÷％-]+[=?？。！![:space:]]*$`)
	numericDatePattern       = regexp.MustCompile(`^[[:space:]]*[[:digit:]]{4}[-/][[:digit:]]{1,2}[-/][[:digit:]]{1,2}[?？。！![:space:]]*$`)
	numericDateInTextPattern = regexp.MustCompile(`[[:digit:]]{4}[-/][[:digit:]]{1,2}[-/][[:digit:]]{1,2}`)
)

var calculationRequestTerms = []string{
	"计算", "算一下", "算出", "求值", "等于多少", "是多少", "多少钱", "合计", "总计", "总额", "总和", "百分比", "占比", "比例", "税额", "折扣", "利息", "汇率", "分摊",
	"calculate", "compute", "what is", "how much", "total", "sum", "percentage", "ratio", "tax", "discount", "interest", "exchange rate",
}

var calculationCueTerms = []string{
	"+", "-", "*", "/", "%", "×", "÷", "％", "加", "减", "乘", "除", "一半", "翻倍", "倍", "次方", "平方", "立方", "平均", "均值", "百分", "比例", "占比", "税", "折扣", "利息", "利率", "汇率", "分摊", "总价", "总额", "总和", "合计", "总计", "元", "金额",
	"plus", "minus", "times", "divided", "half", "double", "average", "percent", "ratio", "tax", "discount", "interest", "exchange rate", "total", "sum",
}

var dateQuestionTerms = []string{"日期", "星期", "周几", "几号", "date", "day of week"}

var documentCompositionTerms = []string{
	"起草", "撰写", "编写", "草拟", "拟定", "写一份", "生成一份", "制定一份", "整理成", "输出一份",
	"draft", "write a report", "write a plan", "compose", "prepare a report",
}

var documentRevisionTerms = []string{
	"润色", "改写", "续写", "修改这份", "修改以上", "调整这份", "调整以上",
	"rewrite", "revise this", "edit this report",
}

var explicitCalculationTerms = []string{
	"计算", "算一下", "算出", "求值", "核算", "校验金额", "校验预算", "calculate", "compute", "work out", "verify the total",
}

var codeTaskTerms = []string{
	"代码", "源码", "函数", "接口", "组件", "单元测试", "仓库", "脚本", "bug", "code", "function", "component", "repository", "shell", "python", "golang", "javascript", "typescript", "sql",
}

// WithCalculationPolicy appends the standing policy without duplicating it on
// prompts that pass through more than one construction layer.
func WithCalculationPolicy(prompt string) string {
	prompt = strings.TrimSpace(prompt)
	if strings.Contains(prompt, CalculationPolicy) {
		return prompt
	}
	if prompt == "" {
		return CalculationPolicy
	}
	return prompt + "\n\n" + CalculationPolicy
}

// ClearlyRequiresCalculation identifies explicit arithmetic requests for the
// host-side final-answer gate. Ambiguous numeric prose stays under prompt policy
// instead of forcing a calculator call for dates, versions, or line numbers.
func ClearlyRequiresCalculation(input string) bool {
	normalized := strings.ToLower(strings.TrimSpace(input))
	if normalized == "" || !containsASCIIDigit(normalized) {
		return false
	}
	if directCalculationPattern.MatchString(normalized) {
		return !numericDatePattern.MatchString(normalized) && containsCalculationOperator(normalized)
	}
	if numericDateInTextPattern.MatchString(normalized) && containsAnyTerm(normalized, dateQuestionTerms) {
		return false
	}
	if containsDocumentTerm(normalized) && !containsAnyTerm(normalized, explicitCalculationTerms) {
		return false
	}
	return containsAnyTerm(normalized, calculationRequestTerms) && containsAnyTerm(normalized, calculationCueTerms)
}

// IsDocumentCompositionRequest reports explicit prose-document creation tasks.
// It deliberately excludes generic mentions of reports or plans so diagnostics
// about document code keep the full agent protocol.
func IsDocumentCompositionRequest(input string) bool {
	normalized := strings.ToLower(strings.TrimSpace(input))
	return containsDocumentTerm(normalized) && !containsAnyTerm(normalized, codeTaskTerms)
}

// IsDocumentRevisionRequest reports follow-ups that need the latest completed
// document as source context rather than an isolated new-document request.
func IsDocumentRevisionRequest(input string) bool {
	normalized := strings.ToLower(strings.TrimSpace(input))
	return containsAnyTerm(normalized, documentRevisionTerms) && !containsAnyTerm(normalized, codeTaskTerms)
}

func containsDocumentTerm(normalized string) bool {
	return containsAnyTerm(normalized, documentCompositionTerms) || containsAnyTerm(normalized, documentRevisionTerms)
}

func containsASCIIDigit(s string) bool {
	return strings.IndexFunc(s, func(r rune) bool { return r >= '0' && r <= '9' }) >= 0
}

func containsCalculationOperator(s string) bool {
	if strings.ContainsAny(s, "+*/%×÷％") {
		return true
	}
	return strings.Contains(s, "-") && !numericDatePattern.MatchString(s)
}

func containsAnyTerm(s string, terms []string) bool {
	for _, term := range terms {
		if strings.Contains(s, term) {
			return true
		}
	}
	return false
}

// VerifyCheck is a host-observable project check extracted from structured
// project memory. It is runtime-only and is not serialized into prompts.
type VerifyCheck struct {
	Command    string
	SourcePath string
	Line       int
}

type contextKey struct{}

func WithChecks(ctx context.Context, checks []VerifyCheck) context.Context {
	if len(checks) == 0 {
		return ctx
	}
	cp := append([]VerifyCheck(nil), checks...)
	return context.WithValue(ctx, contextKey{}, cp)
}

func FromContext(ctx context.Context) []VerifyCheck {
	checks, ok := ctx.Value(contextKey{}).([]VerifyCheck)
	if !ok || len(checks) == 0 {
		return nil
	}
	return append([]VerifyCheck(nil), checks...)
}

// ExtractHostChecks reads only the structured "VoltUI host checks" section.
// Ordinary project instructions remain guidance and do not become hard gates.
func ExtractHostChecks(docs []memory.Source) []VerifyCheck {
	seen := map[string]bool{}
	var checks []VerifyCheck
	for _, doc := range docs {
		inSection := false
		for i, raw := range strings.Split(doc.Body, "\n") {
			line := strings.TrimRight(raw, "\r")
			if heading, ok := markdownHeading(line); ok {
				inSection = isHostChecksHeading(heading)
				continue
			}
			if !inSection {
				continue
			}
			command, ok := verifyBullet(line)
			if !ok || seen[command] {
				continue
			}
			seen[command] = true
			checks = append(checks, VerifyCheck{
				Command:    command,
				SourcePath: doc.Path,
				Line:       i + 1,
			})
		}
	}
	return checks
}

func isHostChecksHeading(heading string) bool {
	switch strings.ToLower(strings.TrimSpace(heading)) {
	case "reasonix host checks", "voltui host checks":
		return true
	default:
		return false
	}
}

func markdownHeading(line string) (string, bool) {
	line = strings.TrimSpace(line)
	if !strings.HasPrefix(line, "#") {
		return "", false
	}
	i := 0
	for i < len(line) && line[i] == '#' {
		i++
	}
	if i == 0 || i >= len(line) || line[i] != ' ' {
		return "", false
	}
	heading := strings.TrimSpace(line[i+1:])
	heading = strings.TrimSpace(strings.TrimRight(heading, "#"))
	return heading, heading != ""
}

func verifyBullet(line string) (string, bool) {
	line = strings.TrimSpace(line)
	if len(line) < 2 || (line[:2] != "- " && line[:2] != "* ") {
		return "", false
	}
	body := strings.TrimSpace(line[2:])
	const prefix = "verify:"
	if len(body) < len(prefix) || !strings.EqualFold(body[:len(prefix)], prefix) {
		return "", false
	}
	command := strings.TrimSpace(body[len(prefix):])
	return command, command != ""
}
