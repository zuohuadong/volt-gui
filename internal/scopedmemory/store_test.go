package scopedmemory

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestStoreListsContextInLayerOrderAndExcludesIsolatedFromBlock(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx := Context{
		OrganizationID: "org-acme",
		WorkspaceID:    "workspace-volt",
		ProjectID:      "project-release",
		ThreadID:       "thread-42",
	}
	cases := []Input{
		{Title: "Thread", Body: "thread fact", Source: "thread-note", Layer: LayerThread, ScopeID: ctx.ThreadID},
		{Title: "User", Body: "user preference", Source: "user-profile", Layer: LayerUser, ScopeID: UserScopeID},
		{Title: "Project", Body: "project constraint", Source: "project-brief", Layer: LayerProject, ScopeID: ctx.ProjectID},
		{Title: "Organization", Body: "organization policy", Source: "org-policy", Layer: LayerOrganization, ScopeID: ctx.OrganizationID},
		{Title: "Workspace", Body: "workspace convention", Source: "workspace-file", Layer: LayerWorkspace, ScopeID: ctx.WorkspaceID},
	}
	var project Entry
	for _, input := range cases {
		entry, saveErr := store.Save(ctx, input)
		if saveErr != nil {
			t.Fatalf("Save(%s): %v", input.Layer, saveErr)
		}
		if input.Layer == LayerProject {
			project = entry
		}
	}

	entries, err := store.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := []Layer{LayerUser, LayerOrganization, LayerWorkspace, LayerProject, LayerThread}
	if len(entries) != len(want) {
		t.Fatalf("entries = %+v", entries)
	}
	for i := range want {
		if entries[i].Layer != want[i] {
			t.Fatalf("entry[%d].layer = %q, want %q", i, entries[i].Layer, want[i])
		}
	}

	if _, err := store.SetIsolation(ctx, project.ID, true); err != nil {
		t.Fatal(err)
	}
	block, sources, err := store.Block(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(block, "project constraint") {
		t.Fatalf("isolated memory leaked into block: %s", block)
	}
	if len(sources) != 4 {
		t.Fatalf("source ids = %v, want 4 non-isolated entries", sources)
	}

	archive, err := store.Delete(ctx, project.ID)
	if err != nil {
		t.Fatal(err)
	}
	if archive.Entry.ID != project.ID || archive.ArchivedAt.IsZero() {
		t.Fatalf("archive = %+v", archive)
	}
	archives, err := store.ListArchives(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(archives) != 1 || archives[0].Entry.ID != project.ID {
		t.Fatalf("archives = %+v", archives)
	}
}

func TestStoreSerializesConcurrentWriters(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx := Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "project-a", ThreadID: "thread-a"}
	const count = 24
	var wg sync.WaitGroup
	errs := make(chan error, count)
	for i := 0; i < count; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, saveErr := store.Save(ctx, Input{
				Title: fmt.Sprintf("memory-%02d", i), Body: "body", Source: "concurrent-test",
				Layer: LayerThread, ScopeID: ctx.ThreadID,
			})
			errs <- saveErr
		}(i)
	}
	wg.Wait()
	close(errs)
	for err := range errs {
		if err != nil {
			t.Fatal(err)
		}
	}
	entries, err := store.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != count {
		t.Fatalf("entries = %d, want %d", len(entries), count)
	}
}

func TestStoreRejectsScopeEscapeAndCrossContextMutation(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx := Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "project-a", ThreadID: "thread-a"}
	if _, err := store.Save(ctx, Input{Title: "escape", Body: "bad", Layer: LayerProject, ScopeID: "../outside"}); err == nil {
		t.Fatal("scope traversal should be rejected")
	}
	entry, err := store.Save(ctx, Input{Title: "private", Body: "a", Source: "test", Layer: LayerProject, ScopeID: ctx.ProjectID})
	if err != nil {
		t.Fatal(err)
	}
	other := Context{OrganizationID: "org-a", WorkspaceID: "workspace-b", ProjectID: "project-b", ThreadID: "thread-b"}
	if _, err := store.SetIsolation(other, entry.ID, true); err == nil {
		t.Fatal("cross-context mutation should be rejected")
	}
}

func TestStoreRequiresFullAncestorOwnershipForProjectAndThreadMemory(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	owner := Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "shared-project", ThreadID: "shared-thread"}
	project, err := store.Save(owner, Input{Title: "Project", Body: "workspace-a project memory", Source: "test", Layer: LayerProject, ScopeID: owner.ProjectID})
	if err != nil {
		t.Fatal(err)
	}
	thread, err := store.Save(owner, Input{Title: "Thread", Body: "project-a thread memory", Source: "test", Layer: LayerThread, ScopeID: owner.ThreadID})
	if err != nil {
		t.Fatal(err)
	}

	sameIDsDifferentWorkspace := Context{OrganizationID: "org-a", WorkspaceID: "workspace-b", ProjectID: owner.ProjectID, ThreadID: owner.ThreadID}
	entries, err := store.List(sameIDsDifferentWorkspace)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 0 {
		t.Fatalf("same project/thread ids in another workspace leaked entries: %+v", entries)
	}

	sameThreadDifferentProject := Context{OrganizationID: "org-a", WorkspaceID: owner.WorkspaceID, ProjectID: "other-project", ThreadID: owner.ThreadID}
	entries, err = store.List(sameThreadDifferentProject)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range entries {
		if entry.ID == thread.ID {
			t.Fatalf("same thread id in another project leaked thread memory: %+v", entry)
		}
	}
	if _, err := store.SetIsolation(sameIDsDifferentWorkspace, project.ID, true); err == nil {
		t.Fatal("same project id in another workspace must not mutate project memory")
	}
}

func TestStoreReadsSafeLegacyLayersAndQuarantinesAmbiguousLegacyOwnership(t *testing.T) {
	store, err := Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	ctx := Context{OrganizationID: "org-a", WorkspaceID: "workspace-a", ProjectID: "project-a", ThreadID: "thread-a"}
	now := time.Now().UTC()
	legacy := diskState{Version: 1, Entries: []Entry{
		{ID: "legacy-user", Title: "User", Body: "global", Source: "v1", Layer: LayerUser, ScopeID: UserScopeID, CreatedAt: now, UpdatedAt: now},
		{ID: "legacy-org", Title: "Organization", Body: "org", Source: "v1", Layer: LayerOrganization, ScopeID: ctx.OrganizationID, CreatedAt: now, UpdatedAt: now},
		{ID: "legacy-project", Title: "Project", Body: "ambiguous", Source: "v1", Layer: LayerProject, ScopeID: ctx.ProjectID, CreatedAt: now, UpdatedAt: now},
		{ID: "legacy-thread", Title: "Thread", Body: "ambiguous", Source: "v1", Layer: LayerThread, ScopeID: ctx.ThreadID, CreatedAt: now, UpdatedAt: now},
	}}
	body, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(store.Path()), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(store.Path(), body, 0o600); err != nil {
		t.Fatal(err)
	}
	entries, err := store.List(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(entries) != 2 || entries[0].ID != "legacy-user" || entries[1].ID != "legacy-org" {
		t.Fatalf("legacy visibility = %+v, want only globally safe user/org entries", entries)
	}
}
