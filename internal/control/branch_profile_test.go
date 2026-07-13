package control

import (
	"path/filepath"
	"testing"
	"time"

	"voltui/internal/agent"
	"voltui/internal/event"
	"voltui/internal/provider"
)

func TestForkAndBranchInheritAgentProfileMetadata(t *testing.T) {
	dir := t.TempDir()
	rootPath := filepath.Join(dir, "root.jsonl")
	sess := agent.NewSession("sys")
	sess.Add(provider.Message{Role: provider.RoleUser, Content: "root prompt"})
	exec := agent.New(nil, nil, sess, agent.Options{}, event.Discard)
	c := New(Options{Executor: exec, SessionDir: dir, SessionPath: rootPath, Label: "test", Sink: event.Discard})
	if err := c.Snapshot(); err != nil {
		t.Fatal(err)
	}
	changedAt := time.Now().UTC().Format(time.RFC3339Nano)
	parentMeta, err := agent.EnsureBranchMeta(rootPath)
	if err != nil {
		t.Fatal(err)
	}
	parentMeta.AgentProfileID = "reviewer"
	parentMeta.AgentProfileName = "Reviewer"
	parentMeta.AgentProfileBaseModel = "base/model"
	parentMeta.AgentProfileUpdatedAt = changedAt
	parentMeta.AgentProfileHistory = []agent.AgentProfileSwitch{{
		ProfileID: "reviewer", ProfileName: "Reviewer", ModelRef: "profile/model", Action: "select", ChangedAt: time.Now().UTC(),
	}}
	if err := agent.SaveBranchMetaPreserveUpdated(rootPath, parentMeta); err != nil {
		t.Fatal(err)
	}

	c.checkpoints.mu.Lock()
	c.checkpoints.bound[0] = len(c.History())
	c.checkpoints.mu.Unlock()
	forkPath, err := c.ForkSession(0, "fork")
	if err != nil {
		t.Fatalf("ForkSession: %v", err)
	}
	assertBranchAgentProfile(t, forkPath, changedAt)

	branchPath, err := c.Branch("branch")
	if err != nil {
		t.Fatalf("Branch: %v", err)
	}
	assertBranchAgentProfile(t, branchPath, changedAt)
}

func assertBranchAgentProfile(t *testing.T, path, changedAt string) {
	t.Helper()
	meta, ok, err := agent.LoadBranchMeta(path)
	if err != nil || !ok {
		t.Fatalf("LoadBranchMeta(%q): ok=%v err=%v", path, ok, err)
	}
	if meta.AgentProfileID != "reviewer" || meta.AgentProfileName != "Reviewer" || meta.AgentProfileBaseModel != "base/model" || meta.AgentProfileUpdatedAt != changedAt {
		t.Fatalf("branch profile metadata = %+v", meta)
	}
	if len(meta.AgentProfileHistory) != 1 || meta.AgentProfileHistory[0].ModelRef != "profile/model" {
		t.Fatalf("branch profile history = %+v", meta.AgentProfileHistory)
	}
}
