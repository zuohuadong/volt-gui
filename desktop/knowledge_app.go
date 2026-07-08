package main

import (
	"context"
	"errors"
	"path/filepath"
	"strings"

	"voltui/internal/config"
	"voltui/internal/knowledge"
)

const knowledgeDatabaseFile = "knowledge.db"

type KnowledgeBaseView struct {
	Documents []knowledge.Document `json:"documents"`
	Status    knowledge.Status     `json:"status"`
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
	return KnowledgeBaseView{Documents: docs, Status: status}, nil
}

func (a *App) KnowledgeStatus() (knowledge.Status, error) {
	store, err := openKnowledgeStore()
	if err != nil {
		return knowledge.Status{}, err
	}
	defer store.Close()
	return store.Status(context.Background())
}

func (a *App) ImportKnowledgeDocument(input KnowledgeDocumentImportInput) (knowledge.Document, error) {
	return importKnowledgeDocument(input)
}

func (a *App) SearchKnowledge(query string, limit int) ([]knowledge.SearchResult, error) {
	store, err := openKnowledgeStore()
	if err != nil {
		return nil, err
	}
	defer store.Close()
	return store.Search(context.Background(), query, knowledge.SearchOptions{Limit: limit})
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
