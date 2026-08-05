package control

import (
	"context"
	"errors"
	"testing"
	"time"

	"voltui/internal/event"
)

type approvalBlockingRunner struct {
	c *Controller
}

func (r *approvalBlockingRunner) Run(ctx context.Context, _ string) error {
	_, _, err := gateApprover{c: r.c}.Approve(ctx, "bash", "go test ./...", nil)
	return err
}

type askBlockingRunner struct {
	c *Controller
}

type contextBlockingRunner struct{}

func (contextBlockingRunner) Run(ctx context.Context, _ string) error {
	<-ctx.Done()
	return ctx.Err()
}

func TestTurnTimeoutStopsInteractiveTurnWithoutClassifyingUserCancel(t *testing.T) {
	done := make(chan event.Event, 1)
	c := New(Options{
		Runner:      contextBlockingRunner{},
		TurnTimeout: 25 * time.Millisecond,
		Sink: event.FuncSink(func(e event.Event) {
			if e.Kind == event.TurnDone {
				done <- e
			}
		}),
	})

	c.Send("bounded turn")
	e := waitTurnDoneEvent(t, done)
	if e.Cancelled {
		t.Fatal("deadline expiry must not be classified as a user cancel")
	}
	if e.Err == nil {
		t.Fatal("deadline expiry must report a timeout error")
	}
	if !errors.Is(e.Err, ErrTurnTimeout) {
		t.Fatalf("deadline expiry error = %v, want ErrTurnTimeout", e.Err)
	}
}

func (r *askBlockingRunner) Run(ctx context.Context, _ string) error {
	_, err := r.c.Ask(ctx, []event.AskQuestion{{
		ID:      "choice",
		Prompt:  "Pick one",
		Options: []event.AskOption{{Label: "A"}, {Label: "B"}},
	}})
	return err
}

func TestCancelClearsPendingApprovalRuntimeStatus(t *testing.T) {
	approvals := make(chan event.Approval, 1)
	done := make(chan event.Event, 1)
	c := New(Options{Sink: event.FuncSink(func(e event.Event) {
		switch e.Kind {
		case event.ApprovalRequest:
			approvals <- e.Approval
		case event.TurnDone:
			done <- e
		}
	})})
	runner := &approvalBlockingRunner{c: c}
	c.runner = runner

	c.Send("needs approval")
	select {
	case <-approvals:
	case <-time.After(30 * time.Second):
		t.Fatal("timed out waiting for approval request")
	}
	if st := c.RuntimeStatus(); !st.Running || !st.PendingPrompt || !st.Cancellable || st.CancelRequested {
		t.Fatalf("status before cancel = %+v, want running pending cancellable", st)
	}

	c.Cancel()
	c.Cancel()
	assertCancelClearedPendingRuntimeStatus(t, c.RuntimeStatus())
	if e := waitTurnDoneEvent(t, done); !e.Cancelled {
		t.Fatal("cancelled turn_done event was not marked as user-cancelled")
	}
	// TurnDone is emitted inside the finishing window; Running() (and the
	// RuntimeStatus it feeds) stays true until finishGuardedTurn's deferred
	// clear runs. Wait for the gate to reopen before asserting idle.
	waitIdle(t, c)
	if st := c.RuntimeStatus(); st.Running || st.PendingPrompt || st.Cancellable || st.CancelRequested {
		t.Fatalf("status after turn done = %+v, want idle", st)
	}
}

func TestCancelClearsPendingAskRuntimeStatus(t *testing.T) {
	asks := make(chan event.Ask, 1)
	done := make(chan event.Event, 1)
	c := New(Options{Sink: event.FuncSink(func(e event.Event) {
		switch e.Kind {
		case event.AskRequest:
			asks <- e.Ask
		case event.TurnDone:
			done <- e
		}
	})})
	runner := &askBlockingRunner{c: c}
	c.runner = runner

	c.Send("ask user")
	select {
	case <-asks:
	case <-time.After(30 * time.Second):
		t.Fatal("timed out waiting for ask request")
	}
	if st := c.RuntimeStatus(); !st.Running || !st.PendingPrompt || !st.Cancellable || st.CancelRequested {
		t.Fatalf("status before cancel = %+v, want running pending cancellable", st)
	}

	c.Cancel()
	assertCancelClearedPendingRuntimeStatus(t, c.RuntimeStatus())
	waitTurnDoneEvent(t, done)
	// TurnDone is emitted inside the finishing window; Running() (and the
	// RuntimeStatus it feeds) stays true until finishGuardedTurn's deferred
	// clear runs. Wait for the gate to reopen before asserting idle.
	waitIdle(t, c)
	if st := c.RuntimeStatus(); st.Running || st.PendingPrompt || st.Cancellable || st.CancelRequested {
		t.Fatalf("status after turn done = %+v, want idle", st)
	}
}

func TestCloseCancelsPendingAskRuntimeStatus(t *testing.T) {
	asks := make(chan event.Ask, 1)
	done := make(chan event.Event, 1)
	c := New(Options{Sink: event.FuncSink(func(e event.Event) {
		switch e.Kind {
		case event.AskRequest:
			asks <- e.Ask
		case event.TurnDone:
			done <- e
		}
	})})
	c.runner = &askBlockingRunner{c: c}

	c.Send("ask user")
	select {
	case <-asks:
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for ask request")
	}

	c.Close()
	select {
	case e := <-done:
		if !e.Cancelled {
			t.Fatal("closed turn_done event was not marked as cancelled")
		}
	case <-time.After(time.Second):
		c.Cancel()
		t.Fatal("Close did not cancel the pending ask waiter")
	}
	waitIdle(t, c)
	if st := c.RuntimeStatus(); st.Running || st.PendingPrompt || st.Cancellable || st.CancelRequested {
		t.Fatalf("status after Close = %+v, want idle", st)
	}
}

func TestCloseDoesNotResurrectFinishingState(t *testing.T) {
	turnStarted := make(chan struct{})
	turnDoneEntered := make(chan struct{}, 1)
	releaseTurnDone := make(chan struct{})
	c := New(Options{Sink: holdFinishingWindow(releaseTurnDone, turnDoneEntered, nil)})

	c.runGuarded(func(ctx context.Context) error {
		close(turnStarted)
		<-ctx.Done()
		return ctx.Err()
	})
	<-turnStarted

	c.Close()
	select {
	case <-turnDoneEntered:
	case <-time.After(time.Second):
		c.Cancel()
		t.Fatal("Close did not cancel the active turn")
	}
	defer close(releaseTurnDone)

	if st := c.RuntimeStatus(); st.Running || st.PendingPrompt || st.Cancellable || st.CancelRequested {
		t.Fatalf("closed controller resurrected active state during TurnDone delivery: %+v", st)
	}
}

func assertCancelClearedPendingRuntimeStatus(t *testing.T, st RuntimeStatus) {
	t.Helper()
	if st.PendingPrompt {
		t.Fatalf("status immediately after cancel = %+v, want pending prompt cleared", st)
	}
	if st.Running {
		if !st.Cancellable || !st.CancelRequested {
			t.Fatalf("status immediately after cancel = %+v, want running cancelling without pending prompt", st)
		}
		return
	}
	if st.Cancellable || st.CancelRequested {
		t.Fatalf("status immediately after cancel = %+v, want idle when turn already completed", st)
	}
}

func waitTurnDoneEvent(t *testing.T, done <-chan event.Event) event.Event {
	t.Helper()
	select {
	case e := <-done:
		if e.Kind != event.TurnDone {
			t.Fatalf("event = %v, want TurnDone", e.Kind)
		}
		return e
	case <-time.After(30 * time.Second):
		t.Fatal("timed out waiting for turn_done")
	}
	return event.Event{}
}
