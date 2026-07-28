package bot

import (
	"bufio"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"voltui/internal/config"
	"voltui/internal/fileutil"
)

type RemoteEndpoint struct {
	Platform     Platform `json:"platform"`
	ConnectionID string   `json:"connection_id"`
	Domain       string   `json:"domain"`
	ChatType     ChatType `json:"chat_type"`
	ChatID       string   `json:"chat_id"`
	ThreadID     string   `json:"thread_id"`
}

func RemoteEndpointFromMessage(msg InboundMessage) RemoteEndpoint {
	return RemoteEndpoint{
		Platform:     msg.Platform,
		ConnectionID: strings.TrimSpace(msg.ConnectionID),
		Domain:       strings.TrimSpace(msg.Domain),
		ChatType:     msg.ChatType,
		ChatID:       strings.TrimSpace(msg.ChatID),
		ThreadID:     strings.TrimSpace(msg.ThreadID),
	}
}

func RemoteActorFromMessage(msg InboundMessage) string {
	if actor := strings.TrimSpace(msg.OperatorID); actor != "" {
		return actor
	}
	return strings.TrimSpace(msg.UserID)
}

func (e RemoteEndpoint) key() string {
	return strings.Join([]string{
		string(e.Platform),
		strings.TrimSpace(e.ConnectionID),
		strings.TrimSpace(e.Domain),
		string(e.ChatType),
		strings.TrimSpace(e.ChatID),
		strings.TrimSpace(e.ThreadID),
	}, "\x00")
}

type RemoteBindingStatus string

const (
	RemoteBindingActive  RemoteBindingStatus = "active"
	RemoteBindingRevoked RemoteBindingStatus = "revoked"
	RemoteBindingExpired RemoteBindingStatus = "expired"
)

const (
	RemotePermissionRead = "read"
	RemotePermissionAsk  = "ask"
	RemotePermissionAuto = "auto"
	RemotePermissionYolo = "yolo"
)

type RemoteBinding struct {
	ID                     string              `json:"id"`
	Endpoint               RemoteEndpoint      `json:"endpoint"`
	ActorID                string              `json:"actor_id"`
	Roles                  []string            `json:"roles,omitempty"`
	WorkspaceRoots         []string            `json:"workspace_roots,omitempty"`
	ProjectIDs             []string            `json:"project_ids,omitempty"`
	AgentProfileIDs        []string            `json:"agent_profile_ids,omitempty"`
	PermissionCeiling      string              `json:"permission_ceiling"`
	RequireHighRiskConfirm bool                `json:"require_high_risk_confirm"`
	Status                 RemoteBindingStatus `json:"status"`
	Legacy                 bool                `json:"legacy,omitempty"`
	CreatedAt              time.Time           `json:"created_at"`
	UpdatedAt              time.Time           `json:"updated_at"`
	ExpiresAt              time.Time           `json:"expires_at,omitempty"`
	RevokedAt              time.Time           `json:"revoked_at,omitempty"`
}

type RemoteTaskStatus string

const (
	RemoteTaskAccepted         RemoteTaskStatus = "accepted"
	RemoteTaskQueued           RemoteTaskStatus = "queued"
	RemoteTaskRunning          RemoteTaskStatus = "running"
	RemoteTaskAwaitingApproval RemoteTaskStatus = "awaiting_approval"
	RemoteTaskAwaitingInput    RemoteTaskStatus = "awaiting_input"
	RemoteTaskSucceeded        RemoteTaskStatus = "succeeded"
	RemoteTaskFailed           RemoteTaskStatus = "failed"
	RemoteTaskCancelRequested  RemoteTaskStatus = "cancel_requested"
	RemoteTaskCancelled        RemoteTaskStatus = "cancelled"
	RemoteTaskRevoked          RemoteTaskStatus = "revoked"
	RemoteTaskDisconnected     RemoteTaskStatus = "disconnected"
)

type RemoteTaskSpec struct {
	Endpoint       RemoteEndpoint `json:"endpoint"`
	ActorID        string         `json:"actor_id"`
	MessageID      string         `json:"message_id"`
	Goal           string         `json:"goal"`
	WorkspaceRoot  string         `json:"workspace_root,omitempty"`
	ProjectID      string         `json:"project_id,omitempty"`
	AgentProfileID string         `json:"agent_profile_id,omitempty"`
	PermissionMode string         `json:"permission_mode"`
	Legacy         bool           `json:"legacy,omitempty"`
}

type RemoteTaskRecord struct {
	ID        string           `json:"id"`
	BindingID string           `json:"binding_id"`
	Spec      RemoteTaskSpec   `json:"spec"`
	Status    RemoteTaskStatus `json:"status"`
	Error     string           `json:"error,omitempty"`
	CreatedAt time.Time        `json:"created_at"`
	UpdatedAt time.Time        `json:"updated_at"`
	StartedAt time.Time        `json:"started_at,omitempty"`
	EndedAt   time.Time        `json:"ended_at,omitempty"`
}

type RemoteEvidence struct {
	Status string   `json:"status"`
	Items  []string `json:"items,omitempty"`
}

type RemoteTaskReceipt struct {
	TaskID       string           `json:"task_id"`
	Status       RemoteTaskStatus `json:"status"`
	Goal         string           `json:"goal"`
	Runtime      string           `json:"runtime"`
	Changes      RemoteEvidence   `json:"changes"`
	Verification RemoteEvidence   `json:"verification"`
	Artifacts    RemoteEvidence   `json:"artifacts"`
	Error        string           `json:"error,omitempty"`
	Legacy       bool             `json:"legacy,omitempty"`
	UpdatedAt    time.Time        `json:"updated_at"`
}

type RemoteAuditEntry struct {
	ID        string         `json:"id"`
	Timestamp time.Time      `json:"timestamp"`
	ActorID   string         `json:"actor_id,omitempty"`
	BindingID string         `json:"binding_id,omitempty"`
	TaskID    string         `json:"task_id,omitempty"`
	Action    string         `json:"action"`
	Decision  string         `json:"decision,omitempty"`
	Reason    string         `json:"reason,omitempty"`
	Endpoint  RemoteEndpoint `json:"endpoint"`
}

type remoteStoreState struct {
	Bindings    map[string]RemoteBinding     `json:"bindings"`
	Tasks       map[string]RemoteTaskRecord  `json:"tasks"`
	Receipts    map[string]RemoteTaskReceipt `json:"receipts"`
	Idempotency map[string]string            `json:"idempotency"`
}

type RemoteStore struct {
	mu        sync.Mutex
	dir       string
	statePath string
	auditPath string
	state     remoteStoreState
	now       func() time.Time
}

func RemoteTaskStoreDir() string {
	root := strings.TrimSpace(config.MemoryUserDir())
	if root == "" {
		return ""
	}
	return filepath.Join(root, "bot", "remote-task")
}

func NewDefaultRemoteStore() (*RemoteStore, error) {
	dir := RemoteTaskStoreDir()
	if dir == "" {
		return nil, errors.New("remote task store directory is unavailable")
	}
	return NewRemoteStore(dir)
}

func NewRemoteStore(dir string) (*RemoteStore, error) {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return nil, errors.New("remote task store directory is required")
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return nil, err
	}
	store := &RemoteStore{
		dir:       dir,
		statePath: filepath.Join(dir, "state.json"),
		auditPath: filepath.Join(dir, "audit.jsonl"),
		now:       func() time.Time { return time.Now().UTC() },
		state: remoteStoreState{
			Bindings:    map[string]RemoteBinding{},
			Tasks:       map[string]RemoteTaskRecord{},
			Receipts:    map[string]RemoteTaskReceipt{},
			Idempotency: map[string]string{},
		},
	}
	if err := store.load(); err != nil {
		return nil, err
	}
	return store, nil
}

func (s *RemoteStore) load() error {
	data, err := os.ReadFile(s.statePath)
	if errors.Is(err, os.ErrNotExist) {
		return nil
	}
	if err != nil {
		return err
	}
	if err := json.Unmarshal(data, &s.state); err != nil {
		return fmt.Errorf("load remote task store: %w", err)
	}
	if s.state.Bindings == nil {
		s.state.Bindings = map[string]RemoteBinding{}
	}
	if s.state.Tasks == nil {
		s.state.Tasks = map[string]RemoteTaskRecord{}
	}
	if s.state.Receipts == nil {
		s.state.Receipts = map[string]RemoteTaskReceipt{}
	}
	if s.state.Idempotency == nil {
		s.state.Idempotency = map[string]string{}
	}
	return nil
}

func (s *RemoteStore) saveLocked() error {
	data, err := json.MarshalIndent(s.state, "", "  ")
	if err != nil {
		return err
	}
	return fileutil.AtomicWriteFile(s.statePath, append(data, '\n'), 0o600)
}

func (s *RemoteStore) EnsureBinding(candidate RemoteBinding) (RemoteBinding, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	candidate = normalizeRemoteBinding(candidate)
	if candidate.Endpoint.Platform == "" || candidate.Endpoint.ChatID == "" || candidate.ActorID == "" {
		return RemoteBinding{}, false, errors.New("remote binding requires exact endpoint and actor")
	}
	if candidate.ID == "" {
		candidate.ID = stableRemoteID("binding", candidate.Endpoint.key(), candidate.ActorID)
	}
	if current, ok := s.state.Bindings[candidate.ID]; ok {
		current = bindingStatusAt(current, now)
		if current.Status != RemoteBindingActive {
			s.state.Bindings[current.ID] = current
			_ = s.saveLocked()
			return current, false, fmt.Errorf("remote binding is %s", current.Status)
		}
		candidate.CreatedAt = current.CreatedAt
		candidate.UpdatedAt = now
		candidate.Status = RemoteBindingActive
		s.state.Bindings[candidate.ID] = candidate
		if err := s.saveLocked(); err != nil {
			return RemoteBinding{}, false, err
		}
		return candidate, false, s.appendAuditLocked(RemoteAuditEntry{ActorID: candidate.ActorID, BindingID: candidate.ID, Action: "binding.refresh", Decision: "allow", Endpoint: candidate.Endpoint})
	}
	if !candidate.ExpiresAt.IsZero() && !now.Before(candidate.ExpiresAt) {
		candidate.Status = RemoteBindingExpired
		candidate.CreatedAt = now
		candidate.UpdatedAt = now
		s.state.Bindings[candidate.ID] = candidate
		if err := s.saveLocked(); err != nil {
			return RemoteBinding{}, false, err
		}
		_ = s.appendAuditLocked(RemoteAuditEntry{ActorID: candidate.ActorID, BindingID: candidate.ID, Action: "binding.create", Decision: "deny", Reason: "binding expired", Endpoint: candidate.Endpoint})
		return candidate, false, errors.New("remote binding is expired")
	}
	candidate.Status = RemoteBindingActive
	candidate.CreatedAt = now
	candidate.UpdatedAt = now
	s.state.Bindings[candidate.ID] = candidate
	if err := s.saveLocked(); err != nil {
		return RemoteBinding{}, false, err
	}
	return candidate, true, s.appendAuditLocked(RemoteAuditEntry{ActorID: candidate.ActorID, BindingID: candidate.ID, Action: "binding.create", Decision: "allow", Endpoint: candidate.Endpoint})
}

func (s *RemoteStore) BeginTask(bindingID string, spec RemoteTaskSpec) (RemoteTaskRecord, bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	now := s.now()
	binding, ok := s.state.Bindings[strings.TrimSpace(bindingID)]
	if !ok {
		return RemoteTaskRecord{}, false, errors.New("remote binding not found")
	}
	binding = bindingStatusAt(binding, now)
	if binding.Status != RemoteBindingActive {
		s.state.Bindings[binding.ID] = binding
		_ = s.saveLocked()
		return RemoteTaskRecord{}, false, fmt.Errorf("remote binding is %s", binding.Status)
	}
	spec = normalizeRemoteTaskSpec(spec)
	if spec.Endpoint.key() != binding.Endpoint.key() || spec.ActorID != binding.ActorID {
		return RemoteTaskRecord{}, false, errors.New("remote task endpoint or actor does not match binding")
	}
	if spec.MessageID == "" {
		return RemoteTaskRecord{}, false, errors.New("remote task message id is required")
	}
	if err := authorizeRemoteTaskSpec(binding, spec); err != nil {
		_ = s.appendAuditLocked(RemoteAuditEntry{ActorID: spec.ActorID, BindingID: binding.ID, Action: "task.begin", Decision: "deny", Reason: err.Error(), Endpoint: spec.Endpoint})
		return RemoteTaskRecord{}, false, err
	}
	idempotencyKey := spec.Endpoint.key() + "\x00" + spec.MessageID
	if taskID := s.state.Idempotency[idempotencyKey]; taskID != "" {
		current := s.state.Tasks[taskID]
		if current.BindingID != binding.ID || current.Spec.ActorID != spec.ActorID {
			return RemoteTaskRecord{}, false, errors.New("remote message id is already bound to another actor")
		}
		return current, false, nil
	}
	record := RemoteTaskRecord{
		ID:        randomRemoteID("task"),
		BindingID: binding.ID,
		Spec:      spec,
		Status:    RemoteTaskAccepted,
		CreatedAt: now,
		UpdatedAt: now,
	}
	s.state.Tasks[record.ID] = record
	s.state.Idempotency[idempotencyKey] = record.ID
	s.state.Receipts[record.ID] = pendingRemoteReceipt(record, now)
	if err := s.saveLocked(); err != nil {
		return RemoteTaskRecord{}, false, err
	}
	return record, true, s.appendAuditLocked(RemoteAuditEntry{ActorID: spec.ActorID, BindingID: binding.ID, TaskID: record.ID, Action: "task.begin", Decision: "allow", Endpoint: spec.Endpoint})
}

func (s *RemoteStore) TransitionTask(taskID string, next RemoteTaskStatus, rawError string) (RemoteTaskRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.state.Tasks[strings.TrimSpace(taskID)]
	if !ok {
		return RemoteTaskRecord{}, errors.New("remote task not found")
	}
	if !remoteTaskTransitionAllowed(record.Status, next) {
		return RemoteTaskRecord{}, fmt.Errorf("invalid remote task transition %s -> %s", record.Status, next)
	}
	now := s.now()
	record.Status = next
	record.UpdatedAt = now
	if next == RemoteTaskRunning && record.StartedAt.IsZero() {
		record.StartedAt = now
	}
	if remoteTaskTerminal(next) {
		record.EndedAt = now
	}
	record.Error = sanitizeRemoteText(rawError)
	s.state.Tasks[record.ID] = record
	receipt := s.state.Receipts[record.ID]
	receipt.Status = next
	receipt.Runtime = remoteTaskRuntimeLabel(next)
	receipt.Error = record.Error
	receipt.UpdatedAt = now
	s.state.Receipts[record.ID] = receipt
	if err := s.saveLocked(); err != nil {
		return RemoteTaskRecord{}, err
	}
	return record, s.appendAuditLocked(RemoteAuditEntry{ActorID: record.Spec.ActorID, BindingID: record.BindingID, TaskID: record.ID, Action: "task.transition", Decision: string(next), Reason: record.Error, Endpoint: record.Spec.Endpoint})
}

func (s *RemoteStore) RequestCancel(taskID, bindingID, actorID string) (RemoteTaskRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.state.Tasks[strings.TrimSpace(taskID)]
	if !ok {
		return RemoteTaskRecord{}, errors.New("remote task not found")
	}
	if record.BindingID != strings.TrimSpace(bindingID) || record.Spec.ActorID != strings.TrimSpace(actorID) {
		_ = s.appendAuditLocked(RemoteAuditEntry{ActorID: strings.TrimSpace(actorID), BindingID: strings.TrimSpace(bindingID), TaskID: record.ID, Action: "task.cancel", Decision: "deny", Reason: "task owner mismatch", Endpoint: record.Spec.Endpoint})
		return RemoteTaskRecord{}, errors.New("remote task is owned by another binding or actor")
	}
	if !remoteTaskTransitionAllowed(record.Status, RemoteTaskCancelRequested) {
		return RemoteTaskRecord{}, fmt.Errorf("task in status %s cannot be cancelled", record.Status)
	}
	now := s.now()
	record.Status = RemoteTaskCancelRequested
	record.UpdatedAt = now
	s.state.Tasks[record.ID] = record
	receipt := s.state.Receipts[record.ID]
	receipt.Status = record.Status
	receipt.Runtime = "cancellation requested"
	receipt.UpdatedAt = now
	s.state.Receipts[record.ID] = receipt
	if err := s.saveLocked(); err != nil {
		return RemoteTaskRecord{}, err
	}
	return record, s.appendAuditLocked(RemoteAuditEntry{ActorID: record.Spec.ActorID, BindingID: record.BindingID, TaskID: record.ID, Action: "task.cancel", Decision: "allow", Endpoint: record.Spec.Endpoint})
}

func (s *RemoteStore) RevokeBinding(bindingID string) (RemoteBinding, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	binding, ok := s.state.Bindings[strings.TrimSpace(bindingID)]
	if !ok {
		return RemoteBinding{}, errors.New("remote binding not found")
	}
	now := s.now()
	binding.Status = RemoteBindingRevoked
	binding.RevokedAt = now
	binding.UpdatedAt = now
	s.state.Bindings[binding.ID] = binding
	for id, task := range s.state.Tasks {
		if task.BindingID != binding.ID || remoteTaskTerminal(task.Status) || task.Status == RemoteTaskCancelRequested {
			continue
		}
		next := RemoteTaskCancelRequested
		if task.Status == RemoteTaskAccepted || task.Status == RemoteTaskQueued {
			next = RemoteTaskRevoked
		}
		if remoteTaskTransitionAllowed(task.Status, next) {
			task.Status = next
			task.UpdatedAt = now
			if remoteTaskTerminal(next) {
				task.EndedAt = now
			}
			s.state.Tasks[id] = task
			receipt := s.state.Receipts[id]
			receipt.Status = next
			if next == RemoteTaskRevoked {
				receipt.Runtime = "revoked"
			} else {
				receipt.Runtime = "revocation cancellation requested"
			}
			receipt.UpdatedAt = now
			s.state.Receipts[id] = receipt
		}
	}
	if err := s.saveLocked(); err != nil {
		return RemoteBinding{}, err
	}
	return binding, s.appendAuditLocked(RemoteAuditEntry{ActorID: binding.ActorID, BindingID: binding.ID, Action: "binding.revoke", Decision: "allow", Endpoint: binding.Endpoint})
}

func (s *RemoteStore) Task(taskID string) (RemoteTaskRecord, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record, ok := s.state.Tasks[strings.TrimSpace(taskID)]
	if !ok {
		return RemoteTaskRecord{}, errors.New("remote task not found")
	}
	return record, nil
}

func (s *RemoteStore) ListBindings() []RemoteBinding {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]RemoteBinding, 0, len(s.state.Bindings))
	for _, binding := range s.state.Bindings {
		out = append(out, bindingStatusAt(binding, s.now()))
	}
	return out
}

func (s *RemoteStore) Binding(bindingID string) (RemoteBinding, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	binding, ok := s.state.Bindings[strings.TrimSpace(bindingID)]
	if !ok {
		return RemoteBinding{}, errors.New("remote binding not found")
	}
	return bindingStatusAt(binding, s.now()), nil
}

func (s *RemoteStore) ListTasks() []RemoteTaskRecord {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]RemoteTaskRecord, 0, len(s.state.Tasks))
	for _, task := range s.state.Tasks {
		out = append(out, task)
	}
	return out
}

func (s *RemoteStore) TaskForMessage(endpoint RemoteEndpoint, messageID string) (RemoteTaskRecord, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	key := endpoint.key() + "\x00" + strings.TrimSpace(messageID)
	taskID := s.state.Idempotency[key]
	if taskID == "" {
		return RemoteTaskRecord{}, false
	}
	task, ok := s.state.Tasks[taskID]
	return task, ok
}

func (s *RemoteStore) ActiveTasksForBinding(bindingID string) []RemoteTaskRecord {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := []RemoteTaskRecord{}
	for _, task := range s.state.Tasks {
		if task.BindingID == strings.TrimSpace(bindingID) && !remoteTaskTerminal(task.Status) {
			out = append(out, task)
		}
	}
	return out
}

func (s *RemoteStore) Receipt(taskID string) (RemoteTaskReceipt, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	receipt, ok := s.state.Receipts[strings.TrimSpace(taskID)]
	if !ok {
		return RemoteTaskReceipt{}, errors.New("remote task receipt not found")
	}
	return receipt, nil
}

func (s *RemoteStore) ListAudit() ([]RemoteAuditEntry, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	f, err := os.Open(s.auditPath)
	if errors.Is(err, os.ErrNotExist) {
		return []RemoteAuditEntry{}, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()
	entries := []RemoteAuditEntry{}
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		var entry RemoteAuditEntry
		if err := json.Unmarshal(scanner.Bytes(), &entry); err != nil {
			return nil, fmt.Errorf("load remote audit: %w", err)
		}
		entries = append(entries, entry)
	}
	return entries, scanner.Err()
}

func (s *RemoteStore) RecordAudit(entry RemoteAuditEntry) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.appendAuditLocked(entry)
}

func (s *RemoteStore) appendAuditLocked(entry RemoteAuditEntry) error {
	entry.ID = randomRemoteID("audit")
	entry.Timestamp = s.now()
	entry.ActorID = strings.TrimSpace(entry.ActorID)
	entry.BindingID = strings.TrimSpace(entry.BindingID)
	entry.TaskID = strings.TrimSpace(entry.TaskID)
	entry.Action = strings.TrimSpace(entry.Action)
	entry.Decision = strings.TrimSpace(entry.Decision)
	entry.Reason = sanitizeRemoteText(entry.Reason)
	data, err := json.Marshal(entry)
	if err != nil {
		return err
	}
	f, err := os.OpenFile(s.auditPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600)
	if err != nil {
		return err
	}
	if err := f.Chmod(0o600); err != nil {
		_ = f.Close()
		return err
	}
	if _, err := f.Write(append(data, '\n')); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}

func normalizeRemoteBinding(binding RemoteBinding) RemoteBinding {
	binding.ActorID = strings.TrimSpace(binding.ActorID)
	binding.Endpoint.ConnectionID = strings.TrimSpace(binding.Endpoint.ConnectionID)
	binding.Endpoint.Domain = strings.TrimSpace(binding.Endpoint.Domain)
	binding.Endpoint.ChatID = strings.TrimSpace(binding.Endpoint.ChatID)
	binding.Endpoint.ThreadID = strings.TrimSpace(binding.Endpoint.ThreadID)
	binding.Roles = uniqueTrimmed(binding.Roles)
	binding.WorkspaceRoots = uniqueTrimmed(binding.WorkspaceRoots)
	binding.ProjectIDs = uniqueTrimmed(binding.ProjectIDs)
	binding.AgentProfileIDs = uniqueTrimmed(binding.AgentProfileIDs)
	binding.PermissionCeiling = normalizeRemotePermission(binding.PermissionCeiling)
	if binding.PermissionCeiling == "" {
		binding.PermissionCeiling = RemotePermissionAsk
	}
	return binding
}

func normalizeRemoteTaskSpec(spec RemoteTaskSpec) RemoteTaskSpec {
	spec.ActorID = strings.TrimSpace(spec.ActorID)
	spec.MessageID = strings.TrimSpace(spec.MessageID)
	spec.Goal = strings.TrimSpace(spec.Goal)
	spec.WorkspaceRoot = strings.TrimSpace(spec.WorkspaceRoot)
	spec.ProjectID = strings.TrimSpace(spec.ProjectID)
	spec.AgentProfileID = strings.TrimSpace(spec.AgentProfileID)
	spec.PermissionMode = normalizeRemotePermission(spec.PermissionMode)
	return spec
}

func authorizeRemoteTaskSpec(binding RemoteBinding, spec RemoteTaskSpec) error {
	if len(binding.WorkspaceRoots) > 0 && !containsTrimmed(binding.WorkspaceRoots, spec.WorkspaceRoot) {
		return errors.New("remote task workspace exceeds binding")
	}
	if len(binding.ProjectIDs) > 0 && !containsTrimmed(binding.ProjectIDs, spec.ProjectID) {
		return errors.New("remote task project exceeds binding")
	}
	if len(binding.AgentProfileIDs) > 0 && !containsTrimmed(binding.AgentProfileIDs, spec.AgentProfileID) {
		return errors.New("remote task agent profile exceeds binding")
	}
	if remotePermissionRank(spec.PermissionMode) > remotePermissionRank(binding.PermissionCeiling) {
		return errors.New("remote task permission exceeds binding ceiling")
	}
	return nil
}

func bindingStatusAt(binding RemoteBinding, now time.Time) RemoteBinding {
	if binding.Status == RemoteBindingActive && !binding.ExpiresAt.IsZero() && !now.Before(binding.ExpiresAt) {
		binding.Status = RemoteBindingExpired
		binding.UpdatedAt = now
	}
	return binding
}

func normalizeRemotePermission(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case RemotePermissionRead:
		return RemotePermissionRead
	case RemotePermissionAsk:
		return RemotePermissionAsk
	case RemotePermissionAuto:
		return RemotePermissionAuto
	case RemotePermissionYolo, "full", "full-access", "bypass":
		return RemotePermissionYolo
	default:
		return ""
	}
}

func remotePermissionRank(value string) int {
	switch normalizeRemotePermission(value) {
	case RemotePermissionRead:
		return 0
	case RemotePermissionAsk:
		return 1
	case RemotePermissionAuto:
		return 2
	case RemotePermissionYolo:
		return 3
	default:
		return 99
	}
}

func uniqueTrimmed(values []string) []string {
	if len(values) == 0 {
		return nil
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		out = append(out, value)
	}
	return out
}

func containsTrimmed(values []string, want string) bool {
	want = strings.TrimSpace(want)
	for _, value := range values {
		if strings.TrimSpace(value) == want {
			return true
		}
	}
	return false
}

func pendingRemoteReceipt(task RemoteTaskRecord, now time.Time) RemoteTaskReceipt {
	return RemoteTaskReceipt{
		TaskID:       task.ID,
		Status:       task.Status,
		Goal:         sanitizeRemoteText(task.Spec.Goal),
		Runtime:      "pending",
		Changes:      RemoteEvidence{Status: "pending"},
		Verification: RemoteEvidence{Status: "pending"},
		Artifacts:    RemoteEvidence{Status: "pending"},
		Legacy:       task.Spec.Legacy,
		UpdatedAt:    now,
	}
}

var remoteSecretPattern = regexp.MustCompile(`(?i)\b(token|secret|password|api[_-]?key|access[_-]?token)\s*[:=]\s*[^\s,;]+`)

func sanitizeRemoteText(value string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return ""
	}
	value = remoteSecretPattern.ReplaceAllString(value, "$1=_redacted_")
	parts := strings.Fields(value)
	for i, part := range parts {
		trimmed := strings.Trim(part, `"'(),;`)
		if strings.HasPrefix(trimmed, "/") || (len(trimmed) >= 3 && ((trimmed[0] >= 'A' && trimmed[0] <= 'Z') || (trimmed[0] >= 'a' && trimmed[0] <= 'z')) && trimmed[1] == ':' && (trimmed[2] == '\\' || trimmed[2] == '/')) {
			parts[i] = "_redacted_path_"
		}
	}
	return strings.Join(parts, " ")
}

func remoteTaskTransitionAllowed(from, to RemoteTaskStatus) bool {
	allowed := map[RemoteTaskStatus]map[RemoteTaskStatus]bool{
		RemoteTaskAccepted: {
			RemoteTaskQueued:          true,
			RemoteTaskCancelRequested: true,
			RemoteTaskRevoked:         true,
			RemoteTaskDisconnected:    true,
		},
		RemoteTaskQueued: {
			RemoteTaskRunning:         true,
			RemoteTaskCancelRequested: true,
			RemoteTaskRevoked:         true,
			RemoteTaskDisconnected:    true,
		},
		RemoteTaskRunning: {
			RemoteTaskAwaitingApproval: true,
			RemoteTaskAwaitingInput:    true,
			RemoteTaskSucceeded:        true,
			RemoteTaskFailed:           true,
			RemoteTaskCancelRequested:  true,
			RemoteTaskRevoked:          true,
			RemoteTaskDisconnected:     true,
		},
		RemoteTaskAwaitingApproval: {
			RemoteTaskRunning:         true,
			RemoteTaskSucceeded:       true,
			RemoteTaskFailed:          true,
			RemoteTaskCancelRequested: true,
			RemoteTaskRevoked:         true,
			RemoteTaskDisconnected:    true,
		},
		RemoteTaskAwaitingInput: {
			RemoteTaskRunning:         true,
			RemoteTaskSucceeded:       true,
			RemoteTaskFailed:          true,
			RemoteTaskCancelRequested: true,
			RemoteTaskRevoked:         true,
			RemoteTaskDisconnected:    true,
		},
		RemoteTaskCancelRequested: {
			RemoteTaskCancelled:    true,
			RemoteTaskRevoked:      true,
			RemoteTaskDisconnected: true,
		},
	}
	return allowed[from][to]
}

func remoteTaskTerminal(status RemoteTaskStatus) bool {
	switch status {
	case RemoteTaskSucceeded, RemoteTaskFailed, RemoteTaskCancelled, RemoteTaskRevoked, RemoteTaskDisconnected:
		return true
	default:
		return false
	}
}

func remoteTaskRuntimeLabel(status RemoteTaskStatus) string {
	switch status {
	case RemoteTaskAccepted:
		return "accepted"
	case RemoteTaskQueued:
		return "queued"
	case RemoteTaskRunning:
		return "running"
	case RemoteTaskAwaitingApproval:
		return "awaiting approval"
	case RemoteTaskAwaitingInput:
		return "awaiting input"
	case RemoteTaskSucceeded:
		return "completed"
	case RemoteTaskFailed:
		return "failed"
	case RemoteTaskCancelRequested:
		return "cancellation requested"
	case RemoteTaskCancelled:
		return "cancelled"
	case RemoteTaskRevoked:
		return "revoked"
	case RemoteTaskDisconnected:
		return "disconnected"
	default:
		return "pending"
	}
}

func stableRemoteID(prefix string, values ...string) string {
	sum := sha256.Sum256([]byte(strings.Join(values, "\x00")))
	return prefix + "-" + hex.EncodeToString(sum[:12])
}

func randomRemoteID(prefix string) string {
	var raw [12]byte
	if _, err := rand.Read(raw[:]); err == nil {
		return prefix + "-" + hex.EncodeToString(raw[:])
	}
	return stableRemoteID(prefix, fmt.Sprint(time.Now().UnixNano()))
}
