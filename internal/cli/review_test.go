package cli

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"voltui/internal/config"
	"voltui/internal/instruction"
	"voltui/internal/skill"
)

func TestReviewSystemPromptIncludesCalculationPolicy(t *testing.T) {
	got := reviewSystemPrompt("review instructions")
	if !strings.Contains(got, "review instructions") || !strings.Contains(got, instruction.CalculationPolicy) {
		t.Fatalf("review system prompt missing required content: %q", got)
	}
}

func TestBuildReviewTask(t *testing.T) {
	// Small diff.
	diff := "diff --git a/foo.go b/foo.go\n+added line"
	got := buildReviewTask(diff, "")
	if !strings.Contains(got, "Review the following changes.") {
		t.Error("missing review prompt prefix")
	}
	if !strings.Contains(got, diff) {
		t.Errorf("diff content missing:\n%s", got)
	}

	// With extra instructions.
	got = buildReviewTask(diff, "focus on error handling")
	if !strings.Contains(got, "focus on error handling") {
		t.Error("extra instructions missing")
	}
	if !strings.Contains(got, "The diff is:") {
		t.Error("missing diff separator")
	}

	// Truncation.
	hugeDiff := strings.Repeat("x", 20000)
	got = buildReviewTask(hugeDiff, "")
	if !strings.Contains(got, "truncated at 16000") {
		t.Error("large diff should be truncated")
	}
	if len(got) > 16500 {
		t.Errorf("truncated output too long: %d", len(got))
	}
}

func TestBuildReviewSubagentRegistryUsesForegroundOnlyBash(t *testing.T) {
	reg := buildReviewSubagentRegistry(skill.Skill{AllowedTools: []string{
		"bash",
		"wait",
		"bash_output",
		"kill_shell",
		"task",
	}})

	for _, hidden := range []string{"wait", "bash_output", "kill_shell", "task"} {
		if _, ok := reg.Get(hidden); ok {
			t.Fatalf("review subagent registry should hide %q; got %v", hidden, reg.Names())
		}
	}
	bash, ok := reg.Get("bash")
	if !ok {
		t.Fatalf("review subagent registry should keep bash; got %v", reg.Names())
	}
	if strings.Contains(string(bash.Schema()), "run_in_background") {
		t.Fatalf("review subagent bash schema should not include run_in_background: %s", bash.Schema())
	}
	if _, err := bash.Execute(context.Background(), json.RawMessage(`{"command":"sleep 1","run_in_background":true}`)); err == nil || !strings.Contains(err.Error(), "background bash is unavailable in subagents") {
		t.Fatalf("review subagent background bash should return a clear error, got %v", err)
	}
}

func TestBuildReviewSubagentRegistryIncludesCalculateUnlessExplicitlyDisabled(t *testing.T) {
	sk := skill.Skill{ReadOnly: true, AllowedTools: []string{"calculate", "knowledge_search", "read_file"}}
	if _, ok := buildReviewSubagentRegistry(sk, config.Default()).Get("calculate"); !ok {
		t.Fatal("default review registry must include calculate")
	}
	if knowledgeSearch, ok := buildReviewSubagentRegistry(sk, config.Default()).Get("knowledge_search"); !ok || !knowledgeSearch.ReadOnly() {
		t.Fatal("default review registry must include read-only knowledge_search")
	}
	cfg := config.Default()
	cfg.Tools.Enabled = []string{"read_file"}
	if _, ok := buildReviewSubagentRegistry(sk, cfg).Get("calculate"); ok {
		t.Fatal("explicit tools.enabled allowlist must be able to exclude calculate")
	}
	if _, ok := buildReviewSubagentRegistry(sk, cfg).Get("knowledge_search"); ok {
		t.Fatal("explicit tools.enabled allowlist must be able to exclude knowledge_search")
	}
}

// TestBuildReviewSubagentRegistryEnforcesReadOnlySkill pins the CLI path of the
// review read-only contract: `voltui review` runs the same builtin skill as
// the in-session review tool, so its bash must enforce the plan-mode safe
// policy instead of trusting the prompt's "stay read-only" promise.
func TestBuildReviewSubagentRegistryEnforcesReadOnlySkill(t *testing.T) {
	reg := buildReviewSubagentRegistry(skill.Skill{
		ReadOnly:     true,
		AllowedTools: []string{"bash", "read_file", "task"},
	}, config.Default())

	if _, ok := reg.Get("task"); ok {
		t.Fatalf("read-only review registry should hide task; got %v", reg.Names())
	}
	bash, ok := reg.Get("bash")
	if !ok {
		t.Fatalf("read-only review registry should keep bash; got %v", reg.Names())
	}
	if !bash.ReadOnly() {
		t.Fatal("read-only review bash wrapper must report ReadOnly")
	}
	out, err := bash.Execute(context.Background(), json.RawMessage(`{"command":"rm -rf tmp"}`))
	if err != nil || !strings.HasPrefix(out, "blocked:") {
		t.Fatalf("write-capable command should be blocked as tool output, got %q, %v", out, err)
	}
}
