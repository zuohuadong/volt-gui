package agent

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"reasonix/internal/agent/testutil"
	"reasonix/internal/event"
	"reasonix/internal/memorycompiler"
)

// readCompilerStrategies decodes the persisted Memory v5 strategy counters so
// the test can observe learning-side effects without exporting runtime state.
func readCompilerStrategies(t *testing.T, dir string) []memorycompiler.Strategy {
	t.Helper()
	b, err := os.ReadFile(filepath.Join(dir, "state.json"))
	if err != nil {
		t.Fatalf("read state: %v", err)
	}
	var st struct {
		Strategies []memorycompiler.Strategy `json:"strategies"`
	}
	if err := json.Unmarshal(b, &st); err != nil {
		t.Fatalf("unmarshal state: %v", err)
	}
	return st.Strategies
}

func TestCorrectiveFollowUpRevisesPreviousOutcome(t *testing.T) {
	dir := t.TempDir()
	rt := memorycompiler.New(dir)
	mp := testutil.NewMock("m", testutil.Turn{Text: "done"}, testutil.Turn{Text: "sorry"})
	a := New(mp, echoRegistry(), NewSession(""), Options{MemoryCompiler: rt}, event.Discard)

	if err := a.Run(context.Background(), "fix a bug in the parser"); err != nil {
		t.Fatalf("turn 1: %v", err)
	}
	for _, s := range readCompilerStrategies(t, dir) {
		if s.ID == "bugfix-reproduce-first" && (s.Successes != 1 || s.Failures != 0) {
			t.Fatalf("turn 1 not recorded as success: %+v", s)
		}
	}

	if err := a.Run(context.Background(), "不对，还是报错"); err != nil {
		t.Fatalf("turn 2: %v", err)
	}
	for _, s := range readCompilerStrategies(t, dir) {
		if s.ID != "bugfix-reproduce-first" {
			continue
		}
		if s.Successes != 0 || s.Failures < 1 {
			t.Fatalf("corrective follow-up did not revise turn 1 outcome: %+v", s)
		}
		return
	}
	t.Fatal("bugfix strategy missing from state")
}

func TestNeutralFollowUpDoesNotReviseOutcome(t *testing.T) {
	dir := t.TempDir()
	rt := memorycompiler.New(dir)
	mp := testutil.NewMock("m", testutil.Turn{Text: "done"}, testutil.Turn{Text: "done again"})
	a := New(mp, echoRegistry(), NewSession(""), Options{MemoryCompiler: rt}, event.Discard)

	if err := a.Run(context.Background(), "fix a bug in the parser"); err != nil {
		t.Fatalf("turn 1: %v", err)
	}
	if err := a.Run(context.Background(), "fix another bug in the lexer"); err != nil {
		t.Fatalf("turn 2: %v", err)
	}
	for _, s := range readCompilerStrategies(t, dir) {
		if s.ID != "bugfix-reproduce-first" {
			continue
		}
		if s.Successes != 2 || s.Failures != 0 {
			t.Fatalf("neutral follow-up moved counters: %+v", s)
		}
		return
	}
	t.Fatal("bugfix strategy missing from state")
}
