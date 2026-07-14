package agent

import (
	"encoding/json"
	"strings"
	"testing"

	"voltui/internal/scopedmemory"
)

func TestEmptyBranchMetaOmitsAgentProfileTimestamp(t *testing.T) {
	b, err := json.Marshal(BranchMeta{})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), "agent_profile_updated_at") {
		t.Fatalf("empty profile timestamp leaked into legacy metadata: %s", b)
	}
	if strings.Contains(string(b), "memory_context") {
		t.Fatalf("empty memory context leaked into legacy metadata: %s", b)
	}
}

func TestInheritAgentProfileDropsParentThreadMemoryAudit(t *testing.T) {
	parent := BranchMeta{
		MemoryContext: scopedmemory.ContextPointer(scopedmemory.Context{
			OrganizationID: "org-a",
			WorkspaceID:    "workspace-a",
			ProjectID:      "project-a",
			ThreadID:       "thread-a",
		}),
		MemoryScopes:    []string{"user", "workspace", "thread"},
		MemorySourceIDs: []string{"memory-user", "memory-thread"},
	}
	var child BranchMeta
	child.InheritAgentProfile(parent)
	if child.MemoryContext == nil || parent.MemoryContext == nil {
		t.Fatalf("memory context = %+v, want inherited ancestors", child.MemoryContext)
	}
	if child.MemoryContext.OrganizationID != "org-a" || child.MemoryContext.WorkspaceID != "workspace-a" || child.MemoryContext.ProjectID != "project-a" || child.MemoryContext.ThreadID != "" {
		t.Fatalf("fork memory context = %+v, want ancestors without parent thread", child.MemoryContext)
	}
	parent.MemoryContext.ProjectID = "changed"
	if child.MemoryContext.ProjectID != "project-a" {
		t.Fatal("inherited memory context aliases parent pointer")
	}
	if len(child.MemoryScopes) != 0 || len(child.MemorySourceIDs) != 0 || child.MemoryUpdatedAt != "" {
		t.Fatalf("fork inherited stale parent memory audit: scopes=%v sources=%v updated=%q", child.MemoryScopes, child.MemorySourceIDs, child.MemoryUpdatedAt)
	}
}
