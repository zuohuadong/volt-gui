package agent

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"voltui/internal/agent/testutil"
	"voltui/internal/event"

	"voltui/internal/provider"
	"voltui/internal/tool"
)

// stubGate denies any call whose tool name is in deny; everything else allows.
type stubGate struct {
	deny    map[string]bool
	checked []string
}

func (g *stubGate) Check(ctx context.Context, toolName string, args json.RawMessage, readOnly bool) (bool, string, error) {
	g.checked = append(g.checked, toolName)
	if g.deny[toolName] {
		return false, "denied by test policy", nil
	}
	return true, "", nil
}

// TestGateBlocksDeniedCall proves executeOne consults the gate after the
// plan-mode check: a denied tool returns a "blocked:" result plus a notice and
// never runs, while an allowed tool runs normally.
func TestGateBlocksDeniedCall(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(fakeTool{name: "bash", readOnly: false})
	reg.Add(fakeTool{name: "read_file", readOnly: true})

	g := &stubGate{deny: map[string]bool{"bash": true}}
	a := New(nil, reg, NewSession(""), Options{Gate: g}, event.Discard)

	blocked := a.executeOne(context.Background(), provider.ToolCall{Name: "bash", Arguments: `{"command":"rm -rf /"}`})
	if !strings.HasPrefix(blocked.output, "blocked:") {
		t.Errorf("denied call result = %q, want a 'blocked:' result", blocked.output)
	}
	if !blocked.blocked || blocked.errMsg == "" {
		t.Errorf("denied call should surface a user-facing block notice, got %+v", blocked)
	}

	ok := a.executeOne(context.Background(), provider.ToolCall{Name: "read_file", Arguments: `{"path":"/a"}`})
	if !strings.Contains(ok.output, "done") {
		t.Errorf("allowed call should run, got %q", ok.output)
	}

	if len(g.checked) != 2 {
		t.Errorf("gate consulted %d times, want 2 (%v)", len(g.checked), g.checked)
	}
}

func TestRunPermissionDeniedToolCallPreservesRecovery(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(fakeTool{name: "write_file", readOnly: false})

	mp := testutil.NewMock("p0-provider",
		testutil.Turn{ToolCalls: []provider.ToolCall{{
			ID:        "call-write",
			Name:      "write_file",
			Arguments: `{"path":"outside.txt","content":"no"}`,
		}}},
		testutil.Turn{Text: "permission denial handled"},
	)
	g := &stubGate{deny: map[string]bool{"write_file": true}}
	a := New(mp, reg, NewSession(""), Options{Gate: g}, event.Discard)

	if err := a.Run(context.Background(), "write outside the workspace"); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if mp.CallCount() != 2 {
		t.Fatalf("provider calls = %d, want recovery request after denied tool", mp.CallCount())
	}

	msgs := a.Session().Messages
	if len(msgs) < 4 {
		t.Fatalf("session messages = %#v, want user/assistant/tool/assistant", msgs)
	}
	toolResult := msgs[2]
	if toolResult.Role != provider.RoleTool || toolResult.ToolCallID != "call-write" || !strings.HasPrefix(toolResult.Content, "blocked: denied by test policy") {
		t.Fatalf("denied tool result was not persisted as a paired tool message: %+v", toolResult)
	}

	reqs := mp.Requests()
	second := provider.SanitizeToolPairing(reqs[1].Messages)
	seenPairedResult := false
	for _, msg := range second {
		if msg.Role == provider.RoleTool && msg.ToolCallID == "call-write" && strings.HasPrefix(msg.Content, "blocked: denied by test policy") {
			seenPairedResult = true
			break
		}
	}
	if !seenPairedResult {
		t.Fatalf("second provider request lost the denied tool result: %#v", second)
	}
}

// TestNilGateRunsEverything confirms gating is opt-in: with no gate wired, a
// writer call runs unimpeded (backward-compatible default).
func TestNilGateRunsEverything(t *testing.T) {
	reg := tool.NewRegistry()
	reg.Add(fakeTool{name: "write_file", readOnly: false})

	a := New(nil, reg, NewSession(""), Options{}, event.Discard) // no Gate
	out := a.executeOne(context.Background(), provider.ToolCall{Name: "write_file", Arguments: `{"path":"/a"}`})
	if strings.HasPrefix(out.output, "blocked:") {
		t.Errorf("nil gate should not block: %q", out.output)
	}
}
