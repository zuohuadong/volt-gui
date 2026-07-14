// Package scopedmemory provides the structured, auditable memory layers used by
// rich clients. It intentionally lives beside the existing memory package: the
// legacy doc/auto-memory APIs stay compatible while this store adds explicit
// user, organization, workspace, project, and thread ownership.
package scopedmemory

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"voltui/internal/fileutil"
)

type Layer string

const (
	LayerUser         Layer = "user"
	LayerOrganization Layer = "organization"
	LayerWorkspace    Layer = "workspace"
	LayerProject      Layer = "project"
	LayerThread       Layer = "thread"
	UserScopeID             = "user"
)

var layerRank = map[Layer]int{
	LayerUser: 0, LayerOrganization: 1, LayerWorkspace: 2, LayerProject: 3, LayerThread: 4,
}

type Context struct {
	OrganizationID string `json:"organizationId,omitempty"`
	WorkspaceID    string `json:"workspaceId,omitempty"`
	ProjectID      string `json:"projectId,omitempty"`
	ThreadID       string `json:"threadId,omitempty"`
}

// ForLayer returns the ownership lineage that is relevant to one memory
// layer. A repeated project or thread id is not globally unique: its ancestor
// organization/workspace/project chain is part of the owner identity.
func (c Context) ForLayer(layer Layer) Context {
	c.OrganizationID = strings.TrimSpace(c.OrganizationID)
	c.WorkspaceID = strings.TrimSpace(c.WorkspaceID)
	c.ProjectID = strings.TrimSpace(c.ProjectID)
	c.ThreadID = strings.TrimSpace(c.ThreadID)
	switch layer {
	case LayerUser:
		return Context{}
	case LayerOrganization:
		return Context{OrganizationID: c.OrganizationID}
	case LayerWorkspace:
		return Context{OrganizationID: c.OrganizationID, WorkspaceID: c.WorkspaceID}
	case LayerProject:
		return Context{OrganizationID: c.OrganizationID, WorkspaceID: c.WorkspaceID, ProjectID: c.ProjectID}
	case LayerThread:
		return c
	default:
		return Context{}
	}
}

func ContextPointer(c Context) *Context {
	if c == (Context{}) {
		return nil
	}
	copy := c
	return &copy
}

func (c Context) ScopeID(layer Layer) string {
	switch layer {
	case LayerUser:
		return UserScopeID
	case LayerOrganization:
		return strings.TrimSpace(c.OrganizationID)
	case LayerWorkspace:
		return strings.TrimSpace(c.WorkspaceID)
	case LayerProject:
		return strings.TrimSpace(c.ProjectID)
	case LayerThread:
		return strings.TrimSpace(c.ThreadID)
	default:
		return ""
	}
}

func ValidateContext(c Context) error {
	fields := []struct {
		name  string
		value string
	}{
		{"organization", c.OrganizationID},
		{"workspace", c.WorkspaceID},
		{"project", c.ProjectID},
		{"thread", c.ThreadID},
	}
	for _, field := range fields {
		if err := validateID(strings.TrimSpace(field.value)); err != nil {
			return fmt.Errorf("invalid %s context: %w", field.name, err)
		}
	}
	return nil
}

type Reference struct {
	ID     string `json:"id"`
	Title  string `json:"title,omitempty"`
	Source string `json:"source,omitempty"`
}

type Entry struct {
	ID         string      `json:"id"`
	Title      string      `json:"title"`
	Body       string      `json:"body"`
	Source     string      `json:"source"`
	Layer      Layer       `json:"layer"`
	ScopeID    string      `json:"scopeId"`
	Owner      Context     `json:"owner"`
	References []Reference `json:"references"`
	CreatedAt  time.Time   `json:"createdAt"`
	UpdatedAt  time.Time   `json:"updatedAt"`
	Isolated   bool        `json:"isolated"`
}

type Input struct {
	ID         string      `json:"id,omitempty"`
	Title      string      `json:"title"`
	Body       string      `json:"body"`
	Source     string      `json:"source"`
	Layer      Layer       `json:"layer"`
	ScopeID    string      `json:"scopeId"`
	References []Reference `json:"references"`
	Isolated   bool        `json:"isolated"`
}

type Archive struct {
	Entry      Entry     `json:"entry"`
	ArchivedAt time.Time `json:"archivedAt"`
}

type diskState struct {
	Version  int       `json:"version"`
	Entries  []Entry   `json:"entries"`
	Archives []Archive `json:"archives"`
}

type Store struct {
	root string
	path string
	mu   *sync.Mutex
}

var storeLocks sync.Map

func Open(root string) (*Store, error) {
	root = strings.TrimSpace(root)
	if root == "" {
		return nil, fmt.Errorf("scoped memory store unavailable")
	}
	abs, err := filepath.Abs(root)
	if err != nil {
		return nil, err
	}
	abs = filepath.Clean(abs)
	path := filepath.Join(abs, "scoped-memory", "store.json")
	if !withinRoot(abs, path) {
		return nil, fmt.Errorf("scoped memory path escapes store root")
	}
	lock, _ := storeLocks.LoadOrStore(path, &sync.Mutex{})
	return &Store{root: abs, path: path, mu: lock.(*sync.Mutex)}, nil
}

func withinRoot(root, path string) bool {
	rel, err := filepath.Rel(root, path)
	return err == nil && rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel)
}

func (s *Store) Path() string {
	if s == nil {
		return ""
	}
	return s.path
}

func (s *Store) Save(ctx Context, input Input) (Entry, error) {
	if s == nil {
		return Entry{}, fmt.Errorf("scoped memory store unavailable")
	}
	input.ID = strings.TrimSpace(input.ID)
	input.Title = strings.TrimSpace(input.Title)
	input.Body = strings.TrimSpace(input.Body)
	input.Source = strings.TrimSpace(input.Source)
	input.ScopeID = strings.TrimSpace(input.ScopeID)
	if err := validateInput(ctx, input); err != nil {
		return Entry{}, err
	}
	refs, err := normalizeReferences(input.References)
	if err != nil {
		return Entry{}, err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	state, err := s.readLocked()
	if err != nil {
		return Entry{}, err
	}
	now := time.Now().UTC()
	entry := Entry{
		ID: input.ID, Title: input.Title, Body: input.Body, Source: input.Source,
		Layer: input.Layer, ScopeID: input.ScopeID, Owner: ctx.ForLayer(input.Layer), References: refs,
		CreatedAt: now, UpdatedAt: now, Isolated: input.Isolated,
	}
	if entry.ID == "" {
		entry.ID, err = newID()
		if err != nil {
			return Entry{}, err
		}
		state.Entries = append(state.Entries, entry)
	} else {
		idx := entryIndex(state.Entries, entry.ID)
		if idx < 0 {
			return Entry{}, fmt.Errorf("scoped memory %q not found", entry.ID)
		}
		if !matchesContext(state.Entries[idx], ctx) {
			return Entry{}, fmt.Errorf("scoped memory %q is outside the current context", entry.ID)
		}
		entry.CreatedAt = state.Entries[idx].CreatedAt
		state.Entries[idx] = entry
	}
	if err := s.writeLocked(state); err != nil {
		return Entry{}, err
	}
	return cloneEntry(entry), nil
}

func (s *Store) List(ctx Context) ([]Entry, error) {
	if s == nil {
		return []Entry{}, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	state, err := s.readLocked()
	if err != nil {
		return nil, err
	}
	return entriesForContext(state.Entries, ctx), nil
}

func (s *Store) ListArchives(ctx Context) ([]Archive, error) {
	if s == nil {
		return []Archive{}, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	state, err := s.readLocked()
	if err != nil {
		return nil, err
	}
	out := make([]Archive, 0, len(state.Archives))
	for _, archive := range state.Archives {
		if matchesContext(archive.Entry, ctx) {
			archive.Entry = cloneEntry(archive.Entry)
			out = append(out, archive)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].ArchivedAt.After(out[j].ArchivedAt) })
	return out, nil
}

func (s *Store) SetIsolation(ctx Context, id string, isolated bool) (Entry, error) {
	if s == nil {
		return Entry{}, fmt.Errorf("scoped memory store unavailable")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return Entry{}, fmt.Errorf("scoped memory id is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	state, err := s.readLocked()
	if err != nil {
		return Entry{}, err
	}
	idx := entryIndex(state.Entries, id)
	if idx < 0 {
		return Entry{}, fmt.Errorf("scoped memory %q not found", id)
	}
	if !matchesContext(state.Entries[idx], ctx) {
		return Entry{}, fmt.Errorf("scoped memory %q is outside the current context", id)
	}
	state.Entries[idx].Isolated = isolated
	state.Entries[idx].UpdatedAt = time.Now().UTC()
	if err := s.writeLocked(state); err != nil {
		return Entry{}, err
	}
	return cloneEntry(state.Entries[idx]), nil
}

func (s *Store) Delete(ctx Context, id string) (Archive, error) {
	if s == nil {
		return Archive{}, fmt.Errorf("scoped memory store unavailable")
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return Archive{}, fmt.Errorf("scoped memory id is required")
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	state, err := s.readLocked()
	if err != nil {
		return Archive{}, err
	}
	idx := entryIndex(state.Entries, id)
	if idx < 0 {
		return Archive{}, fmt.Errorf("scoped memory %q not found", id)
	}
	if !matchesContext(state.Entries[idx], ctx) {
		return Archive{}, fmt.Errorf("scoped memory %q is outside the current context", id)
	}
	archive := Archive{Entry: cloneEntry(state.Entries[idx]), ArchivedAt: time.Now().UTC()}
	state.Entries = append(state.Entries[:idx], state.Entries[idx+1:]...)
	state.Archives = append(state.Archives, archive)
	if err := s.writeLocked(state); err != nil {
		return Archive{}, err
	}
	return archive, nil
}

func (s *Store) Block(ctx Context) (string, []string, error) {
	_, block, sources, err := s.Snapshot(ctx)
	return block, sources, err
}

// Snapshot returns the visible entries and the exact runtime block/source ids
// from one serialized read, so audit metadata cannot describe a different
// store generation than the prompt being built.
func (s *Store) Snapshot(ctx Context) ([]Entry, string, []string, error) {
	if s == nil {
		return []Entry{}, "", []string{}, nil
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	state, err := s.readLocked()
	if err != nil {
		return nil, "", nil, err
	}
	entries := entriesForContext(state.Entries, ctx)
	var b strings.Builder
	var sources []string
	for _, entry := range entries {
		if entry.Isolated {
			continue
		}
		if b.Len() == 0 {
			b.WriteString("# Scoped Memory\n\nStructured context ordered from broad to specific. Each item includes its provenance and ownership scope.\n")
		}
		fmt.Fprintf(&b, "\n## %s\n\n- id: %s\n- layer: %s\n- scope: %s\n- source: %s\n- updated: %s\n", entry.Title, entry.ID, entry.Layer, entry.ScopeID, entry.Source, entry.UpdatedAt.Format(time.RFC3339))
		if len(entry.References) > 0 {
			b.WriteString("- references:")
			for _, ref := range entry.References {
				fmt.Fprintf(&b, " %s", ref.ID)
			}
			b.WriteString("\n")
		}
		b.WriteString("\n" + entry.Body + "\n")
		sources = append(sources, entry.ID)
	}
	if sources == nil {
		sources = []string{}
	}
	return entries, strings.TrimSpace(b.String()), sources, nil
}

func LayersForEntries(entries []Entry, includeIsolated bool) []string {
	seen := map[Layer]bool{}
	var out []string
	for _, entry := range entries {
		if entry.Isolated && !includeIsolated || seen[entry.Layer] {
			continue
		}
		seen[entry.Layer] = true
		out = append(out, string(entry.Layer))
	}
	sort.SliceStable(out, func(i, j int) bool { return layerRank[Layer(out[i])] < layerRank[Layer(out[j])] })
	return out
}

func validateInput(ctx Context, input Input) error {
	if _, ok := layerRank[input.Layer]; !ok {
		return fmt.Errorf("invalid scoped memory layer %q", input.Layer)
	}
	if input.Title == "" || input.Body == "" || input.Source == "" {
		return fmt.Errorf("scoped memory title, body, and source are required")
	}
	if utf8.RuneCountInString(input.Title) > 256 || len(input.Body) > 256*1024 || len(input.Source) > 2048 {
		return fmt.Errorf("scoped memory input exceeds size limits")
	}
	if err := validateID(input.ScopeID); err != nil {
		return fmt.Errorf("invalid scope id: %w", err)
	}
	want := ctx.ScopeID(input.Layer)
	if want == "" || input.ScopeID != want {
		return fmt.Errorf("scope %q does not match current %s context", input.ScopeID, input.Layer)
	}
	if err := validateOwner(ctx.ForLayer(input.Layer), input.Layer); err != nil {
		return err
	}
	if input.ID != "" {
		if err := validateID(input.ID); err != nil {
			return fmt.Errorf("invalid memory id: %w", err)
		}
	}
	return nil
}

func validateOwner(owner Context, layer Layer) error {
	fields := []struct {
		name  string
		value string
	}{
		{"organization", owner.OrganizationID},
		{"workspace", owner.WorkspaceID},
		{"project", owner.ProjectID},
		{"thread", owner.ThreadID},
	}
	required := layerRank[layer]
	for i := 0; i < required; i++ {
		if err := validateID(fields[i].value); err != nil {
			return fmt.Errorf("invalid %s owner context: %w", fields[i].name, err)
		}
	}
	return nil
}

func validateID(value string) error {
	if value == "" || len(value) > 256 || value == "." || value == ".." || strings.Contains(value, "/") || strings.Contains(value, "\\") || strings.Contains(value, "..") {
		return fmt.Errorf("unsafe identifier")
	}
	for _, r := range value {
		if unicode.IsControl(r) {
			return fmt.Errorf("identifier contains control characters")
		}
	}
	return nil
}

func normalizeReferences(refs []Reference) ([]Reference, error) {
	if len(refs) > 64 {
		return nil, fmt.Errorf("too many scoped memory references")
	}
	out := make([]Reference, 0, len(refs))
	seen := map[string]bool{}
	for _, ref := range refs {
		ref.ID = strings.TrimSpace(ref.ID)
		ref.Title = strings.TrimSpace(ref.Title)
		ref.Source = strings.TrimSpace(ref.Source)
		if err := validateID(ref.ID); err != nil {
			return nil, fmt.Errorf("invalid reference id: %w", err)
		}
		if seen[ref.ID] {
			continue
		}
		if len(ref.Title) > 512 || len(ref.Source) > 2048 {
			return nil, fmt.Errorf("scoped memory reference exceeds size limits")
		}
		seen[ref.ID] = true
		out = append(out, ref)
	}
	if out == nil {
		out = []Reference{}
	}
	return out, nil
}

func matchesContext(entry Entry, ctx Context) bool {
	if _, ok := layerRank[entry.Layer]; !ok || entry.ScopeID == "" || entry.ScopeID != ctx.ScopeID(entry.Layer) {
		return false
	}
	// v1 stores did not persist ancestor ownership. User memory is global and
	// organization ids are already globally identifying, so those two legacy
	// layers remain readable. Deeper legacy layers fail closed because matching
	// only scopeId could leak across repeated workspace/project/thread ids.
	if entry.Owner == (Context{}) {
		return entry.Layer == LayerUser || entry.Layer == LayerOrganization
	}
	owner := entry.Owner.ForLayer(entry.Layer)
	want := ctx.ForLayer(entry.Layer)
	if validateOwner(owner, entry.Layer) != nil || validateOwner(want, entry.Layer) != nil {
		return false
	}
	return owner == want
}

func entryIndex(entries []Entry, id string) int {
	for i := range entries {
		if entries[i].ID == id {
			return i
		}
	}
	return -1
}

func sortEntries(entries []Entry) {
	sort.SliceStable(entries, func(i, j int) bool {
		if layerRank[entries[i].Layer] != layerRank[entries[j].Layer] {
			return layerRank[entries[i].Layer] < layerRank[entries[j].Layer]
		}
		if !entries[i].CreatedAt.Equal(entries[j].CreatedAt) {
			return entries[i].CreatedAt.Before(entries[j].CreatedAt)
		}
		return entries[i].ID < entries[j].ID
	})
}

func entriesForContext(entries []Entry, ctx Context) []Entry {
	out := make([]Entry, 0, len(entries))
	for _, entry := range entries {
		if matchesContext(entry, ctx) {
			out = append(out, cloneEntry(entry))
		}
	}
	sortEntries(out)
	return out
}

func cloneEntry(entry Entry) Entry {
	entry.References = append([]Reference(nil), entry.References...)
	if entry.References == nil {
		entry.References = []Reference{}
	}
	return entry
}

func newID() (string, error) {
	var raw [12]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "", err
	}
	return "memory-" + hex.EncodeToString(raw[:]), nil
}

func (s *Store) readLocked() (diskState, error) {
	state := diskState{Version: 2, Entries: []Entry{}, Archives: []Archive{}}
	b, err := os.ReadFile(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			return state, nil
		}
		return state, err
	}
	if err := json.Unmarshal(b, &state); err != nil {
		return state, fmt.Errorf("decode scoped memory store: %w", err)
	}
	if state.Entries == nil {
		state.Entries = []Entry{}
	}
	if state.Archives == nil {
		state.Archives = []Archive{}
	}
	return state, nil
}

func (s *Store) writeLocked(state diskState) error {
	state.Version = 2
	b, err := json.MarshalIndent(state, "", "  ")
	if err != nil {
		return err
	}
	b = append(b, '\n')
	return fileutil.AtomicWriteFile(s.path, b, 0o600)
}
