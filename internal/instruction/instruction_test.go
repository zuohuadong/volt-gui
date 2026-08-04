package instruction

import (
	"strings"
	"testing"

	"voltui/internal/memory"
)

func TestExtractHostChecksFromStructuredSection(t *testing.T) {
	docs := []memory.Source{{
		Path:  "AGENTS.md",
		Scope: memory.ScopeProject,
		Body: strings.Join([]string{
			"# Project rules",
			"## VoltUI host checks",
			"- verify: go test ./internal/...",
			"* verify: git diff --check",
			"- verify: go test ./internal/...",
			"- note: ignored",
			"## Other",
			"- verify: ignored after section",
		}, "\n"),
	}}

	checks := ExtractHostChecks(docs)
	if len(checks) != 2 {
		t.Fatalf("checks len = %d, want 2: %#v", len(checks), checks)
	}
	if checks[0].Command != "go test ./internal/..." || checks[0].SourcePath != "AGENTS.md" || checks[0].Line != 3 {
		t.Fatalf("first check = %#v", checks[0])
	}
	if checks[1].Command != "git diff --check" || checks[1].SourcePath != "AGENTS.md" || checks[1].Line != 4 {
		t.Fatalf("second check = %#v", checks[1])
	}
}

func TestExtractHostChecksIgnoresOrdinaryGuidance(t *testing.T) {
	docs := []memory.Source{{
		Path: "REASONIX.md",
		Body: "Always run go test before committing.\n\n- verify: go test ./...",
	}}

	if checks := ExtractHostChecks(docs); len(checks) != 0 {
		t.Fatalf("ordinary guidance should not create hard checks: %#v", checks)
	}
}

func TestExtractHostChecksIsCaseInsensitive(t *testing.T) {
	docs := []memory.Source{{
		Path: "REASONIX.md",
		Body: "## reasonix HOST checks\n- verify: go test ./...",
	}}

	checks := ExtractHostChecks(docs)
	if len(checks) != 1 || checks[0].Command != "go test ./..." {
		t.Fatalf("case-insensitive heading not extracted: %#v", checks)
	}
}

func TestWithCalculationPolicyAppendsPolicyOnce(t *testing.T) {
	got := WithCalculationPolicy("BASE")
	if !strings.HasPrefix(got, "BASE\n\n") || !strings.Contains(got, CalculationPolicy) {
		t.Fatalf("calculation policy was not appended: %q", got)
	}
	if twice := WithCalculationPolicy(got); twice != got {
		t.Fatalf("calculation policy appended twice:\n%s", twice)
	}
}

func TestClearlyRequiresCalculation(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{name: "direct expression", input: "123 * 456 = ?", want: true},
		{name: "Chinese subtraction", input: "10减3等于多少？", want: true},
		{name: "money total", input: "19.90 元买 3 个一共多少钱？", want: true},
		{name: "percentage", input: "What is 12.5% of 80?", want: true},
		{name: "finance", input: "按 13% 税率计算 599 元含税金额", want: true},
		{name: "date literal", input: "2026-08-04", want: false},
		{name: "slash date literal", input: "2026/08/04?", want: false},
		{name: "date question", input: "2026-08-04 是星期几？", want: false},
		{name: "version comparison", input: "比较 Go 1.25 和 1.26 的变化", want: false},
		{name: "line number", input: "读取第 10 行", want: false},
		{name: "calculator code", input: "calculate 工具代码在哪里？", want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := ClearlyRequiresCalculation(tt.input); got != tt.want {
				t.Fatalf("ClearlyRequiresCalculation(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}
