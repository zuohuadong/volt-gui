package agent

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"voltui/internal/event"
	"voltui/internal/evidence"
	"voltui/internal/provider"
	"voltui/internal/tool"
)

// TestReadOnlyChurnGuardEscalatesRepeatedInspection covers the office-document
// failure mode where the model proofreads by re-running grep/bash/python checks
// round after round. Every call succeeds and is read-only, so the failure
// storm breaker and the blocked streak never see the loop, and the todo stall
// guard treats each re-worded search as unique progress. After
// readOnlyChurnBreakThreshold consecutive read-only-only rounds the host must
// tell the model to stop re-checking and deliver.
func TestReadOnlyChurnGuardEscalatesRepeatedInspection(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(okTool{name: "read_file"})
	reg.Add(okTool{name: "grep"})
	sink, notices := noticeRecorder()
	a := New(nil, reg, NewSession(""), Options{}, sink)

	var last string
	for i := 0; i < readOnlyChurnBreakThreshold; i++ {
		// Vary tools and arguments every round, mirroring a model that re-words
		// each self-check so no identical-call guard can fire.
		name := "read_file"
		if i%2 == 1 {
			name = "grep"
		}
		call := provider.ToolCall{Name: name, Arguments: `{"round":` + strings.Repeat("x", i+1) + `}`}
		last = executeBatchOutputs(a, context.Background(), []provider.ToolCall{call})[0]
		if i < readOnlyChurnBreakThreshold-1 && strings.Contains(last, "[loop guard]") {
			t.Fatalf("round %d should not carry the loop guard yet, got: %q", i+1, last)
		}
	}

	if !strings.Contains(last, "[loop guard]") {
		t.Fatalf("after %d read-only-only rounds the result should carry the loop guard, got: %q", readOnlyChurnBreakThreshold, last)
	}
	if !strings.Contains(last, "deliver the final result") {
		t.Errorf("loop-guard text should direct the model to deliver, got: %q", last)
	}
	if len(*notices) == 0 {
		t.Errorf("loop guard should emit a notice to the user")
	}
	if len(*notices) != 1 {
		t.Errorf("loop guard should fire once per run, got %d notices", len(*notices))
	}

	// Ignoring the directive must not re-inject it every round: repeated
	// injections would grow the transcript tail and re-trigger compaction,
	// cratering the prompt cache the stuck guard exists to protect.
	next := executeBatchOutputs(a, context.Background(), []provider.ToolCall{{Name: "read_file", Arguments: `{"again":true}`}})[0]
	if strings.Contains(next, "[loop guard]") {
		t.Errorf("guard must not re-fire while the churn run continues, got: %q", next)
	}
	if len(*notices) != 1 {
		t.Errorf("continued churn should not emit more notices, got %d", len(*notices))
	}
}

// TestReadOnlyChurnGuardResetsOnMutation: a mutating round is real progress, so
// it must reset the consecutive read-only counter; the guard only fires after
// another full run of read-only-only rounds.
func TestReadOnlyChurnGuardResetsOnMutation(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(okTool{name: "read_file"})
	reg.Add(fakeTool{name: "edit_file", readOnly: false})
	sink, _ := noticeRecorder()
	a := New(nil, reg, NewSession(""), Options{}, sink)

	readRound := func() string {
		call := provider.ToolCall{Name: "read_file", Arguments: `{}`}
		return executeBatchOutputs(a, context.Background(), []provider.ToolCall{call})[0]
	}

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		readRound()
	}
	edit := provider.ToolCall{Name: "edit_file", Arguments: `{}`}
	executeBatchOutputs(a, context.Background(), []provider.ToolCall{edit})

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		if got := readRound(); strings.Contains(got, "[loop guard]") {
			t.Fatalf("mutation should have reset the counter; round %d carried the guard: %q", i+1, got)
		}
	}
	if got := readRound(); !strings.Contains(got, "[loop guard]") {
		t.Fatalf("guard should fire after a fresh run of %d read-only-only rounds, got: %q", readOnlyChurnBreakThreshold, got)
	}
}

// TestReadOnlyChurnGuardResetsOnFailure: a failing read-only round is a real
// blocker the model must react to, not churn, so it resets the counter.
func TestReadOnlyChurnGuardResetsOnFailure(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(okTool{name: "read_file"})
	reg.Add(failTool{name: "grep"})
	sink, _ := noticeRecorder()
	a := New(nil, reg, NewSession(""), Options{}, sink)

	readRound := func() string {
		call := provider.ToolCall{Name: "read_file", Arguments: `{}`}
		return executeBatchOutputs(a, context.Background(), []provider.ToolCall{call})[0]
	}

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		readRound()
	}
	failing := provider.ToolCall{Name: "grep", Arguments: `{}`}
	executeBatchOutputs(a, context.Background(), []provider.ToolCall{failing})

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		if got := readRound(); strings.Contains(got, "[loop guard]") {
			t.Fatalf("failure should have reset the counter; round %d carried the guard: %q", i+1, got)
		}
	}
	if got := readRound(); !strings.Contains(got, "[loop guard]") {
		t.Fatalf("guard should fire after a fresh run of %d read-only-only rounds, got: %q", readOnlyChurnBreakThreshold, got)
	}
}

func TestReadOnlyChurnGuardIgnoresTodoBookkeeping(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(okTool{name: "read_file"})
	reg.Add(fakeTool{name: "todo_write", readOnly: false})
	a := New(nil, reg, NewSession(""), Options{}, event.Discard)

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		executeBatchOutputs(a, context.Background(), []provider.ToolCall{{Name: "read_file", Arguments: `{}`}})
	}
	executeBatchOutputs(a, context.Background(), []provider.ToolCall{{Name: "todo_write", Arguments: `{}`}})
	last := executeBatchOutputs(a, context.Background(), []provider.ToolCall{{Name: "read_file", Arguments: `{}`}})[0]

	if !strings.Contains(last, "[loop guard]") {
		t.Fatalf("todo bookkeeping reset the proofreading streak: %q", last)
	}
}

func TestFullWriteTargetGuardBlocksChangedWholeFileRewrites(t *testing.T) {
	reg := tool.NewRegistry()
	var executions int32
	reg.Add(fakeTool{name: "write_file", readOnly: false, calls: &executions})
	workspaceRoot := t.TempDir()
	a := New(nil, reg, NewSession(""), Options{WriteWorkspaceRoot: workspaceRoot}, event.Discard)

	writes := []provider.ToolCall{
		writeFileCall(t, "report.md", "first draft"),
		writeFileCall(t, filepath.Join(workspaceRoot, "report.md"), "corrected draft"),
	}
	for _, call := range writes {
		if output := executeBatchOutputs(a, context.Background(), []provider.ToolCall{call})[0]; strings.Contains(output, "[loop guard]") {
			t.Fatalf("allowed whole-file write was blocked: %q", output)
		}
	}
	third := writeFileCall(t, filepath.Join("drafts", "..", "report.md"), "third draft")
	output := executeBatchOutputs(a, context.Background(), []provider.ToolCall{third})[0]

	if !strings.Contains(output, "Preserve the latest successful version") {
		t.Fatalf("third whole-file write did not preserve the latest artifact: %q", output)
	}
	if executions != int32(repeatSuccessBreakThreshold) {
		t.Fatalf("write_file executions = %d, want %d", executions, repeatSuccessBreakThreshold)
	}
	other := writeFileCall(t, "appendix.md", "separate artifact")
	executeBatchOutputs(a, context.Background(), []provider.ToolCall{other})
	if executions != int32(repeatSuccessBreakThreshold+1) {
		t.Fatalf("a separate artifact was blocked; executions = %d", executions)
	}
}

func TestReadOnlyChurnGuardResetsOnInitialTodo(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(okTool{name: "read_file"})
	reg.Add(mustBuiltinTool(t, "todo_write"))
	a := New(nil, reg, NewSession(""), Options{}, event.Discard)

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		executeBatchOutputs(a, context.Background(), []provider.ToolCall{{Name: "read_file", Arguments: `{}`}})
	}
	progress := provider.ToolCall{Name: "todo_write", Arguments: `{"todos":[{"content":"draft","status":"in_progress"}]}`}
	progressOutput := executeBatchOutputs(a, context.Background(), []provider.ToolCall{progress})[0]
	if strings.HasPrefix(progressOutput, "error:") || strings.HasPrefix(progressOutput, "blocked:") {
		t.Fatalf("initial todo did not succeed: %q", progressOutput)
	}
	last := executeBatchOutputs(a, context.Background(), []provider.ToolCall{{Name: "read_file", Arguments: `{}`}})[0]

	if strings.Contains(last, "[loop guard]") {
		t.Fatalf("initial todo did not reset the proofreading streak: %q", last)
	}
}

func TestReadOnlyChurnGuardResetsOnSuccessfulCompletion(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(okTool{name: "read_file"})
	reg.Add(mustBuiltinTool(t, "complete_step"))
	a := New(nil, reg, NewSession(""), Options{}, event.Discard)
	a.setTodoState([]evidence.TodoItem{{Content: "draft", Status: "in_progress"}})

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		executeBatchOutputs(a, context.Background(), []provider.ToolCall{{Name: "read_file", Arguments: `{}`}})
	}
	completion := provider.ToolCall{Name: "complete_step", Arguments: `{"step":"draft","result":"done","evidence":[{"kind":"manual","summary":"reviewed"}]}`}
	completionOutput := executeBatchOutputs(a, context.Background(), []provider.ToolCall{completion})[0]
	if strings.HasPrefix(completionOutput, "error:") || strings.HasPrefix(completionOutput, "blocked:") {
		t.Fatalf("completion did not succeed: %q", completionOutput)
	}
	last := executeBatchOutputs(a, context.Background(), []provider.ToolCall{{Name: "read_file", Arguments: `{}`}})[0]

	if strings.Contains(last, "[loop guard]") {
		t.Fatalf("successful completion did not reset the proofreading streak: %q", last)
	}
}

func TestReadOnlyChurnGuardIgnoresRenewedCompletion(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(okTool{name: "read_file"})
	reg.Add(mustBuiltinTool(t, "complete_step"))
	a := New(nil, reg, NewSession(""), Options{}, event.Discard)
	a.setTodoState([]evidence.TodoItem{{Content: "draft", Status: "completed"}})

	for i := 0; i < readOnlyChurnBreakThreshold-1; i++ {
		executeBatchOutputs(a, context.Background(), []provider.ToolCall{{Name: "read_file", Arguments: `{}`}})
	}
	renewal := provider.ToolCall{Name: "complete_step", Arguments: `{"step":"draft","result":"reviewed again","evidence":[{"kind":"manual","summary":"reviewed again"}],"notes":"renewal"}`}
	renewalOutput := executeBatchOutputs(a, context.Background(), []provider.ToolCall{renewal})[0]
	if strings.HasPrefix(renewalOutput, "error:") || strings.HasPrefix(renewalOutput, "blocked:") {
		t.Fatalf("renewal completion did not succeed: %q", renewalOutput)
	}
	last := executeBatchOutputs(a, context.Background(), []provider.ToolCall{{Name: "read_file", Arguments: `{}`}})[0]

	if !strings.Contains(last, "[loop guard]") {
		t.Fatalf("renewal completion reset the proofreading streak: %q", last)
	}
}

func TestFullWriteTargetGuardResolvesSymlinkedParent(t *testing.T) {
	workspaceRoot := t.TempDir()
	realDir := filepath.Join(workspaceRoot, "real")
	if err := os.Mkdir(realDir, 0o755); err != nil {
		t.Fatal(err)
	}
	aliasDir := filepath.Join(workspaceRoot, "alias")
	if err := os.Symlink(realDir, aliasDir); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	reg := tool.NewRegistry()
	var executions int32
	reg.Add(fakeTool{name: "write_file", readOnly: false, calls: &executions})
	a := New(nil, reg, NewSession(""), Options{WriteWorkspaceRoot: workspaceRoot}, event.Discard)

	executeBatchOutputs(a, context.Background(), []provider.ToolCall{writeFileCall(t, filepath.Join("real", "report.md"), "first")})
	executeBatchOutputs(a, context.Background(), []provider.ToolCall{writeFileCall(t, filepath.Join("alias", "report.md"), "second")})
	third := executeBatchOutputs(a, context.Background(), []provider.ToolCall{writeFileCall(t, filepath.Join(realDir, "report.md"), "third")})[0]

	if !strings.Contains(third, "Preserve the latest successful version") || executions != int32(repeatSuccessBreakThreshold) {
		t.Fatalf("symlink alias bypassed the whole-file guard: output=%q executions=%d", third, executions)
	}
}

func TestFullWriteTargetGuardDoesNotLimitIncrementalEdits(t *testing.T) {
	reg := tool.NewRegistry()
	var executions int32
	reg.Add(fakeTool{name: "edit_file", readOnly: false, calls: &executions})
	a := New(nil, reg, NewSession(""), Options{}, event.Discard)

	for i := 0; i < repeatSuccessBreakThreshold+2; i++ {
		call := provider.ToolCall{Name: "edit_file", Arguments: `{"path":"code.go","old_string":"before-` + strings.Repeat("x", i+1) + `","new_string":"after"}`}
		if output := executeBatchOutputs(a, context.Background(), []provider.ToolCall{call})[0]; strings.Contains(output, "[loop guard]") {
			t.Fatalf("incremental edit %d was blocked: %q", i+1, output)
		}
	}
	if executions != int32(repeatSuccessBreakThreshold+2) {
		t.Fatalf("edit_file executions = %d, want %d", executions, repeatSuccessBreakThreshold+2)
	}
}

func writeFileCall(t *testing.T, path, content string) provider.ToolCall {
	t.Helper()
	args, err := json.Marshal(map[string]string{"path": path, "content": content})
	if err != nil {
		t.Fatal(err)
	}
	return provider.ToolCall{Name: "write_file", Arguments: string(args)}
}
