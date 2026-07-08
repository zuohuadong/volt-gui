// Package usage records and summarizes local token usage telemetry.
package usage

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	"voltui/internal/config"
	"voltui/internal/event"
	"voltui/internal/evidence"
)

const SchemaVersion = 1

var appendMu sync.Mutex

// Record is one content-free usage ledger entry. It intentionally stores only
// aggregate token/cost fields and local routing metadata, never prompts, tool
// output, API keys, or full workspace paths.
type Record struct {
	SchemaVersion    int       `json:"schema_version"`
	Timestamp        time.Time `json:"timestamp"`
	Surface          string    `json:"surface,omitempty"`
	Model            string    `json:"model,omitempty"`
	UsageSource      string    `json:"usage_source,omitempty"`
	SessionID        string    `json:"session_id,omitempty"`
	Workspace        string    `json:"workspace,omitempty"`
	WorkspaceHash    string    `json:"workspace_hash,omitempty"`
	PromptTokens     int       `json:"prompt_tokens"`
	CompletionTokens int       `json:"completion_tokens"`
	TotalTokens      int       `json:"total_tokens"`
	ReasoningTokens  int       `json:"reasoning_tokens,omitempty"`
	CacheHitTokens   int       `json:"cache_hit_tokens"`
	CacheMissTokens  int       `json:"cache_miss_tokens"`
	Cost             float64   `json:"cost,omitempty"`
	Currency         string    `json:"currency,omitempty"`
}

// Metadata supplies local, content-free context for a usage event.
type Metadata struct {
	Surface       string
	Model         func() string
	SessionPath   func() string
	WorkspaceRoot func() string
	Now           func() time.Time
	LedgerPath    func() string
}

// RecordingSink forwards events to Inner and appends usage events to the local
// ledger. Recording failures are deliberately non-fatal: usage stats must never
// break an agent run.
type RecordingSink struct {
	Inner event.Sink
	Meta  Metadata
}

func NewRecordingSink(inner event.Sink, meta Metadata) event.Sink {
	if inner == nil {
		inner = event.Discard
	}
	return &RecordingSink{Inner: inner, Meta: meta}
}

func (s *RecordingSink) Emit(e event.Event) {
	if s == nil {
		return
	}
	if s.Inner != nil {
		s.Inner.Emit(e)
	}
	_ = RecordEvent(e, s.Meta)
}

func (s *RecordingSink) RecordReadinessAudit(a evidence.ReadinessAudit) {
	if s == nil || s.Inner == nil {
		return
	}
	if rs, ok := s.Inner.(event.ReadinessAuditSink); ok {
		rs.RecordReadinessAudit(a)
	}
}

// LedgerPath returns the default local usage ledger path.
func LedgerPath() string {
	base := config.MemoryUserDir()
	if strings.TrimSpace(base) == "" {
		return ""
	}
	return filepath.Join(base, "usage", "usage.jsonl")
}

// RecordEvent converts a runtime usage event into a ledger entry.
func RecordEvent(e event.Event, meta Metadata) error {
	if e.Kind != event.Usage || e.Usage == nil {
		return nil
	}
	rec := RecordFromEvent(e, meta)
	if !rec.hasTokensOrCost() {
		return nil
	}
	path := ""
	if meta.LedgerPath != nil {
		path = meta.LedgerPath()
	}
	return AppendRecord(path, rec)
}

// RecordFromEvent returns the ledger shape for a runtime usage event.
func RecordFromEvent(e event.Event, meta Metadata) Record {
	now := time.Now().UTC()
	if meta.Now != nil {
		if t := meta.Now(); !t.IsZero() {
			now = t.UTC()
		}
	}
	rec := Record{
		SchemaVersion:    SchemaVersion,
		Timestamp:        now,
		Surface:          cleanLabel(meta.Surface),
		UsageSource:      cleanLabel(e.UsageSource),
		PromptTokens:     e.Usage.PromptTokens,
		CompletionTokens: e.Usage.CompletionTokens,
		TotalTokens:      e.Usage.TotalTokens,
		ReasoningTokens:  e.Usage.ReasoningTokens,
		CacheHitTokens:   e.Usage.CacheHitTokens,
		CacheMissTokens:  e.Usage.CacheMissTokens,
	}
	if rec.UsageSource == "" {
		rec.UsageSource = event.UsageSourceExecutor
	}
	if rec.TotalTokens == 0 {
		rec.TotalTokens = rec.PromptTokens + rec.CompletionTokens
	}
	if meta.Model != nil {
		rec.Model = cleanLabel(meta.Model())
	}
	if meta.SessionPath != nil {
		rec.SessionID = sessionID(meta.SessionPath())
	}
	if meta.WorkspaceRoot != nil {
		rec.Workspace, rec.WorkspaceHash = workspaceLabels(meta.WorkspaceRoot())
	}
	if e.Pricing != nil {
		rec.Cost = e.Pricing.Cost(e.Usage)
		rec.Currency = e.Pricing.Symbol()
	}
	return rec
}

func AppendRecord(path string, rec Record) error {
	if strings.TrimSpace(path) == "" {
		path = LedgerPath()
	}
	if strings.TrimSpace(path) == "" {
		return nil
	}
	if rec.SchemaVersion == 0 {
		rec.SchemaVersion = SchemaVersion
	}
	if rec.Timestamp.IsZero() {
		rec.Timestamp = time.Now().UTC()
	}
	line, err := json.Marshal(rec)
	if err != nil {
		return fmt.Errorf("encode usage record: %w", err)
	}
	line = append(line, '\n')
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	appendMu.Lock()
	defer appendMu.Unlock()
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o644)
	if err != nil {
		return err
	}
	if _, err := f.Write(line); err != nil {
		_ = f.Close()
		return err
	}
	return f.Close()
}

type Query struct {
	Since   time.Time
	Until   time.Time
	Surface string
}

type Totals struct {
	Requests         int                `json:"requests"`
	PromptTokens     int                `json:"prompt_tokens"`
	CompletionTokens int                `json:"completion_tokens"`
	TotalTokens      int                `json:"total_tokens"`
	ReasoningTokens  int                `json:"reasoning_tokens,omitempty"`
	CacheHitTokens   int                `json:"cache_hit_tokens"`
	CacheMissTokens  int                `json:"cache_miss_tokens"`
	CostByCurrency   map[string]float64 `json:"cost_by_currency,omitempty"`
}

type Bucket struct {
	Key    string `json:"key"`
	Totals Totals `json:"totals"`
}

type Report struct {
	GeneratedAt time.Time  `json:"generated_at"`
	Path        string     `json:"path,omitempty"`
	Since       *time.Time `json:"since,omitempty"`
	Until       *time.Time `json:"until,omitempty"`
	Records     int        `json:"records"`
	Skipped     int        `json:"skipped"`
	Totals      Totals     `json:"totals"`
	ByDay       []Bucket   `json:"by_day,omitempty"`
	ByModel     []Bucket   `json:"by_model,omitempty"`
	BySource    []Bucket   `json:"by_source,omitempty"`
	BySurface   []Bucket   `json:"by_surface,omitempty"`
}

func LoadReport(path string, q Query) (Report, error) {
	if strings.TrimSpace(path) == "" {
		path = LedgerPath()
	}
	report := Report{GeneratedAt: time.Now().UTC(), Path: path, Since: timePtr(q.Since), Until: timePtr(q.Until)}
	if strings.TrimSpace(path) == "" {
		return report, nil
	}
	f, err := os.Open(path)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return report, nil
		}
		return report, err
	}
	defer f.Close()

	byDay := map[string]*Totals{}
	byModel := map[string]*Totals{}
	bySource := map[string]*Totals{}
	bySurface := map[string]*Totals{}

	sc := bufio.NewScanner(f)
	sc.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for sc.Scan() {
		var rec Record
		if err := json.Unmarshal(sc.Bytes(), &rec); err != nil {
			report.Skipped++
			continue
		}
		if !includeRecord(rec, q) {
			continue
		}
		report.Records++
		report.Totals.Add(rec)
		addBucket(byDay, rec.Timestamp.Local().Format("2006-01-02"), rec)
		addBucket(byModel, labelOr(rec.Model, "unknown"), rec)
		addBucket(bySource, labelOr(rec.UsageSource, event.UsageSourceExecutor), rec)
		addBucket(bySurface, labelOr(rec.Surface, "unknown"), rec)
	}
	if err := sc.Err(); err != nil {
		return report, err
	}
	report.ByDay = bucketsByKey(byDay)
	report.ByModel = bucketsByTotal(byModel)
	report.BySource = bucketsByTotal(bySource)
	report.BySurface = bucketsByTotal(bySurface)
	return report, nil
}

func timePtr(t time.Time) *time.Time {
	if t.IsZero() {
		return nil
	}
	return &t
}

func (t *Totals) Add(rec Record) {
	if t == nil {
		return
	}
	t.Requests++
	t.PromptTokens += rec.PromptTokens
	t.CompletionTokens += rec.CompletionTokens
	total := rec.TotalTokens
	if total == 0 {
		total = rec.PromptTokens + rec.CompletionTokens
	}
	t.TotalTokens += total
	t.ReasoningTokens += rec.ReasoningTokens
	t.CacheHitTokens += rec.CacheHitTokens
	t.CacheMissTokens += rec.CacheMissTokens
	if rec.Cost != 0 {
		if t.CostByCurrency == nil {
			t.CostByCurrency = map[string]float64{}
		}
		t.CostByCurrency[labelOr(rec.Currency, "unknown")] += rec.Cost
	}
}

func includeRecord(rec Record, q Query) bool {
	if rec.SchemaVersion > SchemaVersion {
		return false
	}
	if !q.Since.IsZero() && rec.Timestamp.Before(q.Since) {
		return false
	}
	if !q.Until.IsZero() && !rec.Timestamp.Before(q.Until) {
		return false
	}
	if strings.TrimSpace(q.Surface) != "" && rec.Surface != strings.TrimSpace(q.Surface) {
		return false
	}
	return true
}

func addBucket(m map[string]*Totals, key string, rec Record) {
	key = labelOr(key, "unknown")
	t := m[key]
	if t == nil {
		t = &Totals{}
		m[key] = t
	}
	t.Add(rec)
}

func bucketsByKey(m map[string]*Totals) []Bucket {
	out := make([]Bucket, 0, len(m))
	for key, totals := range m {
		out = append(out, Bucket{Key: key, Totals: *totals})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Key < out[j].Key })
	return out
}

func bucketsByTotal(m map[string]*Totals) []Bucket {
	out := bucketsByKey(m)
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Totals.TotalTokens == out[j].Totals.TotalTokens {
			return out[i].Key < out[j].Key
		}
		return out[i].Totals.TotalTokens > out[j].Totals.TotalTokens
	})
	return out
}

func cleanLabel(value string) string {
	return strings.TrimSpace(value)
}

func labelOr(value, fallback string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return fallback
	}
	return value
}

func sessionID(path string) string {
	path = strings.TrimSpace(path)
	if path == "" {
		return ""
	}
	return strings.TrimSuffix(filepath.Base(path), ".jsonl")
}

func workspaceLabels(root string) (name, hash string) {
	root = strings.TrimSpace(root)
	if root == "" {
		return "", ""
	}
	if abs, err := filepath.Abs(root); err == nil {
		root = abs
	}
	name = filepath.Base(filepath.Clean(root))
	sum := sha256.Sum256([]byte(filepath.Clean(root)))
	hash = hex.EncodeToString(sum[:8])
	return name, hash
}

func (r Record) hasTokensOrCost() bool {
	return r.PromptTokens != 0 ||
		r.CompletionTokens != 0 ||
		r.TotalTokens != 0 ||
		r.ReasoningTokens != 0 ||
		r.CacheHitTokens != 0 ||
		r.CacheMissTokens != 0 ||
		r.Cost != 0
}
