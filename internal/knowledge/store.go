package knowledge

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"hash/fnv"
	"math"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	_ "modernc.org/sqlite"
	_ "modernc.org/sqlite/vec"
)

const (
	defaultChunkRunes = 1200
	defaultOverlap    = 160
	vectorDimensions  = 16
)

type Store struct {
	db           *sql.DB
	path         string
	mu           sync.Mutex
	ftsAvailable bool
	vecAvailable bool
	lastError    string
}

type ImportInput struct {
	ID          string
	Title       string
	Type        string
	Source      string
	Tags        string
	Description string
	FileName    string
	FilePath    string
	MimeType    string
	FileSize    int64
	Content     string
}

type Document struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Type        string `json:"type"`
	Source      string `json:"source,omitempty"`
	Tags        string `json:"tags,omitempty"`
	Description string `json:"description,omitempty"`
	FileName    string `json:"fileName,omitempty"`
	FilePath    string `json:"filePath,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
	FileSize    int64  `json:"fileSize,omitempty"`
	ContentHash string `json:"contentHash,omitempty"`
	Status      string `json:"status"`
	Count       int    `json:"count"`
	ChunkCount  int    `json:"chunkCount"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
	IndexedAt   string `json:"indexedAt,omitempty"`
	Error       string `json:"error,omitempty"`
}

type SearchOptions struct {
	Limit int
}

type SearchResult struct {
	DocumentID string  `json:"documentId"`
	ChunkID    string  `json:"chunkId"`
	Title      string  `json:"title"`
	Type       string  `json:"type"`
	Source     string  `json:"source,omitempty"`
	Tags       string  `json:"tags,omitempty"`
	FileName   string  `json:"fileName,omitempty"`
	FilePath   string  `json:"filePath,omitempty"`
	Snippet    string  `json:"snippet"`
	Score      float64 `json:"score"`
	Match      string  `json:"match"`
	UpdatedAt  string  `json:"updatedAt,omitempty"`
}

type Status struct {
	Path      string `json:"path"`
	SQLite    bool   `json:"sqlite"`
	FTS5      bool   `json:"fts5"`
	SQLiteVec bool   `json:"sqliteVec"`
	Documents int    `json:"documents"`
	Chunks    int    `json:"chunks"`
	Vectors   int    `json:"vectors"`
	LastError string `json:"lastError,omitempty"`
	UpdatedAt string `json:"updatedAt"`
}

func Open(path string) (*Store, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, errors.New("knowledge database path is required")
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	store := &Store{db: db, path: path}
	if err := store.migrate(context.Background()); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

// OpenReadOnly opens an existing knowledge database without running migrations
// and enables SQLite's connection-local query_only guard. Agent read tools use
// this path so their ReadOnly contract cannot mutate documents or schema.
func OpenReadOnly(path string) (*Store, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, errors.New("knowledge database path is required")
	}
	if _, err := os.Stat(path); err != nil {
		return nil, err
	}
	db, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	db.SetMaxOpenConns(1)
	store := &Store{db: db, path: path}
	ctx := context.Background()
	if _, err := db.ExecContext(ctx, `PRAGMA query_only = ON`); err != nil {
		_ = db.Close()
		return nil, err
	}
	if err := store.loadCapabilities(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return store, nil
}

func (s *Store) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *Store) Import(ctx context.Context, input ImportInput) (Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	title := strings.TrimSpace(input.Title)
	if title == "" {
		return Document{}, errors.New("knowledge document title is required")
	}
	now := time.Now().Format(time.RFC3339)
	content := normalizeText(input.Content)
	contentHash := hashText(title + "\n" + content)
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = "kb-" + contentHash[:16]
	}
	docType := defaultText(input.Type, "文档")
	chunks := chunkText(content, defaultChunkRunes, defaultOverlap)
	status := "已索引"
	indexedAt := now
	var docError string
	if len(chunks) == 0 {
		status = "无可索引文本"
		indexedAt = ""
		docError = "文档未抽取到可索引文本"
	}
	createdAt := now
	_ = s.db.QueryRowContext(ctx, `SELECT created_at FROM documents WHERE id = ?`, id).Scan(&createdAt)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Document{}, err
	}
	rollback := func(cause error) (Document, error) {
		_ = tx.Rollback()
		s.lastError = cause.Error()
		return Document{}, cause
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM chunks_fts WHERE document_id = ?`, id); err != nil {
		return rollback(err)
	}
	if s.vecAvailable {
		if _, err := tx.ExecContext(ctx, `DELETE FROM chunk_vectors WHERE document_id = ?`, id); err != nil {
			s.vecAvailable = false
			s.lastError = err.Error()
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM chunks WHERE document_id = ?`, id); err != nil {
		return rollback(err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO documents (
			id, title, type, source, tags, description, file_name, file_path, mime_type,
			file_size, content_hash, status, chunk_count, created_at, updated_at, indexed_at, error
		) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			title = excluded.title,
			type = excluded.type,
			source = excluded.source,
			tags = excluded.tags,
			description = excluded.description,
			file_name = excluded.file_name,
			file_path = excluded.file_path,
			mime_type = excluded.mime_type,
			file_size = excluded.file_size,
			content_hash = excluded.content_hash,
			status = excluded.status,
			chunk_count = excluded.chunk_count,
			updated_at = excluded.updated_at,
			indexed_at = excluded.indexed_at,
			error = excluded.error
	`, id, title, docType, strings.TrimSpace(input.Source), strings.TrimSpace(input.Tags), strings.TrimSpace(input.Description), strings.TrimSpace(input.FileName), strings.TrimSpace(input.FilePath), strings.TrimSpace(input.MimeType), maxInt64(input.FileSize, 0), contentHash, status, len(chunks), createdAt, now, indexedAt, docError); err != nil {
		return rollback(err)
	}
	for i, chunk := range chunks {
		chunkID := fmt.Sprintf("%s:%04d", id, i)
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO chunks (id, document_id, chunk_index, content, token_count, char_start, char_end, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		`, chunkID, id, i, chunk.Content, len(embeddingTokens(chunk.Content)), chunk.Start, chunk.End, now); err != nil {
			return rollback(err)
		}
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO chunks_fts (title, body, document_id, chunk_id)
			VALUES (?, ?, ?, ?)
		`, title+" "+indexTermsText(title), chunk.Content+"\n"+indexTermsText(chunk.Content), id, chunkID); err != nil {
			return rollback(err)
		}
		if s.vecAvailable {
			if _, err := tx.ExecContext(ctx, `
				INSERT INTO chunk_vectors (embedding, document_id, chunk_id)
				VALUES (?, ?, ?)
			`, vectorJSON(embedText(chunk.Content)), id, chunkID); err != nil {
				s.vecAvailable = false
				s.lastError = err.Error()
			}
		}
	}
	if err := tx.Commit(); err != nil {
		s.lastError = err.Error()
		return Document{}, err
	}
	return Document{
		ID:          id,
		Title:       title,
		Type:        docType,
		Source:      strings.TrimSpace(input.Source),
		Tags:        strings.TrimSpace(input.Tags),
		Description: strings.TrimSpace(input.Description),
		FileName:    strings.TrimSpace(input.FileName),
		FilePath:    strings.TrimSpace(input.FilePath),
		MimeType:    strings.TrimSpace(input.MimeType),
		FileSize:    maxInt64(input.FileSize, 0),
		ContentHash: contentHash,
		Status:      status,
		Count:       len(chunks),
		ChunkCount:  len(chunks),
		CreatedAt:   createdAt,
		UpdatedAt:   now,
		IndexedAt:   indexedAt,
		Error:       docError,
	}, nil
}

func (s *Store) Search(ctx context.Context, query string, options SearchOptions) ([]SearchResult, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}
	limit := options.Limit
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	results := make([]SearchResult, 0, limit)
	seen := map[string]int{}
	ftsQuery := ftsMatchQuery(query)
	if ftsQuery != "" {
		rows, err := s.db.QueryContext(ctx, `
			SELECT f.document_id, f.chunk_id, d.title, d.type, COALESCE(d.source, ''), COALESCE(d.tags, ''), COALESCE(d.file_name, ''), COALESCE(d.file_path, ''), d.updated_at, c.content, bm25(chunks_fts) AS rank
			FROM chunks_fts f
			JOIN documents d ON d.id = f.document_id
			JOIN chunks c ON c.id = f.chunk_id
			WHERE chunks_fts MATCH ?
			ORDER BY rank
			LIMIT ?
		`, ftsQuery, limit)
		if err != nil {
			s.lastError = err.Error()
			return nil, err
		}
		defer rows.Close()
		for rows.Next() {
			result, err := scanSearchResult(rows, query, "FTS5")
			if err != nil {
				return nil, err
			}
			if _, ok := seen[result.ChunkID]; ok {
				continue
			}
			seen[result.ChunkID] = len(results)
			results = append(results, result)
		}
		if err := rows.Err(); err != nil {
			return nil, err
		}
	}
	if s.vecAvailable && len(results) < limit {
		vecRows, err := s.db.QueryContext(ctx, `
			SELECT chunk_vectors.document_id, chunk_vectors.chunk_id, d.title, d.type, COALESCE(d.source, ''), COALESCE(d.tags, ''), COALESCE(d.file_name, ''), COALESCE(d.file_path, ''), d.updated_at, c.content, distance
			FROM chunk_vectors
			JOIN documents d ON d.id = chunk_vectors.document_id
			JOIN chunks c ON c.id = chunk_vectors.chunk_id
			WHERE embedding MATCH ? AND k = ?
			ORDER BY distance
		`, vectorJSON(embedText(query)), minInt(limit, 10))
		if err != nil {
			s.vecAvailable = false
			s.lastError = err.Error()
		} else {
			defer vecRows.Close()
			for vecRows.Next() && len(results) < limit {
				result, err := scanSearchResult(vecRows, query, "sqlite-vec")
				if err != nil {
					return nil, err
				}
				if _, ok := seen[result.ChunkID]; ok {
					continue
				}
				seen[result.ChunkID] = len(results)
				results = append(results, result)
			}
			if err := vecRows.Err(); err != nil {
				return nil, err
			}
		}
	}
	sort.SliceStable(results, func(i, j int) bool {
		if results[i].Match != results[j].Match {
			return results[i].Match == "FTS5"
		}
		return results[i].Score > results[j].Score
	})
	if len(results) > limit {
		return results[:limit], nil
	}
	return results, nil
}

func (s *Store) ListDocuments(ctx context.Context) ([]Document, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	rows, err := s.db.QueryContext(ctx, `
		SELECT id, title, type, COALESCE(source, ''), COALESCE(tags, ''), COALESCE(description, ''), COALESCE(file_name, ''), COALESCE(file_path, ''), COALESCE(mime_type, ''), file_size,
			COALESCE(content_hash, ''), status, chunk_count, created_at, updated_at, COALESCE(indexed_at, ''), COALESCE(error, '')
		FROM documents
		ORDER BY updated_at DESC, title ASC
	`)
	if err != nil {
		s.lastError = err.Error()
		return nil, err
	}
	defer rows.Close()
	var docs []Document
	for rows.Next() {
		doc, err := scanDocument(rows)
		if err != nil {
			return nil, err
		}
		docs = append(docs, doc)
	}
	return docs, rows.Err()
}

// DocumentText rebuilds the indexed document body from its ordered text chunks.
func (s *Store) DocumentText(ctx context.Context, id string) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id = strings.TrimSpace(id)
	if id == "" {
		return "", errors.New("knowledge document id is required")
	}
	rows, err := s.db.QueryContext(ctx, `SELECT content FROM chunks WHERE document_id = ? ORDER BY chunk_index ASC`, id)
	if err != nil {
		s.lastError = err.Error()
		return "", err
	}
	defer rows.Close()
	chunks := make([]string, 0)
	for rows.Next() {
		var content string
		if err := rows.Scan(&content); err != nil {
			return "", err
		}
		if content = strings.TrimSpace(content); content != "" {
			chunks = append(chunks, content)
		}
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	return strings.Join(chunks, "\n\n"), nil
}

func (s *Store) DeleteDocument(ctx context.Context, id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("knowledge document id is required")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM chunks_fts WHERE document_id = ?`, id); err != nil {
		_ = tx.Rollback()
		return err
	}
	if s.vecAvailable {
		if _, err := tx.ExecContext(ctx, `DELETE FROM chunk_vectors WHERE document_id = ?`, id); err != nil {
			s.vecAvailable = false
			s.lastError = err.Error()
		}
	}
	if _, err := tx.ExecContext(ctx, `DELETE FROM documents WHERE id = ?`, id); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

func (s *Store) Status(ctx context.Context) (Status, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	status := Status{
		Path:      s.path,
		SQLite:    true,
		FTS5:      s.ftsAvailable,
		SQLiteVec: s.vecAvailable,
		LastError: s.lastError,
		UpdatedAt: time.Now().Format(time.RFC3339),
	}
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM documents`).Scan(&status.Documents)
	_ = s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM chunks`).Scan(&status.Chunks)
	if s.vecAvailable {
		if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM chunk_vectors`).Scan(&status.Vectors); err != nil {
			s.vecAvailable = false
			status.SQLiteVec = false
			status.LastError = err.Error()
		}
	}
	return status, nil
}

func (s *Store) migrate(ctx context.Context) error {
	statements := []string{
		`PRAGMA journal_mode = WAL`,
		`PRAGMA synchronous = NORMAL`,
		`PRAGMA foreign_keys = ON`,
		`CREATE TABLE IF NOT EXISTS documents (
			id TEXT PRIMARY KEY,
			title TEXT NOT NULL,
			type TEXT NOT NULL,
			source TEXT,
			tags TEXT,
			description TEXT,
			file_name TEXT,
			file_path TEXT,
			mime_type TEXT,
			file_size INTEGER NOT NULL DEFAULT 0,
			content_hash TEXT,
			status TEXT NOT NULL,
			chunk_count INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			updated_at TEXT NOT NULL,
			indexed_at TEXT,
			error TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS chunks (
			id TEXT PRIMARY KEY,
			document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
			chunk_index INTEGER NOT NULL,
			content TEXT NOT NULL,
			token_count INTEGER NOT NULL DEFAULT 0,
			char_start INTEGER NOT NULL DEFAULT 0,
			char_end INTEGER NOT NULL DEFAULT 0,
			created_at TEXT NOT NULL,
			UNIQUE(document_id, chunk_index)
		)`,
		`CREATE INDEX IF NOT EXISTS idx_knowledge_chunks_document ON chunks(document_id, chunk_index)`,
		`CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
			title,
			body,
			document_id UNINDEXED,
			chunk_id UNINDEXED,
			tokenize = 'unicode61'
		)`,
	}
	for _, statement := range statements {
		if _, err := s.db.ExecContext(ctx, statement); err != nil {
			s.lastError = err.Error()
			return err
		}
	}
	s.ftsAvailable = true
	if _, err := s.db.ExecContext(ctx, fmt.Sprintf(`CREATE VIRTUAL TABLE IF NOT EXISTS chunk_vectors USING vec0(embedding float[%d], document_id text, chunk_id text)`, vectorDimensions)); err != nil {
		s.vecAvailable = false
		s.lastError = err.Error()
	} else {
		s.vecAvailable = true
	}
	return nil
}

func (s *Store) loadCapabilities(ctx context.Context) error {
	tableExists := func(name string) (bool, error) {
		var count int
		err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, name).Scan(&count)
		return count > 0, err
	}
	ftsAvailable, err := tableExists("chunks_fts")
	if err != nil {
		return err
	}
	if !ftsAvailable {
		return errors.New("knowledge database full-text index is unavailable")
	}
	vecAvailable, err := tableExists("chunk_vectors")
	if err != nil {
		return err
	}
	s.ftsAvailable = true
	s.vecAvailable = vecAvailable
	return nil
}

type chunk struct {
	Content string
	Start   int
	End     int
}

type searchScanner interface {
	Scan(dest ...any) error
}

func scanDocument(rows *sql.Rows) (Document, error) {
	var doc Document
	err := rows.Scan(&doc.ID, &doc.Title, &doc.Type, &doc.Source, &doc.Tags, &doc.Description, &doc.FileName, &doc.FilePath, &doc.MimeType, &doc.FileSize, &doc.ContentHash, &doc.Status, &doc.ChunkCount, &doc.CreatedAt, &doc.UpdatedAt, &doc.IndexedAt, &doc.Error)
	doc.Count = doc.ChunkCount
	return doc, err
}

func scanSearchResult(rows searchScanner, query, match string) (SearchResult, error) {
	var result SearchResult
	var content string
	var distance float64
	if err := rows.Scan(&result.DocumentID, &result.ChunkID, &result.Title, &result.Type, &result.Source, &result.Tags, &result.FileName, &result.FilePath, &result.UpdatedAt, &content, &distance); err != nil {
		return SearchResult{}, err
	}
	result.Snippet = buildSnippet(content, query)
	result.Match = match
	if match == "FTS5" {
		result.Score = 1 / (1 + math.Abs(distance))
	} else {
		result.Score = 1 / (1 + math.Max(distance, 0))
	}
	return result, nil
}

func chunkText(text string, size, overlap int) []chunk {
	text = normalizeText(text)
	if text == "" {
		return nil
	}
	if size <= 0 {
		size = defaultChunkRunes
	}
	if overlap < 0 || overlap >= size {
		overlap = defaultOverlap
	}
	runes := []rune(text)
	chunks := make([]chunk, 0, len(runes)/size+1)
	for start := 0; start < len(runes); {
		end := minInt(start+size, len(runes))
		if end < len(runes) {
			end = nearbyBoundary(runes, start, end)
		}
		content := strings.TrimSpace(string(runes[start:end]))
		if content != "" {
			chunks = append(chunks, chunk{Content: content, Start: start, End: end})
		}
		if end >= len(runes) {
			break
		}
		nextStart := end - overlap
		if nextStart <= start {
			nextStart = end
		}
		start = nextStart
	}
	return chunks
}

func nearbyBoundary(runes []rune, start, end int) int {
	lower := start + (end-start)*2/3
	for i := end; i > lower; i-- {
		if unicode.IsSpace(runes[i-1]) || strings.ContainsRune("。！？；;,.，、\n", runes[i-1]) {
			return i
		}
	}
	return end
}

func normalizeText(text string) string {
	text = strings.ReplaceAll(text, "\x00", " ")
	return strings.TrimSpace(strings.Join(strings.Fields(text), " "))
}

func ftsMatchQuery(query string) string {
	terms := searchTerms(query)
	if len(terms) == 0 {
		return ""
	}
	parts := make([]string, 0, len(terms))
	for _, term := range terms {
		term = strings.ReplaceAll(term, `"`, `""`)
		parts = append(parts, `"`+term+`"`)
	}
	return strings.Join(parts, " OR ")
}

func searchTerms(text string) []string {
	seen := map[string]bool{}
	var terms []string
	for _, token := range basicTokens(text) {
		if !seen[token] {
			seen[token] = true
			terms = append(terms, token)
		}
	}
	for _, gram := range cjkBigrams(text) {
		if !seen[gram] {
			seen[gram] = true
			terms = append(terms, gram)
		}
	}
	if len(terms) > 12 {
		return terms[:12]
	}
	return terms
}

func indexTermsText(text string) string {
	return strings.Join(searchTerms(text), " ")
}

func embeddingTokens(text string) []string {
	terms := searchTerms(text)
	if len(terms) == 0 {
		return nil
	}
	return terms
}

func basicTokens(text string) []string {
	var tokens []string
	var b strings.Builder
	flush := func() {
		if b.Len() == 0 {
			return
		}
		token := strings.ToLower(b.String())
		if len([]rune(token)) <= 64 {
			tokens = append(tokens, token)
		}
		b.Reset()
	}
	for _, r := range text {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			b.WriteRune(r)
			continue
		}
		flush()
	}
	flush()
	return tokens
}

func cjkBigrams(text string) []string {
	var runes []rune
	for _, r := range text {
		if unicode.In(r, unicode.Han, unicode.Hangul, unicode.Hiragana, unicode.Katakana) {
			runes = append(runes, r)
			continue
		}
		if len(runes) > 0 {
			break
		}
	}
	if len(runes) == 0 {
		return nil
	}
	if len(runes) == 1 {
		return []string{string(runes[0])}
	}
	grams := make([]string, 0, len(runes)-1)
	for i := 0; i < len(runes)-1 && i < 24; i++ {
		grams = append(grams, string(runes[i:i+2]))
	}
	return grams
}

func embedText(text string) []float64 {
	vector := make([]float64, vectorDimensions)
	for _, token := range embeddingTokens(text) {
		hash := fnv.New64a()
		_, _ = hash.Write([]byte(token))
		value := hash.Sum64()
		index := int(value % vectorDimensions)
		sign := 1.0
		if value&(1<<63) != 0 {
			sign = -1
		}
		vector[index] += sign
	}
	var norm float64
	for _, value := range vector {
		norm += value * value
	}
	if norm == 0 {
		return vector
	}
	norm = math.Sqrt(norm)
	for i := range vector {
		vector[i] = vector[i] / norm
	}
	return vector
}

func vectorJSON(vector []float64) string {
	var b strings.Builder
	b.WriteByte('[')
	for i, value := range vector {
		if i > 0 {
			b.WriteByte(',')
		}
		b.WriteString(strconv.FormatFloat(value, 'f', 6, 64))
	}
	b.WriteByte(']')
	return b.String()
}

func buildSnippet(content, query string) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return ""
	}
	lower := strings.ToLower(content)
	start := 0
	for _, term := range searchTerms(query) {
		if index := strings.Index(lower, strings.ToLower(term)); index >= 0 {
			start = maxInt(0, index-80)
			break
		}
	}
	runes := []rune(content)
	if start > len(runes) {
		start = 0
	}
	end := minInt(len(runes), start+220)
	snippet := strings.TrimSpace(string(runes[start:end]))
	if start > 0 {
		snippet = "..." + snippet
	}
	if end < len(runes) {
		snippet += "..."
	}
	return snippet
}

func hashText(text string) string {
	sum := sha256.Sum256([]byte(text))
	return hex.EncodeToString(sum[:])
}

func defaultText(value, fallback string) string {
	if strings.TrimSpace(value) == "" {
		return fallback
	}
	return strings.TrimSpace(value)
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

func maxInt64(a, b int64) int64 {
	if a > b {
		return a
	}
	return b
}
