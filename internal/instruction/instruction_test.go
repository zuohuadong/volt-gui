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
		{name: "office plan with budget", input: "起草项目执行计划，预算总额 30 万元，列出负责人和时间表", want: false},
		{name: "office report with percentages", input: "撰写季度汇报，收入增长 12%，预算合计 80 万元", want: false},
		{name: "office report explicitly requests calculation", input: "起草预算报告，并计算 12 万元加 8 万元的总额", want: true},
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

func TestIsDocumentCompositionRequest(t *testing.T) {
	if !IsDocumentCompositionRequest("请起草一份项目延期汇报") {
		t.Fatal("explicit document request was not detected")
	}
	if IsDocumentCompositionRequest("修复报告生成器中的空指针") {
		t.Fatal("code task mentioning a report was misclassified as document composition")
	}
	if IsDocumentCompositionRequest("起草代码修复方案并补充测试") {
		t.Fatal("explicit code task was misclassified as office document composition")
	}
	if !IsDocumentCompositionRequest("请修改以上周报，负责人改为李明") {
		t.Fatal("explicit document follow-up was not detected")
	}
	if !IsDocumentRevisionRequest("请修改以上周报，负责人改为李明") || IsDocumentRevisionRequest("请起草一份新周报") {
		t.Fatal("document revision request was not distinguished from new composition")
	}
}
