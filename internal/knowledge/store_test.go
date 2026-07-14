package knowledge

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func TestStoreImportSearchStatusAndDelete(t *testing.T) {
	store, err := Open(filepath.Join(t.TempDir(), "knowledge.db"))
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer store.Close()

	doc, err := store.Import(context.Background(), ImportInput{
		ID:          "doc-1",
		Title:       "本地知识库说明",
		Type:        "说明",
		Source:      "unit-test",
		Tags:        "sqlite / fts5 / vec",
		Description: "导入文档后自动切片并建立本地索引。",
		Content:     "Volt GUI 支持导入文档、切片、SQLite FTS5 全文检索和 sqlite-vec 向量索引。检索结果来自本地知识库。",
	})
	if err != nil {
		t.Fatalf("Import() error = %v", err)
	}
	if doc.ChunkCount == 0 {
		t.Fatalf("Import() chunk count = 0")
	}

	results, err := store.Search(context.Background(), "向量索引", SearchOptions{Limit: 5})
	if err != nil {
		t.Fatalf("Search() error = %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("Search() returned no results")
	}
	if results[0].DocumentID != "doc-1" {
		t.Fatalf("Search() document = %q, want doc-1", results[0].DocumentID)
	}

	status, err := store.Status(context.Background())
	if err != nil {
		t.Fatalf("Status() error = %v", err)
	}
	if !status.SQLite || !status.FTS5 || !status.SQLiteVec {
		t.Fatalf("Status() capabilities = sqlite:%v fts5:%v sqliteVec:%v", status.SQLite, status.FTS5, status.SQLiteVec)
	}
	if status.Documents != 1 || status.Chunks == 0 || status.Vectors == 0 {
		t.Fatalf("Status() counts = documents:%d chunks:%d vectors:%d", status.Documents, status.Chunks, status.Vectors)
	}

	if err := store.DeleteDocument(context.Background(), "doc-1"); err != nil {
		t.Fatalf("DeleteDocument() error = %v", err)
	}
	afterDelete, err := store.Search(context.Background(), "向量索引", SearchOptions{Limit: 5})
	if err != nil {
		t.Fatalf("Search() after delete error = %v", err)
	}
	if len(afterDelete) != 0 {
		t.Fatalf("Search() after delete returned %d results", len(afterDelete))
	}
}

func TestOpenReadOnlySearchesWithoutAllowingKnowledgeWrites(t *testing.T) {
	path := filepath.Join(t.TempDir(), "knowledge.db")
	store, err := Open(path)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	_, err = store.Import(context.Background(), ImportInput{
		ID:      "readonly-doc",
		Title:   "只读评审规范",
		Type:    "规则",
		Content: "代码评审必须引用实际检索到的知识来源。",
	})
	if err != nil {
		_ = store.Close()
		t.Fatalf("Import() error = %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("Close() error = %v", err)
	}

	readOnly, err := OpenReadOnly(path)
	if err != nil {
		t.Fatalf("OpenReadOnly() error = %v", err)
	}
	defer readOnly.Close()
	results, err := readOnly.Search(context.Background(), "引用知识来源", SearchOptions{Limit: 5})
	if err != nil || len(results) == 0 || results[0].DocumentID != "readonly-doc" {
		t.Fatalf("read-only Search() = %+v, %v", results, err)
	}
	if _, err := readOnly.Import(context.Background(), ImportInput{Title: "不应写入", Content: "blocked"}); err == nil || !strings.Contains(strings.ToLower(err.Error()), "readonly") {
		t.Fatalf("read-only Import() error = %v, want readonly failure", err)
	}
}
