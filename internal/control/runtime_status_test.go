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
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for approval request")
	}
	if st := c.RuntimeStatus(); !st.Running || !st.PendingPrompt || !st.Cancellable || st.CancelRequested {
		t.Fatalf("status before cancel = %+v, want running pending cancellable", st)
	}

	c.Cancel()
	c.Cancel()
	assertCancelClearedPendingRuntimeStatus(t, c.RuntimeStatus())
	waitTurnDoneEvent(t, done)
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
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for ask request")
	}
	if st := c.RuntimeStatus(); !st.Running || !st.PendingPrompt || !st.Cancellable || st.CancelRequested {
		t.Fatalf("status before cancel = %+v, want running pending cancellable", st)
	}

	c.Cancel()
	assertCancelClearedPendingRuntimeStatus(t, c.RuntimeStatus())
	waitTurnDoneEvent(t, done)
	if st := c.RuntimeStatus(); st.Running || st.PendingPrompt || st.Cancellable || st.CancelRequested {
		t.Fatalf("status after turn done = %+v, want idle", st)
	}
}

func TestRuntimeStatusReportsPendingRotation(t *testing.T) {
	c := New(Options{})
	c.mu.Lock()
	c.rotationPending = true
	c.mu.Unlock()
	if status := c.RuntimeStatus(); !status.Rotating || status.Running || status.Cancellable {
		t.Fatalf("pending rotation status = %+v, want rotating but not cancellable", status)
	}
}

func TestSubmitDisplayCheckedRejectsBusyRuntime(t *testing.T) {
	c := New(Options{})
	c.mu.Lock()
	c.running = true
	c.mu.Unlock()
	if err := c.SubmitDisplayChecked("second", "second"); err != ErrTurnRunning {
		t.Fatalf("SubmitDisplayChecked while running = %v, want ErrTurnRunning", err)
	}
}

func TestSubmissionReservationBlocksUnrelatedTurnAndRotation(t *testing.T) {
	c := New(Options{})
	reservation, err := c.reserveSubmission()
	if err != nil {
		t.Fatal(err)
	}
	defer c.releaseSubmission(reservation)
	if status := c.RuntimeStatus(); !status.Submitting || status.Running || status.Rotating || status.Cancellable {
		t.Fatalf("submission reservation status = %+v, want submitting but not cancellable", status)
	}
	if accepted := c.runGuarded(func(context.Context) error { return nil }); accepted {
		t.Fatal("unrelated turn should not consume a checked submission reservation")
	}
	if err := c.beginRotation(); !errors.Is(err, errTurnRunningRotation) {
		t.Fatalf("beginRotation during checked submission = %v, want turn-running rejection", err)
	}

	started := make(chan struct{})
	release := make(chan struct{})
	if accepted := c.runGuardedWithReservation(reservation, func(context.Context) error {
		close(started)
		<-release
		return nil
	}); !accepted {
		t.Fatal("checked submission owner should claim the reserved turn")
	}
	<-started
	if status := c.RuntimeStatus(); !status.Running || status.Rotating {
		t.Fatalf("reserved turn status = %+v", status)
	}
	close(release)
}

func TestSubmitUserTurnCheckedRejectsConcurrentSubmissionReservation(t *testing.T) {
	c := New(Options{})
	reservation, err := c.reserveSubmission()
	if err != nil {
		t.Fatal(err)
	}
	defer c.releaseSubmission(reservation)
	if err := c.SubmitUserTurnChecked("heartbeat", "heartbeat"); !errors.Is(err, ErrTurnRunning) {
		t.Fatalf("SubmitUserTurnChecked during reservation = %v, want ErrTurnRunning", err)
	}
}

func TestSubmissionReservationTransfersAtomicallyToSynchronousRotation(t *testing.T) {
	c := New(Options{})
	reservation, err := c.reserveSubmission()
	if err != nil {
		t.Fatal(err)
	}
	if err := c.beginRotationWithSubmissionReservation(reservation); err != nil {
		t.Fatalf("beginRotationWithSubmissionReservation: %v", err)
	}
	defer c.endRotation()
	status := c.RuntimeStatus()
	if !status.Rotating || status.Submitting || status.Running {
		t.Fatalf("reservation transfer status = %+v, want rotating owner", status)
	}
	if accepted := c.runGuarded(func(context.Context) error { return nil }); accepted {
		t.Fatal("a normal turn started while the reserved synchronous rotation was active")
	}
}

func TestAsyncRotationConsumesOnlyItsReservation(t *testing.T) {
	c := New(Options{})
	submission, err := c.reserveSubmission()
	if err != nil {
		t.Fatal(err)
	}
	claimed := make(chan struct{})
	release := make(chan struct{})
	c.runAsyncRotationCommand(submission, "rotation", "rotated", func(rotation uint64) error {
		if err := c.beginReservedRotation(rotation); err != nil {
			return err
		}
		close(claimed)
		<-release
		c.endRotation()
		return nil
	})
	<-claimed
	if status := c.RuntimeStatus(); !status.Rotating || status.Running {
		t.Fatalf("reserved rotation status = %+v", status)
	}
	if _, err := c.reserveSubmission(); err != ErrTurnRunning {
		t.Fatalf("submission during reserved rotation = %v, want ErrTurnRunning", err)
	}
	close(release)
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

func waitTurnDoneEvent(t *testing.T, done <-chan event.Event) {
	t.Helper()
	select {
	case e := <-done:
		if e.Kind != event.TurnDone {
			t.Fatalf("event = %v, want TurnDone", e.Kind)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for turn_done")
	}
}
