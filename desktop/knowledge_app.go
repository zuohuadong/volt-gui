package main

import (
	"context"
	"errors"
	"path/filepath"
	"sort"
	"strings"

	"voltui/internal/config"
	"voltui/internal/knowledge"
)

const knowledgeDatabaseFile = "knowledge.db"

type KnowledgeBaseView struct {
	Documents []WorkbenchKnowledgeDocumentView `json:"documents"`
	Status    knowledge.Status                 `json:"status"`
}

type KnowledgeDocumentImportInput struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Type        string `json:"type"`
	Source      string `json:"source"`
	Tags        string `json:"tags"`
	Description string `json:"description"`
	FileName    string `json:"fileName"`
	FilePath    string `json:"filePath"`
	MimeType    string `json:"mimeType"`
	FileSize    int64  `json:"fileSize"`
	Content     string `json:"content"`
}

func (a *App) KnowledgeBase() (KnowledgeBaseView, error) {
	store, err := openKnowledgeStore()
	if err != nil {
		return KnowledgeBaseView{}, err
	}
	defer store.Close()
	docs, err := store.ListDocuments(context.Background())
	if err != nil {
		return KnowledgeBaseView{}, err
	}
	status, err := store.Status(context.Background())
	if err != nil {
		return KnowledgeBaseView{}, err
	}
	indexed := make(map[string]WorkbenchKnowledgeDocumentView, len(docs))
	for _, doc := range docs {
		view := workbenchKnowledgeDocumentFromStore(doc)
		indexed[view.ID] = view
	}
	data, err := loadWorkbenchData()
	if err != nil {
		return KnowledgeBaseView{}, err
	}
	for _, doc := range data.KnowledgeDocuments {
		if view, ok := indexed[doc.ID]; ok {
			view.MaterialIDs = doc.MaterialIDs
			if len(doc.MaterialIDs) > 0 {
				view.Count = len(doc.MaterialIDs)
			}
			if doc.Status == "索引中" || doc.Status == "索引失败" {
				view.Status = doc.Status
				view.Error = doc.Error
			}
			indexed[doc.ID] = view
			continue
		}
		indexed[doc.ID] = doc
	}
	items := make([]WorkbenchKnowledgeDocumentView, 0, len(indexed))
	for _, doc := range indexed {
		items = append(items, doc)
	}
	sort.SliceStable(items, func(i, j int) bool { return items[i].UpdatedAt > items[j].UpdatedAt })
	return KnowledgeBaseView{Documents: items, Status: status}, nil
}

func (a *App) KnowledgeStatus() (knowledge.Status, error) {
	store, err := openKnowledgeStore()
	if err != nil {
		return knowledge.Status{}, err
	}
	defer store.Close()
	return store.Status(context.Background())
}

// ImportKnowledgeDocument saves a knowledge document in the active workspace
// before extracting and indexing its content. File paths returned by the native
// picker are relative to that workspace's attachment directory.
func (a *App) ImportKnowledgeDocument(input KnowledgeDocumentImportInput) (WorkbenchKnowledgeDocumentView, error) {
	var document WorkbenchKnowledgeDocumentView
	err := a.withActiveWorkspaceDo(func() error {
		var err error
		document, err = a.SaveKnowledgeDocument(WorkbenchKnowledgeDocumentInput{
			ID:          input.ID,
			Title:       input.Title,
			Type:        input.Type,
			Description: input.Description,
			Content:     input.Content,
			Source:      input.Source,
			Tags:        input.Tags,
			FileName:    input.FileName,
			FilePath:    input.FilePath,
			MimeType:    input.MimeType,
			FileSize:    input.FileSize,
		})
		return err
	})
	return document, err
}

func (a *App) SearchKnowledge(query string, limit int) ([]knowledge.SearchResult, error) {
	store, err := openKnowledgeStore()
	if err != nil {
		return nil, err
	}
	defer store.Close()
	return store.Search(context.Background(), query, knowledge.SearchOptions{Limit: limit})
}

func (a *App) KnowledgeDocumentPreview(id string) (string, error) {
	id = strings.TrimSpace(id)
	if id == "" {
		return "", errors.New("knowledge document id is required")
	}
	data, err := loadWorkbenchData()
	if err != nil {
		return "", err
	}
	for _, doc := range data.KnowledgeDocuments {
		if doc.ID == id && strings.TrimSpace(doc.Content) != "" {
			return doc.Content, nil
		}
	}
	store, err := openKnowledgeStore()
	if err != nil {
		return "", err
	}
	defer store.Close()
	return store.DocumentText(context.Background(), id)
}

func (a *App) DeleteKnowledgeDocument(id string) error {
	if err := deleteKnowledgeDocument(id); err != nil {
		return err
	}
	return removeWorkbenchKnowledgeDocument(id)
}

func importKnowledgeDocument(input KnowledgeDocumentImportInput) (knowledge.Document, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return knowledge.Document{}, errors.New("knowledge document title is required")
	}
	content := strings.TrimSpace(input.Content)
	if content == "" && strings.TrimSpace(input.FilePath) != "" {
		text, err := extractProjectMaterialText(input.FilePath, input.MimeType, input.FileName)
		if err != nil {
			return knowledge.Document{}, err
		}
		content = text
	}
	store, err := openKnowledgeStore()
	if err != nil {
		return knowledge.Document{}, err
	}
	defer store.Close()
	return store.Import(context.Background(), knowledge.ImportInput{
		ID:          strings.TrimSpace(input.ID),
		Title:       title,
		Type:        defaultString(strings.TrimSpace(input.Type), "文档"),
		Source:      strings.TrimSpace(input.Source),
		Tags:        strings.TrimSpace(input.Tags),
		Description: strings.TrimSpace(input.Description),
		FileName:    strings.TrimSpace(input.FileName),
		FilePath:    strings.TrimSpace(input.FilePath),
		MimeType:    strings.TrimSpace(input.MimeType),
		FileSize:    maxInt64(input.FileSize, 0),
		Content:     content,
	})
}

func deleteKnowledgeDocument(id string) error {
	store, err := openKnowledgeStore()
	if err != nil {
		return err
	}
	defer store.Close()
	return store.DeleteDocument(context.Background(), id)
}

func openKnowledgeStore() (*knowledge.Store, error) {
	path, err := knowledgeDatabasePath()
	if err != nil {
		return nil, err
	}
	return knowledge.Open(path)
}

func knowledgeDatabasePath() (string, error) {
	userConfig := config.UserConfigPath()
	if strings.TrimSpace(userConfig) == "" {
		return "", errors.New("user config dir is unavailable")
	}
	return filepath.Join(filepath.Dir(userConfig), "knowledge", knowledgeDatabaseFile), nil
}

func workbenchKnowledgeDocumentFromStore(doc knowledge.Document) WorkbenchKnowledgeDocumentView {
	count := doc.ChunkCount
	if count <= 0 {
		count = 1
	}
	return WorkbenchKnowledgeDocumentView{
		ID:          doc.ID,
		Title:       doc.Title,
		Type:        defaultString(doc.Type, "文档"),
		Count:       count,
		Status:      defaultString(doc.Status, "已入库"),
		Description: doc.Description,
		Source:      doc.Source,
		Tags:        doc.Tags,
		FileName:    doc.FileName,
		FilePath:    doc.FilePath,
		MimeType:    doc.MimeType,
		FileSize:    doc.FileSize,
		ChunkCount:  doc.ChunkCount,
		IndexedAt:   doc.IndexedAt,
		Error:       doc.Error,
		CreatedAt:   doc.CreatedAt,
		UpdatedAt:   doc.UpdatedAt,
	}
}
