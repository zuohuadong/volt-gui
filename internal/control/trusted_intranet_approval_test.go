package control

import (
	"context"
	"errors"
	"testing"
	"time"

	"voltui/internal/event"
	"voltui/internal/permission"
	"voltui/internal/tool"
)

func TestTrustedIntranetApprovalIsFreshAndPermanentGrantRequiresSuccessfulSave(t *testing.T) {
	if !RequiresFreshHumanApprovalTool(TrustedIntranetApprovalTool) {
		t.Fatal("trusted intranet approval must ignore auto/yolo")
	}
	if !allowsFreshSessionGrantTool(TrustedIntranetApprovalTool) {
		t.Fatal("successful permanent trusted intranet approval should support an exact session grant")
	}

	requests := make(chan event.Approval, 4)
	saveErr := error(nil)
	saves := 0
	c := New(Options{
		Policy: permission.New("ask", nil, nil, nil),
		Sink: event.FuncSink(func(e event.Event) {
			if e.Kind == event.ApprovalRequest {
				requests <- e.Approval
			}
		}),
		OnRememberTrustedIntranet: func(req tool.TrustedIntranetRequest) TrustedIntranetRememberResult {
			saves++
			return TrustedIntranetRememberResult{Request: req, Path: "/user/config.toml", Saved: saveErr == nil, Err: saveErr}
		},
	})
	c.SetToolApprovalMode(ToolApprovalYolo)
	approver := trustedIntranetApprover{c}
	req := tool.TrustedIntranetRequest{URL: "https://lims.xigu.org/", Host: "lims.xigu.org", IP: "192.168.1.14", Port: 443}

	result := make(chan error, 1)
	go func() {
		allow, _, err := approver.ApproveTrustedIntranet(context.Background(), req)
		if err == nil && !allow {
			err = errors.New("allow = false")
		}
		result <- err
	}()
	approval := waitTrustedIntranetApproval(t, requests)
	if approval.Tool != TrustedIntranetApprovalTool || approval.Reason == "" {
		t.Fatalf("approval = %+v", approval)
	}
	c.Approve(approval.ID, true, true, true)
	if err := <-result; err != nil {
		t.Fatalf("permanent approval: %v", err)
	}
	if saves != 1 || !approver.TrustedIntranetSessionAllowed(context.Background(), req) {
		t.Fatalf("successful persistence saves=%d sessionAllowed=%v", saves, approver.TrustedIntranetSessionAllowed(context.Background(), req))
	}

	failedReq := tool.TrustedIntranetRequest{URL: "https://other.internal/", Host: "other.internal", IP: "192.168.1.15", Port: 443}
	saveErr = errors.New("disk full")
	go func() {
		allow, _, err := approver.ApproveTrustedIntranet(context.Background(), failedReq)
		if err == nil && allow {
			err = errors.New("persistence failure unexpectedly allowed request")
		}
		result <- err
	}()
	approval = waitTrustedIntranetApproval(t, requests)
	c.Approve(approval.ID, true, true, true)
	if err := <-result; err == nil || !errors.Is(err, saveErr) {
		t.Fatalf("failed persistence error = %v, want disk full", err)
	}
	if approver.TrustedIntranetSessionAllowed(context.Background(), failedReq) {
		t.Fatal("failed persistence must not establish a session grant")
	}
}

func waitTrustedIntranetApproval(t *testing.T, requests <-chan event.Approval) event.Approval {
	t.Helper()
	select {
	case approval := <-requests:
		return approval
	case <-time.After(2 * time.Second):
		t.Fatal("trusted intranet approval was not emitted")
		return event.Approval{}
	}
}
