package agent

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"reasonix/internal/agent/testutil"
	"reasonix/internal/event"
	"reasonix/internal/provider"
	"reasonix/internal/tool"
)

// steerThenCancelTool queues a steer while the turn is running, then cancels
// the turn so Run exits before the loop's per-iteration consume can deliver it.
type steerThenCancelTool struct {
	agent     *Agent
	cancel    context.CancelFunc
	steerText string
	accepted  bool
}

func (t *steerThenCancelTool) Name() string        { return "steer_then_cancel" }
func (t *steerThenCancelTool) Description() string { return "queues a steer and cancels the turn" }
func (t *steerThenCancelTool) Schema() json.RawMessage {
	return json.RawMessage(`{"type":"object","properties":{}}`)
}
func (t *steerThenCancelTool) ReadOnly() bool { return true }
func (t *steerThenCancelTool) Execute(context.Context, json.RawMessage) (string, error) {
	t.accepted = t.agent.Steer(t.steerText)
	t.cancel()
	return "ok", nil
}

// TestRunFlushesUnconsumedSteersOnCancel proves a steer that is still queued
// when the turn is cancelled survives into the session (history + next turn's
// context) and emits its Steer event, instead of being silently dropped
// (#6238: queued guidance vanished from both the model and the transcript).
func TestRunFlushesUnconsumedSteersOnCancel(t *testing.T) {
	mp := testutil.NewMock("m",
		testutil.Turn{ToolCalls: []provider.ToolCall{{ID: "call-1", Name: "steer_then_cancel", Arguments: `{}`}}},
		testutil.Turn{Text: "never reached"},
	)
	hijack := &steerThenCancelTool{steerText: "use plan B"}
	reg := tool.NewRegistry()
	reg.Add(hijack)
	var steerEvents []string
	sink := event.FuncSink(func(e event.Event) {
		if e.Kind == event.Steer {
			steerEvents = append(steerEvents, e.Text)
		}
	})
	a := New(mp, reg, NewSession(""), Options{}, sink)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	hijack.agent = a
	hijack.cancel = cancel

	err := a.Run(ctx, "go")
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Run should exit on the cancelled context, got %v", err)
	}
	if !hijack.accepted {
		t.Fatalf("Steer during an active turn should be accepted")
	}

	var persisted []string
	for _, m := range a.Session().Messages {
		if m.Role != provider.RoleUser {
			continue
		}
		if strings.Contains(m.Content, MidTurnSteerPrefix) {
			persisted = append(persisted, m.Content)
		}
	}
	if len(persisted) != 1 || !strings.Contains(persisted[0], "use plan B") {
		t.Fatalf("unconsumed steer should be persisted to the session exactly once, got %v", persisted)
	}
	if len(steerEvents) != 1 || steerEvents[0] != "use plan B" {
		t.Fatalf("flushed steer should emit its Steer event, got %v", steerEvents)
	}
	if n := a.steerQueueLen(); n != 0 {
		t.Fatalf("steer queue should be empty after the turn, len=%d", n)
	}
	if a.Steer("after the turn") {
		t.Fatalf("Steer must be rejected once the turn has exited")
	}
}

// TestSteerRejectedWithoutActiveTurn proves a steer arriving when no turn is
// running is rejected instead of parked in a queue no loop will consume, so
// the controller can convert it into a regular turn.
func TestSteerRejectedWithoutActiveTurn(t *testing.T) {
	a := New(testutil.NewMock("m", testutil.Turn{Text: "done"}), tool.NewRegistry(), NewSession(""), Options{}, event.Discard)
	if a.Steer("early") {
		t.Fatalf("Steer with no active turn must be rejected")
	}
	if n := a.steerQueueLen(); n != 0 {
		t.Fatalf("rejected steer must not linger in the queue, len=%d", n)
	}
	if err := a.Run(context.Background(), "go"); err != nil {
		t.Fatalf("Run: %v", err)
	}
	if a.Steer("between turns") {
		t.Fatalf("Steer between turns must be rejected")
	}
}
