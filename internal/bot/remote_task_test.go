package bot

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestRemoteStoreUsesExactEndpointActorAndMessageIdempotency(t *testing.T) {
	store, err := NewRemoteStore(t.TempDir())
	if err != nil {
		t.Fatalf("NewRemoteStore: %v", err)
	}
	msg := InboundMessage{
		Platform:     PlatformFeishu,
		ConnectionID: "feishu-lark",
		Domain:       "lark",
		ChatType:     ChatThread,
		ChatID:       "chat-1",
		ThreadID:     "thread-1",
		UserID:       "sender-1",
		OperatorID:   "operator-1",
		MessageID:    "message-1",
		Text:         "prepare status",
	}
	endpoint := RemoteEndpointFromMessage(msg)
	if endpoint.Platform != PlatformFeishu || endpoint.ConnectionID != "feishu-lark" || endpoint.Domain != "lark" || endpoint.ChatType != ChatThread || endpoint.ChatID != "chat-1" || endpoint.ThreadID != "thread-1" {
		t.Fatalf("endpoint = %+v, want exact remote identity", endpoint)
	}
	if actor := RemoteActorFromMessage(msg); actor != "operator-1" {
		t.Fatalf("actor = %q, want OperatorID precedence", actor)
	}

	binding, created, err := store.EnsureBinding(RemoteBinding{
		Endpoint:          endpoint,
		ActorID:           "operator-1",
		Roles:             []string{"user"},
		WorkspaceRoots:    []string{"/workspace"},
		ProjectIDs:        []string{"project-1"},
		AgentProfileIDs:   []string{"reviewer"},
		PermissionCeiling: RemotePermissionAsk,
		Status:            RemoteBindingActive,
	})
	if err != nil || !created {
		t.Fatalf("EnsureBinding = %+v, %v, %v", binding, created, err)
	}
	spec := RemoteTaskSpec{
		Endpoint:       endpoint,
		ActorID:        "operator-1",
		MessageID:      "message-1",
		Goal:           "prepare status",
		WorkspaceRoot:  "/workspace",
		ProjectID:      "project-1",
		AgentProfileID: "reviewer",
		PermissionMode: RemotePermissionAsk,
	}
	first, created, err := store.BeginTask(binding.ID, spec)
	if err != nil || !created || first.Status != RemoteTaskAccepted {
		t.Fatalf("first BeginTask = %+v, %v, %v", first, created, err)
	}
	duplicate, created, err := store.BeginTask(binding.ID, spec)
	if err != nil || created || duplicate.ID != first.ID {
		t.Fatalf("duplicate BeginTask = %+v, %v, %v; want same task", duplicate, created, err)
	}

	otherThread := msg
	otherThread.ThreadID = "thread-2"
	otherBinding, created, err := store.EnsureBinding(RemoteBinding{
		Endpoint: RemoteEndpointFromMessage(otherThread), ActorID: "operator-1", Status: RemoteBindingActive,
	})
	if err != nil || !created || otherBinding.ID == binding.ID {
		t.Fatalf("other endpoint binding = %+v, %v, %v", otherBinding, created, err)
	}
	otherActor := msg
	otherActor.OperatorID = "operator-2"
	actorBinding, created, err := store.EnsureBinding(RemoteBinding{
		Endpoint: endpoint, ActorID: RemoteActorFromMessage(otherActor), Status: RemoteBindingActive,
	})
	if err != nil || !created || actorBinding.ID == binding.ID {
		t.Fatalf("other actor binding = %+v, %v, %v", actorBinding, created, err)
	}
}

func TestRemoteStoreEnforcesLifecycleGovernanceReceiptAuditAndCrashSafety(t *testing.T) {
	dir := t.TempDir()
	store, err := NewRemoteStore(dir)
	if err != nil {
		t.Fatalf("NewRemoteStore: %v", err)
	}
	endpoint := RemoteEndpoint{Platform: PlatformWeixin, ConnectionID: "weixin-main", Domain: "weixin", ChatType: ChatDM, ChatID: "chat-1"}
	binding, _, err := store.EnsureBinding(RemoteBinding{
		Endpoint: endpoint, ActorID: "owner", Status: RemoteBindingActive,
		WorkspaceRoots: []string{"/allowed"}, ProjectIDs: []string{"project-1"}, AgentProfileIDs: []string{"reviewer"},
		PermissionCeiling: RemotePermissionAsk,
	})
	if err != nil {
		t.Fatalf("EnsureBinding: %v", err)
	}
	base := RemoteTaskSpec{
		Endpoint: endpoint, ActorID: "owner", MessageID: "m-1", Goal: "inspect /very/secret/session.jsonl token=abc123",
		WorkspaceRoot: "/allowed", ProjectID: "project-1", AgentProfileID: "reviewer", PermissionMode: RemotePermissionAsk,
	}
	if _, _, err := store.BeginTask(binding.ID, func() RemoteTaskSpec {
		next := base
		next.MessageID = "bad-workspace"
		next.WorkspaceRoot = "/other"
		return next
	}()); err == nil {
		t.Fatal("workspace outside binding must be rejected")
	}
	if _, _, err := store.BeginTask(binding.ID, func() RemoteTaskSpec {
		next := base
		next.MessageID = "bad-project"
		next.ProjectID = "project-2"
		return next
	}()); err == nil {
		t.Fatal("project outside binding must be rejected")
	}
	if _, _, err := store.BeginTask(binding.ID, func() RemoteTaskSpec {
		next := base
		next.MessageID = "bad-profile"
		next.AgentProfileID = "other"
		return next
	}()); err == nil {
		t.Fatal("agent profile outside binding must be rejected")
	}
	if _, _, err := store.BeginTask(binding.ID, func() RemoteTaskSpec {
		next := base
		next.MessageID = "bad-permission"
		next.PermissionMode = RemotePermissionYolo
		return next
	}()); err == nil {
		t.Fatal("permission above binding ceiling must be rejected")
	}

	task, _, err := store.BeginTask(binding.ID, base)
	if err != nil {
		t.Fatalf("BeginTask: %v", err)
	}
	if _, err := store.TransitionTask(task.ID, RemoteTaskRunning, ""); err == nil {
		t.Fatal("accepted -> running must be rejected without queued")
	}
	for _, status := range []RemoteTaskStatus{RemoteTaskQueued, RemoteTaskRunning, RemoteTaskAwaitingApproval, RemoteTaskRunning, RemoteTaskSucceeded} {
		if _, err := store.TransitionTask(task.ID, status, ""); err != nil {
			t.Fatalf("transition to %s: %v", status, err)
		}
	}
	receipt, err := store.Receipt(task.ID)
	if err != nil {
		t.Fatalf("Receipt: %v", err)
	}
	if receipt.Status != RemoteTaskSucceeded || receipt.Changes.Status != "pending" || receipt.Verification.Status != "pending" || receipt.Artifacts.Status != "pending" {
		t.Fatalf("receipt = %+v, want honest pending evidence", receipt)
	}
	if strings.Contains(receipt.Goal, "/very/secret/session.jsonl") || strings.Contains(receipt.Goal, "abc123") {
		t.Fatalf("receipt leaked path or secret: %+v", receipt)
	}
	audit, err := store.ListAudit()
	if err != nil || len(audit) < 7 {
		t.Fatalf("audit = %+v, %v", audit, err)
	}
	for _, entry := range audit {
		if strings.Contains(entry.Reason, "/very/secret/session.jsonl") || strings.Contains(entry.Reason, "abc123") {
			t.Fatalf("audit leaked sensitive data: %+v", entry)
		}
	}

	second, _, err := store.BeginTask(binding.ID, func() RemoteTaskSpec { next := base; next.MessageID = "m-2"; next.Goal = "second"; return next }())
	if err != nil {
		t.Fatalf("second BeginTask: %v", err)
	}
	requested, err := store.RequestCancel(second.ID, binding.ID, "owner")
	if err != nil || requested.Status != RemoteTaskCancelRequested {
		t.Fatalf("RequestCancel = %+v, %v", requested, err)
	}
	if _, err := store.RequestCancel(second.ID, binding.ID, "intruder"); err == nil {
		t.Fatal("non-owner cancel must be rejected")
	}
	if _, err := store.RevokeBinding(binding.ID); err != nil {
		t.Fatalf("RevokeBinding: %v", err)
	}
	if _, _, err := store.BeginTask(binding.ID, func() RemoteTaskSpec { next := base; next.MessageID = "after-revoke"; return next }()); err == nil {
		t.Fatal("revoked binding must reject new tasks")
	}

	past := time.Now().UTC().Add(-time.Minute)
	if _, _, err := store.EnsureBinding(RemoteBinding{Endpoint: RemoteEndpoint{Platform: PlatformQQ, ChatType: ChatDM, ChatID: "expired"}, ActorID: "expired-user", Status: RemoteBindingActive, ExpiresAt: past}); err == nil {
		t.Fatal("expired binding must not become active")
	}

	for _, name := range []string{"state.json", "audit.jsonl"} {
		info, err := os.Stat(filepath.Join(dir, name))
		if err != nil {
			t.Fatalf("stat %s: %v", name, err)
		}
		if info.Mode().Perm() != 0o600 {
			t.Fatalf("%s mode = %o, want 600", name, info.Mode().Perm())
		}
	}
	reopened, err := NewRemoteStore(dir)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	if got, err := reopened.Task(task.ID); err != nil || got.Status != RemoteTaskSucceeded {
		t.Fatalf("reopened task = %+v, %v", got, err)
	}
	corruptDir := t.TempDir()
	if err := os.WriteFile(filepath.Join(corruptDir, "state.json"), []byte("{partial"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := NewRemoteStore(corruptDir); err == nil {
		t.Fatal("corrupt startup state must fail closed")
	}
}
