package builtin

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"voltui/internal/config"
	"voltui/internal/knowledge"
	"voltui/internal/tool"
)

func TestKnowledgeSearchBuiltinReturnsCitableLocalResults(t *testing.T) {
	home := t.TempDir()
	t.Setenv("VOLTUI_HOME", home)
	databasePath := filepath.Join(filepath.Dir(config.UserConfigPath()), "knowledge", "knowledge.db")
	store, err := knowledge.Open(databasePath)
	if err != nil {
		t.Fatalf("open knowledge store: %v", err)
	}
	_, err = store.Import(context.Background(), knowledge.ImportInput{
		ID:          "review-standard",
		Title:       "Go 并发评审规范",
		Type:        "编码规范",
		Source:      "研发制度 v3",
		Tags:        "Go / 并发 / review",
		FileName:    "go-review.md",
		FilePath:    "/knowledge/go-review.md",
		Description: "代码评审时检查共享状态和锁边界。",
		Content:     "并发代码评审必须检查共享 map 是否由互斥锁保护，并验证锁的持有范围。",
	})
	if err != nil {
		_ = store.Close()
		t.Fatalf("import knowledge document: %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatalf("close knowledge store: %v", err)
	}

	search, ok := tool.LookupBuiltin("knowledge_search")
	if !ok {
		t.Fatal("knowledge_search built-in is not registered")
	}
	if !search.ReadOnly() {
		t.Fatal("knowledge_search must be read-only")
	}
	classifier, ok := search.(tool.PlanModeClassifier)
	if !ok || !classifier.PlanModeSafe() {
		t.Fatal("knowledge_search must explicitly allow plan-mode reads")
	}

	raw, err := search.Execute(context.Background(), json.RawMessage(`{"query":"共享 map 互斥锁","limit":50}`))
	if err != nil {
		t.Fatalf("knowledge_search: %v", err)
	}
	var response struct {
		Query   string                   `json:"query"`
		Limit   int                      `json:"limit"`
		Count   int                      `json:"count"`
		Results []knowledge.SearchResult `json:"results"`
	}
	if err := json.Unmarshal([]byte(raw), &response); err != nil {
		t.Fatalf("decode knowledge_search result: %v\n%s", err, raw)
	}
	if response.Query != "共享 map 互斥锁" || response.Limit != 20 || response.Count == 0 || len(response.Results) == 0 {
		t.Fatalf("knowledge_search response = %+v", response)
	}
	result := response.Results[0]
	if result.DocumentID != "review-standard" || result.Title != "Go 并发评审规范" || result.Source != "研发制度 v3" || result.FilePath != "/knowledge/go-review.md" {
		t.Fatalf("knowledge_search lost citation fields: %+v", result)
	}
	if result.Match == "" || result.Snippet == "" {
		t.Fatalf("knowledge_search lost retrieval evidence: %+v", result)
	}
}

func TestKnowledgeSearchBuiltinValidatesQueryAndDoesNotCreateEmptyDatabase(t *testing.T) {
	home := t.TempDir()
	t.Setenv("VOLTUI_HOME", home)
	search, ok := tool.LookupBuiltin("knowledge_search")
	if !ok {
		t.Fatal("knowledge_search built-in is not registered")
	}
	if _, err := search.Execute(context.Background(), json.RawMessage(`{"query":"   "}`)); err == nil || !strings.Contains(err.Error(), "query is required") {
		t.Fatalf("blank query error = %v", err)
	}
	raw, err := search.Execute(context.Background(), json.RawMessage(`{"query":"不存在的规范"}`))
	if err != nil {
		t.Fatalf("empty knowledge search: %v", err)
	}
	var response struct {
		Count   int                      `json:"count"`
		Results []knowledge.SearchResult `json:"results"`
		Message string                   `json:"message"`
	}
	if err := json.Unmarshal([]byte(raw), &response); err != nil {
		t.Fatalf("decode empty result: %v\n%s", err, raw)
	}
	if response.Count != 0 || len(response.Results) != 0 || response.Message == "" {
		t.Fatalf("empty knowledge response = %+v", response)
	}
	databasePath := filepath.Join(home, "knowledge", "knowledge.db")
	if _, err := os.Stat(databasePath); !os.IsNotExist(err) {
		t.Fatalf("read-only empty search created %s: %v", databasePath, err)
	}
}
