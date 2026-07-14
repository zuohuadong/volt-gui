package builtin

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"voltui/internal/config"
	"voltui/internal/knowledge"
	"voltui/internal/tool"
)

const (
	knowledgeSearchDefaultLimit  = 8
	knowledgeSearchMaxLimit      = 20
	knowledgeSearchMaxQueryRunes = 1024
)

func init() { tool.RegisterBuiltin(knowledgeSearch{}) }

type knowledgeSearch struct{}

func (knowledgeSearch) Name() string { return "knowledge_search" }

func (knowledgeSearch) Description() string {
	return "Search Volt GUI's first-party local knowledge base for internal standards, rules, project material, and prior experience. Use focused queries before code-review findings when company or project guidance may apply. Results are evidence candidates: cite only returned title/source/file fields, and verify code behavior separately with code tools."
}

func (knowledgeSearch) Schema() json.RawMessage {
	return json.RawMessage(`{
"type":"object",
"properties":{
  "query":{"type":"string","minLength":1,"maxLength":1024,"description":"Focused natural-language or keyword query for an internal standard, rule, module, risk, or technology."},
  "limit":{"type":"integer","minimum":1,"maximum":20,"default":8,"description":"Maximum knowledge chunks to return."}
},
"required":["query"],
"additionalProperties":false
}`)
}

func (knowledgeSearch) ReadOnly() bool     { return true }
func (knowledgeSearch) PlanModeSafe() bool { return true }

type knowledgeSearchArgs struct {
	Query string `json:"query"`
	Limit int    `json:"limit"`
}

type knowledgeSearchResponse struct {
	Query     string                   `json:"query"`
	Limit     int                      `json:"limit"`
	Count     int                      `json:"count"`
	Available bool                     `json:"available"`
	Results   []knowledge.SearchResult `json:"results"`
	Message   string                   `json:"message,omitempty"`
}

func (knowledgeSearch) Execute(ctx context.Context, args json.RawMessage) (string, error) {
	var p knowledgeSearchArgs
	decoder := json.NewDecoder(bytes.NewReader(args))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&p); err != nil {
		return "", fmt.Errorf("invalid args: %w", err)
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		if err == nil {
			return "", errors.New("invalid args: multiple JSON values")
		}
		return "", fmt.Errorf("invalid args: %w", err)
	}
	p.Query = strings.TrimSpace(p.Query)
	if p.Query == "" {
		return "", errors.New("query is required")
	}
	if len([]rune(p.Query)) > knowledgeSearchMaxQueryRunes {
		return "", fmt.Errorf("query must not exceed %d characters", knowledgeSearchMaxQueryRunes)
	}
	if p.Limit <= 0 {
		p.Limit = knowledgeSearchDefaultLimit
	}
	if p.Limit > knowledgeSearchMaxLimit {
		p.Limit = knowledgeSearchMaxLimit
	}

	databasePath, err := localKnowledgeDatabasePath()
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(databasePath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return marshalKnowledgeSearchResponse(knowledgeSearchResponse{
				Query: p.Query, Limit: p.Limit, Results: []knowledge.SearchResult{},
				Message: "Local knowledge base is not initialized. Import knowledge in Volt GUI or connect an internal MCP knowledge source.",
			})
		}
		return "", fmt.Errorf("inspect local knowledge base: %w", err)
	}

	store, err := knowledge.OpenReadOnly(databasePath)
	if err != nil {
		return "", fmt.Errorf("open local knowledge base: %w", err)
	}
	defer store.Close()
	results, err := store.Search(ctx, p.Query, knowledge.SearchOptions{Limit: p.Limit})
	if err != nil {
		return "", fmt.Errorf("search local knowledge base: %w", err)
	}
	if results == nil {
		results = []knowledge.SearchResult{}
	}
	response := knowledgeSearchResponse{
		Query: p.Query, Limit: p.Limit, Count: len(results), Available: true, Results: results,
	}
	if len(results) == 0 {
		response.Message = "No local knowledge matched the query. Do not infer or invent an internal policy from this empty result."
	}
	return marshalKnowledgeSearchResponse(response)
}

func localKnowledgeDatabasePath() (string, error) {
	userConfig := strings.TrimSpace(config.UserConfigPath())
	if userConfig == "" {
		return "", errors.New("user config dir is unavailable")
	}
	return filepath.Join(filepath.Dir(userConfig), "knowledge", "knowledge.db"), nil
}

func marshalKnowledgeSearchResponse(response knowledgeSearchResponse) (string, error) {
	if response.Results == nil {
		response.Results = []knowledge.SearchResult{}
	}
	response.Count = len(response.Results)
	b, err := json.Marshal(response)
	if err != nil {
		return "", fmt.Errorf("encode knowledge search result: %w", err)
	}
	return string(b), nil
}
