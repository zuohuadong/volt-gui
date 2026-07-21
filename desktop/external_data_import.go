package main

import (
	"bufio"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/wailsapp/wails/v2/pkg/runtime"

	"voltui/internal/config"
	"voltui/internal/knowledge"
	voltSkill "voltui/internal/skill"
)

const (
	externalDataSourceTrae   = "trae"
	externalDataSourceFolder = "folder"

	externalCompatibilityCompatible   = "compatible"
	externalCompatibilityWarning      = "warning"
	externalCompatibilityIncompatible = "incompatible"

	externalTargetKnowledge = "knowledge"
	externalTargetSkills    = "skills"
	externalTargetNone      = "none"

	externalContentFile        = "file"
	externalContentTraeSession = "trae-session"

	maxExternalImportItems       = 500
	maxExternalVisitedEntries    = 6000
	maxExternalImportDepth       = 8
	maxExternalSessionItems      = 200
	maxExternalDocumentBytes     = 64 * 1024 * 1024
	maxExternalSessionTextBytes  = 2 * 1024 * 1024
	maxExternalSkillPackageBytes = 32 * 1024 * 1024
)

var externalDocumentExtensions = map[string]bool{
	".csv": true, ".docx": true, ".htm": true, ".html": true,
	".json": true, ".log": true, ".markdown": true, ".md": true,
	".pdf": true, ".txt": true, ".xml": true, ".yaml": true, ".yml": true,
}

var externalIgnoredDirectories = map[string]bool{
	".git": true, ".hg": true, ".svn": true, ".cache": true,
	"build": true, "cache": true, "dist": true, "node_modules": true,
	"target": true, "tmp": true, "vendor": true,
}

type ExternalDataSourceView struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Available   bool     `json:"available"`
	DefaultRoot string   `json:"defaultRoot,omitempty"`
	Categories  []string `json:"categories"`
	Warning     string   `json:"warning,omitempty"`
}

type ExternalDataPreviewInput struct {
	SourceID string `json:"sourceId"`
	RootPath string `json:"rootPath"`
}

type ExternalDataImportItemView struct {
	ID                string `json:"id"`
	Category          string `json:"category"`
	Title             string `json:"title"`
	RelativePath      string `json:"relativePath"`
	Target            string `json:"target"`
	TargetLabel       string `json:"targetLabel"`
	Compatibility     string `json:"compatibility"`
	CompatibilityText string `json:"compatibilityText"`
	Warning           string `json:"warning,omitempty"`
	Size              int64  `json:"size"`
	SelectedByDefault bool   `json:"selectedByDefault"`
}

type ExternalDataImportPreview struct {
	SourceID    string                       `json:"sourceId"`
	SourceName  string                       `json:"sourceName"`
	RootPath    string                       `json:"rootPath"`
	Items       []ExternalDataImportItemView `json:"items"`
	Compatible  int                          `json:"compatible"`
	Warnings    int                          `json:"warnings"`
	Unsupported int                          `json:"unsupported"`
	Messages    []string                     `json:"messages"`
}

type ExternalDataImportInput struct {
	SourceID string   `json:"sourceId"`
	RootPath string   `json:"rootPath"`
	ItemIDs  []string `json:"itemIds"`
}

type ExternalDataImportResultItem struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Target  string `json:"target"`
	Status  string `json:"status"`
	Message string `json:"message"`
}

type ExternalDataImportResult struct {
	Imported int                            `json:"imported"`
	Skipped  int                            `json:"skipped"`
	Failed   int                            `json:"failed"`
	Items    []ExternalDataImportResultItem `json:"items"`
	Warnings []string                       `json:"warnings"`
	Summary  string                         `json:"summary"`
}

type externalDataCandidate struct {
	View            ExternalDataImportItemView
	SourceID        string
	SourceName      string
	SourcePath      string
	DestinationPath string
	ContentMode     string
	SkillScope      string
}

type externalDataAdapter interface {
	descriptor(workspaceRoot string) ExternalDataSourceView
	scan(rootPath, workspaceRoot, globalSkillsRoot string) ([]externalDataCandidate, []string, error)
}

type traeExternalDataAdapter struct{}
type folderExternalDataAdapter struct{}

func (a *App) ExternalDataSources() []ExternalDataSourceView {
	workspaceRoot := a.activeWorkspaceRoot()
	adapters := externalDataAdapters()
	views := make([]ExternalDataSourceView, 0, len(adapters))
	for _, adapter := range adapters {
		views = append(views, adapter.descriptor(workspaceRoot))
	}
	return views
}

func (a *App) PickExternalDataDirectory(sourceID string) (string, error) {
	if a.ctx == nil {
		return "", nil
	}
	adapter, err := externalDataAdapterFor(sourceID)
	if err != nil {
		return "", err
	}
	descriptor := adapter.descriptor(a.activeWorkspaceRoot())
	defaultRoot := descriptor.DefaultRoot
	if strings.TrimSpace(defaultRoot) == "" {
		defaultRoot = a.activeWorkspaceRoot()
	}
	title := "选择外部数据文件夹"
	if descriptor.ID == externalDataSourceTrae {
		title = "选择 TRAE 数据目录或项目目录"
	}
	selected, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title:            title,
		DefaultDirectory: dialogDefaultDirectory(defaultRoot),
	})
	if err != nil || selected == "" {
		return "", err
	}
	return filepath.Clean(selected), nil
}

func (a *App) PreviewExternalData(input ExternalDataPreviewInput) (ExternalDataImportPreview, error) {
	adapter, err := externalDataAdapterFor(input.SourceID)
	if err != nil {
		return ExternalDataImportPreview{}, err
	}
	root, err := normalizeExternalDataRoot(input.RootPath)
	if err != nil {
		return ExternalDataImportPreview{}, err
	}
	descriptor := adapter.descriptor(a.activeWorkspaceRoot())
	candidates, messages, err := adapter.scan(root, a.activeWorkspaceRoot(), filepath.Join(config.ReasonixHomeDir(), voltSkill.SkillsDirname))
	if err != nil {
		return ExternalDataImportPreview{}, err
	}
	preview := ExternalDataImportPreview{
		SourceID:   descriptor.ID,
		SourceName: descriptor.Name,
		RootPath:   root,
		Items:      make([]ExternalDataImportItemView, 0, len(candidates)),
		Messages:   messages,
	}
	for _, candidate := range candidates {
		preview.Items = append(preview.Items, candidate.View)
		switch candidate.View.Compatibility {
		case externalCompatibilityCompatible:
			preview.Compatible++
		case externalCompatibilityWarning:
			preview.Warnings++
		default:
			preview.Unsupported++
		}
	}
	return preview, nil
}

func (a *App) ImportExternalData(input ExternalDataImportInput) (ExternalDataImportResult, error) {
	if len(input.ItemIDs) == 0 {
		return ExternalDataImportResult{}, errors.New("请至少选择一项可导入数据")
	}
	ctx, finish, err := a.beginExternalDataImport()
	if err != nil {
		return ExternalDataImportResult{}, err
	}
	defer finish()
	adapter, err := externalDataAdapterFor(input.SourceID)
	if err != nil {
		return ExternalDataImportResult{}, err
	}
	root, err := normalizeExternalDataRoot(input.RootPath)
	if err != nil {
		return ExternalDataImportResult{}, err
	}
	workspaceRoot := a.activeWorkspaceRoot()
	globalSkillsRoot := filepath.Join(config.ReasonixHomeDir(), voltSkill.SkillsDirname)
	candidates, messages, err := adapter.scan(root, workspaceRoot, globalSkillsRoot)
	if err != nil {
		return ExternalDataImportResult{}, err
	}
	if err := ctx.Err(); err != nil {
		return ExternalDataImportResult{}, externalDataImportCanceledError(err)
	}

	var store *knowledge.Store
	var storeErr error
	if externalSelectionNeedsKnowledge(candidates, input.ItemIDs) {
		store, storeErr = openKnowledgeStore()
		if store != nil {
			defer store.Close()
		}
	}
	result, err := executeExternalDataImportContext(ctx, candidates, input.ItemIDs, store, storeErr)
	if err != nil {
		return result, externalDataImportCanceledError(err)
	}
	result.Warnings = append(messages, result.Warnings...)
	if externalResultImportedSkills(result) {
		if err := a.RefreshSkills(); err != nil {
			result.Warnings = append(result.Warnings, "技能文件已导入，但运行时刷新失败；请稍后在技能页刷新或重启 Volt。")
		}
	}
	result.Summary = fmt.Sprintf("已导入 %d 项，跳过 %d 项，失败 %d 项", result.Imported, result.Skipped, result.Failed)
	return result, nil
}

func (a *App) beginExternalDataImport() (context.Context, func(), error) {
	a.externalImportMu.Lock()
	defer a.externalImportMu.Unlock()
	if a.externalImportCancel != nil {
		return nil, nil, errors.New("已有外部数据导入正在进行")
	}
	parent := a.ctx
	if parent == nil {
		parent = context.Background()
	}
	ctx, cancel := context.WithCancel(parent)
	a.externalImportGeneration++
	generation := a.externalImportGeneration
	a.externalImportCancel = cancel
	finish := func() {
		cancel()
		a.externalImportMu.Lock()
		if a.externalImportGeneration == generation {
			a.externalImportCancel = nil
		}
		a.externalImportMu.Unlock()
	}
	return ctx, finish, nil
}

// CancelExternalDataImport requests cancellation of the one active import job.
// Completed items remain intact; items not yet started will not be written.
func (a *App) CancelExternalDataImport() bool {
	a.externalImportMu.Lock()
	cancel := a.externalImportCancel
	a.externalImportMu.Unlock()
	if cancel == nil {
		return false
	}
	cancel()
	return true
}

func externalDataImportCanceledError(err error) error {
	if errors.Is(err, context.Canceled) {
		return errors.New("外部数据导入已取消")
	}
	return err
}

func externalDataAdapters() []externalDataAdapter {
	return []externalDataAdapter{traeExternalDataAdapter{}, folderExternalDataAdapter{}}
}

func externalDataAdapterFor(id string) (externalDataAdapter, error) {
	id = strings.TrimSpace(strings.ToLower(id))
	for _, adapter := range externalDataAdapters() {
		if adapter.descriptor("").ID == id {
			return adapter, nil
		}
	}
	return nil, fmt.Errorf("不支持的外部数据源 %q", id)
}

func (traeExternalDataAdapter) descriptor(_ string) ExternalDataSourceView {
	home, _ := os.UserHomeDir()
	root := ""
	available := false
	if home != "" {
		root = filepath.Join(home, ".trae-cn")
		if info, err := os.Stat(root); err == nil && info.IsDir() {
			available = true
		}
	}
	return ExternalDataSourceView{
		ID:          externalDataSourceTrae,
		Name:        "TRAE",
		Description: "导入本地记忆、项目规则、技能包和经过筛选的会话摘要。",
		Available:   available,
		DefaultRoot: root,
		Categories:  []string{"记忆", "规则", "技能", "会话摘要"},
		Warning:     "不会读取账号凭据，也不会复制 TRAE 的私有索引或数据库。",
	}
}

func (folderExternalDataAdapter) descriptor(_ string) ExternalDataSourceView {
	return ExternalDataSourceView{
		ID:          externalDataSourceFolder,
		Name:        "本地文件夹",
		Description: "扫描文档与标准 SKILL.md 技能包，并重新建立 Volt 本地索引。",
		Available:   true,
		Categories:  []string{"文档", "技能"},
		Warning:     "数据库、缓存、可执行文件和未知二进制格式会显示为不兼容或被忽略。",
	}
}

func (traeExternalDataAdapter) scan(rootPath, workspaceRoot, globalSkillsRoot string) ([]externalDataCandidate, []string, error) {
	var candidates []externalDataCandidate
	var messages []string
	var sessionCandidates []externalDataCandidate
	seen := map[string]bool{}

	add := func(candidate externalDataCandidate) {
		key := candidate.SourceID + "\x00" + candidate.View.Category + "\x00" + candidate.View.RelativePath
		if seen[key] || len(candidates) >= maxExternalImportItems {
			return
		}
		seen[key] = true
		candidates = append(candidates, candidate)
	}

	memoryRoot := filepath.Join(rootPath, "memory")
	if info, err := os.Stat(memoryRoot); err == nil && info.IsDir() {
		visitedMemoryEntries := 0
		_ = filepath.WalkDir(memoryRoot, func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return nil
			}
			visitedMemoryEntries++
			if visitedMemoryEntries > maxExternalVisitedEntries {
				messages = append(messages, "TRAE 记忆目录较大，会话摘要扫描已提前停止；持久记忆、规则和技能仍会优先显示。")
				return filepath.SkipAll
			}
			if entry.IsDir() {
				if path != memoryRoot && externalDepth(memoryRoot, path) > maxExternalImportDepth {
					return filepath.SkipDir
				}
				return nil
			}
			name := strings.ToLower(entry.Name())
			switch {
			case name == "user_profile.md" || name == "project_memory.md" || name == "topics.md":
				if entry.Type()&os.ModeSymlink != 0 {
					candidate, err := newExternalIncompatibleCandidate(externalDataSourceTrae, "TRAE", rootPath, path, "符号链接可能指向所选目录之外，通用导入器不会读取。")
					if err == nil {
						add(candidate)
					}
					return nil
				}
				candidate, err := newExternalDocumentCandidate(externalDataSourceTrae, "TRAE", "记忆", rootPath, path, externalCompatibilityCompatible, "", externalContentFile)
				if err == nil {
					add(candidate)
				}
			case strings.HasPrefix(name, "session_memory_") && strings.HasSuffix(name, ".jsonl"):
				if entry.Type()&os.ModeSymlink != 0 {
					candidate, err := newExternalIncompatibleCandidate(externalDataSourceTrae, "TRAE", rootPath, path, "符号链接可能指向所选目录之外，通用导入器不会读取。")
					if err == nil {
						add(candidate)
					}
					return nil
				}
				if len(sessionCandidates) >= maxExternalSessionItems {
					return nil
				}
				candidate, err := newExternalDocumentCandidate(externalDataSourceTrae, "TRAE", "会话摘要", rootPath, path, externalCompatibilityWarning, "会话摘要可能包含项目历史或敏感上下文，默认不选中；导入前请确认。", externalContentTraeSession)
				if err == nil {
					candidate.View.SelectedByDefault = false
					sessionCandidates = append(sessionCandidates, candidate)
				}
			}
			return nil
		})
	}

	globalSkillRoot := filepath.Join(rootPath, "skills")
	if info, err := os.Stat(globalSkillRoot); err == nil && info.IsDir() {
		for _, candidate := range scanExternalSkillRoot(externalDataSourceTrae, "TRAE", rootPath, globalSkillRoot, "global", workspaceRoot, globalSkillsRoot) {
			add(candidate)
		}
	}

	projectTraeRoots := []string{}
	if filepath.Base(rootPath) == ".trae" {
		projectTraeRoots = append(projectTraeRoots, rootPath)
	}
	if info, err := os.Stat(filepath.Join(rootPath, ".trae")); err == nil && info.IsDir() {
		projectTraeRoots = append(projectTraeRoots, filepath.Join(rootPath, ".trae"))
	}
	for _, projectTraeRoot := range dedupeExternalPaths(projectTraeRoots) {
		rulesRoot := filepath.Join(projectTraeRoot, "rules")
		if info, err := os.Stat(rulesRoot); err == nil && info.IsDir() {
			_ = filepath.WalkDir(rulesRoot, func(path string, entry os.DirEntry, walkErr error) error {
				if walkErr != nil || entry.IsDir() || len(candidates) >= maxExternalImportItems {
					return nil
				}
				if strings.EqualFold(filepath.Ext(entry.Name()), ".md") {
					if entry.Type()&os.ModeSymlink != 0 {
						candidate, err := newExternalIncompatibleCandidate(externalDataSourceTrae, "TRAE", rootPath, path, "符号链接可能指向所选目录之外，通用导入器不会读取。")
						if err == nil {
							add(candidate)
						}
						return nil
					}
					candidate, err := newExternalDocumentCandidate(externalDataSourceTrae, "TRAE", "规则", rootPath, path, externalCompatibilityCompatible, "", externalContentFile)
					if err == nil {
						add(candidate)
					}
				}
				return nil
			})
		}
		for _, candidate := range scanExternalSkillRoot(externalDataSourceTrae, "TRAE", rootPath, filepath.Join(projectTraeRoot, "skills"), "project", workspaceRoot, globalSkillsRoot) {
			add(candidate)
		}
	}

	for _, candidate := range scanKnownIncompatibleFiles(externalDataSourceTrae, "TRAE", rootPath) {
		add(candidate)
	}
	for _, candidate := range sessionCandidates {
		add(candidate)
	}
	if len(sessionCandidates) >= maxExternalSessionItems {
		messages = append(messages, fmt.Sprintf("会话摘要最多显示 %d 项；如需更精确地导入历史，请选择具体项目记忆目录。", maxExternalSessionItems))
	}
	if len(candidates) >= maxExternalImportItems {
		messages = append(messages, fmt.Sprintf("扫描结果已限制为前 %d 项，请选择更具体的目录后重试。", maxExternalImportItems))
	}
	if len(candidates) == 0 {
		messages = append(messages, "未发现可导入的 TRAE 记忆、规则、技能或会话摘要。请确认选择的是 ~/.trae-cn、项目根目录或 .trae 目录。")
	}
	sortExternalCandidates(candidates)
	return candidates, messages, nil
}

func (folderExternalDataAdapter) scan(rootPath, workspaceRoot, globalSkillsRoot string) ([]externalDataCandidate, []string, error) {
	var candidates []externalDataCandidate
	var messages []string
	visited := 0
	seenSkillRoots := map[string]bool{}

	err := filepath.WalkDir(rootPath, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		visited++
		if visited > maxExternalVisitedEntries || len(candidates) >= maxExternalImportItems {
			return filepath.SkipAll
		}
		if entry.IsDir() {
			if path != rootPath && (externalIgnoredDirectories[strings.ToLower(entry.Name())] || externalDepth(rootPath, path) > maxExternalImportDepth) {
				return filepath.SkipDir
			}
			skillFile := filepath.Join(path, voltSkill.SkillFile)
			if _, err := os.Lstat(skillFile); err == nil {
				candidate := newExternalSkillCandidate(externalDataSourceFolder, "本地文件夹", rootPath, path, "project", workspaceRoot, globalSkillsRoot)
				candidates = append(candidates, candidate)
				seenSkillRoots[path] = true
				return filepath.SkipDir
			}
			return nil
		}
		for skillRoot := range seenSkillRoots {
			if externalPathWithin(path, skillRoot) {
				return nil
			}
		}
		ext := strings.ToLower(filepath.Ext(entry.Name()))
		if entry.Type()&os.ModeSymlink != 0 && (externalDocumentExtensions[ext] || ext == ".jsonl" || externalDatabaseExtension(ext)) {
			candidate, err := newExternalIncompatibleCandidate(externalDataSourceFolder, "本地文件夹", rootPath, path, "符号链接可能指向所选目录之外，通用导入器不会读取。")
			if err == nil {
				candidates = append(candidates, candidate)
			}
			return nil
		}
		if externalDocumentExtensions[ext] || ext == ".jsonl" {
			compatibility := externalCompatibilityCompatible
			warning := ""
			mode := externalContentFile
			if ext == ".jsonl" {
				compatibility = externalCompatibilityWarning
				warning = "JSONL 可能包含日志或会话内容，将按纯文本导入；请先确认不含敏感信息。"
			}
			candidate, err := newExternalDocumentCandidate(externalDataSourceFolder, "本地文件夹", "文档", rootPath, path, compatibility, warning, mode)
			if err == nil {
				if candidate.View.Size > maxExternalDocumentBytes {
					candidate.View.Compatibility = externalCompatibilityIncompatible
					candidate.View.CompatibilityText = "不兼容"
					candidate.View.Warning = "单个外部文档超过 64 MiB，当前导入器不会加载该文件。"
					candidate.View.Target = externalTargetNone
					candidate.View.TargetLabel = "不导入"
					candidate.View.SelectedByDefault = false
				} else if candidate.View.Size > maxMaterialTextBytes {
					candidate.View.Compatibility = externalCompatibilityWarning
					candidate.View.CompatibilityText = "需确认"
					candidate.View.Warning = "文件较大，当前文本抽取器可能只索引部分可读内容；原文件不会被修改。"
					candidate.View.SelectedByDefault = false
				}
				candidates = append(candidates, candidate)
			}
			return nil
		}
		if externalDatabaseExtension(ext) {
			candidate, err := newExternalIncompatibleCandidate(externalDataSourceFolder, "本地文件夹", rootPath, path, "数据库文件的表结构、锁和索引格式无法通用迁移；请导入原始文档或使用专用适配器。")
			if err == nil {
				candidates = append(candidates, candidate)
			}
		}
		return nil
	})
	if err != nil {
		return nil, nil, err
	}
	if visited > maxExternalVisitedEntries || len(candidates) >= maxExternalImportItems {
		messages = append(messages, fmt.Sprintf("目录较大，扫描已限制为 %d 个目录项和 %d 个结果；请选择更具体的目录以获得完整结果。", maxExternalVisitedEntries, maxExternalImportItems))
	}
	if len(candidates) == 0 {
		messages = append(messages, "未发现支持的文档或 SKILL.md 技能包；未知二进制文件不会自动导入。")
	}
	sortExternalCandidates(candidates)
	return candidates, messages, nil
}

func normalizeExternalDataRoot(path string) (string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return "", errors.New("请选择外部数据目录")
	}
	abs, err := filepath.Abs(path)
	if err != nil {
		return "", err
	}
	abs = filepath.Clean(abs)
	info, err := os.Stat(abs)
	if err != nil {
		return "", fmt.Errorf("外部数据目录不可访问：%w", err)
	}
	if !info.IsDir() {
		return "", errors.New("外部数据路径必须是目录")
	}
	return abs, nil
}

func newExternalDocumentCandidate(sourceID, sourceName, category, rootPath, sourcePath, compatibility, warning, mode string) (externalDataCandidate, error) {
	info, err := os.Lstat(sourcePath)
	if err != nil {
		return externalDataCandidate{}, err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return externalDataCandidate{}, errors.New("外部文档必须是普通文件，不能是符号链接")
	}
	relative := externalRelativePath(rootPath, sourcePath)
	title := externalTitleForPath(category, relative)
	target := externalTargetKnowledge
	targetLabel := "Volt 知识库"
	selectedByDefault := compatibility == externalCompatibilityCompatible
	if info.Size() > maxExternalDocumentBytes {
		compatibility = externalCompatibilityIncompatible
		warning = "单个外部文档超过 64 MiB，当前导入器不会加载该文件。"
		target = externalTargetNone
		targetLabel = "不导入"
		selectedByDefault = false
	}
	return externalDataCandidate{
		View: ExternalDataImportItemView{
			ID:                externalCandidateID(sourceID, category, relative),
			Category:          category,
			Title:             title,
			RelativePath:      relative,
			Target:            target,
			TargetLabel:       targetLabel,
			Compatibility:     compatibility,
			CompatibilityText: externalCompatibilityLabel(compatibility),
			Warning:           warning,
			Size:              info.Size(),
			SelectedByDefault: selectedByDefault,
		},
		SourceID:    sourceID,
		SourceName:  sourceName,
		SourcePath:  sourcePath,
		ContentMode: mode,
	}, nil
}

func newExternalIncompatibleCandidate(sourceID, sourceName, rootPath, sourcePath, warning string) (externalDataCandidate, error) {
	info, err := os.Lstat(sourcePath)
	if err != nil {
		return externalDataCandidate{}, err
	}
	relative := externalRelativePath(rootPath, sourcePath)
	return externalDataCandidate{
		View: ExternalDataImportItemView{
			ID:                externalCandidateID(sourceID, "不兼容", relative),
			Category:          "不兼容",
			Title:             filepath.Base(sourcePath),
			RelativePath:      relative,
			Target:            externalTargetNone,
			TargetLabel:       "不导入",
			Compatibility:     externalCompatibilityIncompatible,
			CompatibilityText: "不兼容",
			Warning:           warning,
			Size:              info.Size(),
		},
		SourceID:   sourceID,
		SourceName: sourceName,
		SourcePath: sourcePath,
	}, nil
}

func newExternalSkillCandidate(sourceID, sourceName, rootPath, skillRoot, scope, workspaceRoot, globalSkillsRoot string) externalDataCandidate {
	name := filepath.Base(skillRoot)
	relative := externalRelativePath(rootPath, skillRoot)
	destination := externalSkillDestination(name, scope, workspaceRoot, globalSkillsRoot)
	compatibility := externalCompatibilityCompatible
	warning := ""
	selected := true
	size := externalDirectorySize(skillRoot, maxExternalSkillPackageBytes+1)
	skillFileInfo, skillFileErr := os.Lstat(filepath.Join(skillRoot, voltSkill.SkillFile))
	if skillFileErr != nil || !skillFileInfo.Mode().IsRegular() || skillFileInfo.Mode()&os.ModeSymlink != 0 {
		compatibility = externalCompatibilityIncompatible
		warning = "技能入口 SKILL.md 必须是包内普通文件，不能是符号链接。"
		selected = false
		destination = ""
	} else if size > maxExternalSkillPackageBytes {
		compatibility = externalCompatibilityIncompatible
		warning = fmt.Sprintf("技能包超过 %d MiB，当前导入器不会复制。", maxExternalSkillPackageBytes/(1024*1024))
		selected = false
		destination = ""
	} else if !voltSkill.IsValidName(name) {
		compatibility = externalCompatibilityIncompatible
		warning = "技能目录名不符合 Volt 技能命名规则。"
		selected = false
		destination = ""
	} else if _, err := os.Stat(destination); err == nil {
		compatibility = externalCompatibilityWarning
		warning = "目标位置已存在同名技能，导入时会安全跳过，不会覆盖。"
		selected = false
	}
	targetLabel := "Volt 项目技能"
	if scope == "global" || strings.TrimSpace(workspaceRoot) == "" {
		targetLabel = "Volt 全局技能"
	}
	return externalDataCandidate{
		View: ExternalDataImportItemView{
			ID:                externalCandidateID(sourceID, "技能", relative),
			Category:          "技能",
			Title:             name,
			RelativePath:      relative,
			Target:            externalTargetSkills,
			TargetLabel:       targetLabel,
			Compatibility:     compatibility,
			CompatibilityText: externalCompatibilityLabel(compatibility),
			Warning:           warning,
			Size:              size,
			SelectedByDefault: selected,
		},
		SourceID:        sourceID,
		SourceName:      sourceName,
		SourcePath:      skillRoot,
		DestinationPath: destination,
		SkillScope:      scope,
	}
}

func scanExternalSkillRoot(sourceID, sourceName, rootPath, skillRoot, scope, workspaceRoot, globalSkillsRoot string) []externalDataCandidate {
	info, err := os.Stat(skillRoot)
	if err != nil || !info.IsDir() {
		return nil
	}
	var candidates []externalDataCandidate
	_ = filepath.WalkDir(skillRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() {
			if path != skillRoot && externalDepth(skillRoot, path) > 3 {
				return filepath.SkipDir
			}
			if externalIgnoredDirectories[strings.ToLower(entry.Name())] {
				return filepath.SkipDir
			}
			skillFile := filepath.Join(path, voltSkill.SkillFile)
			if _, err := os.Lstat(skillFile); err == nil {
				candidates = append(candidates, newExternalSkillCandidate(sourceID, sourceName, rootPath, path, scope, workspaceRoot, globalSkillsRoot))
				return filepath.SkipDir
			}
		}
		return nil
	})
	return candidates
}

func scanKnownIncompatibleFiles(sourceID, sourceName, rootPath string) []externalDataCandidate {
	known := map[string]string{
		"knowledge.db": "TRAE 私有知识数据库无法保证表结构和索引兼容；Volt 会从原始记忆、规则和文档重新建立索引。",
		"traces.jsonl": "原始执行轨迹可能包含敏感对话和工具数据，通用导入器不会直接导入。",
	}
	var candidates []externalDataCandidate
	visited := 0
	_ = filepath.WalkDir(rootPath, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		visited++
		if visited > maxExternalVisitedEntries {
			return filepath.SkipAll
		}
		if entry.IsDir() {
			if path != rootPath && (externalIgnoredDirectories[strings.ToLower(entry.Name())] || externalDepth(rootPath, path) > 6) {
				return filepath.SkipDir
			}
			return nil
		}
		if warning, ok := known[strings.ToLower(entry.Name())]; ok {
			candidate, err := newExternalIncompatibleCandidate(sourceID, sourceName, rootPath, path, warning)
			if err == nil {
				candidates = append(candidates, candidate)
			}
		}
		return nil
	})
	return candidates
}

func executeExternalDataImport(candidates []externalDataCandidate, selectedIDs []string, store *knowledge.Store, storeErr error) ExternalDataImportResult {
	result, _ := executeExternalDataImportContext(context.Background(), candidates, selectedIDs, store, storeErr)
	return result
}

func executeExternalDataImportContext(ctx context.Context, candidates []externalDataCandidate, selectedIDs []string, store *knowledge.Store, storeErr error) (ExternalDataImportResult, error) {
	if err := ctx.Err(); err != nil {
		return ExternalDataImportResult{}, err
	}
	byID := make(map[string]externalDataCandidate, len(candidates))
	for _, candidate := range candidates {
		byID[candidate.View.ID] = candidate
	}
	selected := dedupeExternalStrings(selectedIDs)
	result := ExternalDataImportResult{Items: make([]ExternalDataImportResultItem, 0, len(selected))}

	existingHashes := map[string]bool{}
	if store != nil {
		if documents, err := store.ListDocuments(ctx); err == nil {
			for _, document := range documents {
				if document.ContentHash != "" {
					existingHashes[document.ContentHash] = true
				}
			}
		} else if ctx.Err() != nil {
			return result, ctx.Err()
		}
	}

	for _, id := range selected {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		candidate, ok := byID[id]
		if !ok {
			result.Failed++
			result.Items = append(result.Items, ExternalDataImportResultItem{ID: id, Status: "failed", Message: "来源内容已变化，请重新扫描后重试。"})
			continue
		}
		itemResult := ExternalDataImportResultItem{ID: id, Title: candidate.View.Title, Target: candidate.View.Target}
		if candidate.View.Compatibility == externalCompatibilityIncompatible {
			result.Skipped++
			itemResult.Status = "skipped"
			itemResult.Message = candidate.View.Warning
			result.Items = append(result.Items, itemResult)
			continue
		}
		switch candidate.View.Target {
		case externalTargetKnowledge:
			if store == nil {
				result.Failed++
				itemResult.Status = "failed"
				itemResult.Message = "Volt 知识库不可用"
				if storeErr != nil {
					itemResult.Message += "：" + storeErr.Error()
				}
				break
			}
			content, err := loadExternalCandidateContent(candidate)
			if err != nil {
				result.Failed++
				itemResult.Status = "failed"
				itemResult.Message = err.Error()
				break
			}
			if err := ctx.Err(); err != nil {
				return result, err
			}
			if strings.TrimSpace(content) == "" {
				result.Skipped++
				itemResult.Status = "skipped"
				itemResult.Message = "未提取到可索引文本"
				break
			}
			contentHash := externalKnowledgeContentHash(candidate.View.Title, content)
			if existingHashes[contentHash] {
				result.Skipped++
				itemResult.Status = "skipped"
				itemResult.Message = "相同内容已存在于知识库"
				break
			}
			document, err := store.Import(ctx, knowledge.ImportInput{
				ID:          externalKnowledgeDocumentID(candidate.SourceID, candidate.SourcePath),
				Title:       candidate.View.Title,
				Type:        candidate.View.Category,
				Source:      candidate.SourceName + " · " + candidate.View.RelativePath,
				Tags:        strings.Join([]string{"外部导入", candidate.SourceName, candidate.View.Category}, ","),
				Description: externalImportDescription(candidate),
				FileName:    filepath.Base(candidate.SourcePath),
				FilePath:    candidate.View.RelativePath,
				MimeType:    mime.TypeByExtension(strings.ToLower(filepath.Ext(candidate.SourcePath))),
				FileSize:    candidate.View.Size,
				Content:     content,
			})
			if err != nil {
				if ctx.Err() != nil {
					return result, ctx.Err()
				}
				result.Failed++
				itemResult.Status = "failed"
				itemResult.Message = err.Error()
				break
			}
			existingHashes[document.ContentHash] = true
			result.Imported++
			itemResult.Status = "imported"
			itemResult.Message = fmt.Sprintf("已建立 %d 个知识切片", document.ChunkCount)
		case externalTargetSkills:
			if candidate.DestinationPath == "" {
				result.Skipped++
				itemResult.Status = "skipped"
				itemResult.Message = candidate.View.Warning
				break
			}
			if _, err := os.Stat(candidate.DestinationPath); err == nil {
				result.Skipped++
				itemResult.Status = "skipped"
				itemResult.Message = "目标已存在同名技能，未覆盖"
				break
			}
			if err := copyExternalSkillPackageContext(ctx, candidate.SourcePath, candidate.DestinationPath); err != nil {
				if ctx.Err() != nil {
					return result, ctx.Err()
				}
				result.Failed++
				itemResult.Status = "failed"
				itemResult.Message = err.Error()
				break
			}
			result.Imported++
			itemResult.Status = "imported"
			itemResult.Message = "技能包已复制，脚本与参考文件保持原目录结构"
		default:
			result.Skipped++
			itemResult.Status = "skipped"
			itemResult.Message = "该项目没有可用的导入目标"
		}
		result.Items = append(result.Items, itemResult)
	}
	return result, nil
}

func loadExternalCandidateContent(candidate externalDataCandidate) (string, error) {
	info, err := os.Lstat(candidate.SourcePath)
	if err != nil {
		return "", err
	}
	if !info.Mode().IsRegular() || info.Mode()&os.ModeSymlink != 0 {
		return "", errors.New("外部文档已变为非普通文件或符号链接，请重新扫描")
	}
	if candidate.View.Size > maxExternalDocumentBytes {
		return "", errors.New("外部文档超过 64 MiB，未加载")
	}
	if candidate.ContentMode == externalContentTraeSession {
		return extractTraeSessionSummary(candidate.SourcePath)
	}
	if strings.EqualFold(filepath.Ext(candidate.SourcePath), ".jsonl") {
		return extractPlainTextFile(candidate.SourcePath)
	}
	return extractProjectMaterialText(candidate.SourcePath, mime.TypeByExtension(strings.ToLower(filepath.Ext(candidate.SourcePath))), filepath.Base(candidate.SourcePath))
}

func extractTraeSessionSummary(path string) (string, error) {
	file, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer file.Close()

	scanner := bufio.NewScanner(io.LimitReader(file, maxExternalSessionTextBytes+1))
	scanner.Buffer(make([]byte, 64*1024), maxExternalSessionTextBytes)
	var output strings.Builder
	recordCount := 0
	for scanner.Scan() {
		var record map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &record); err != nil {
			return "", fmt.Errorf("会话摘要 JSONL 解析失败：%w", err)
		}
		recordCount++
		if recordCount > 1 {
			output.WriteString("\n\n---\n")
		}
		for _, field := range []struct {
			key   string
			label string
		}{{"intent", "意图"}, {"learned", "沉淀知识"}, {"outcome", "结果"}, {"actions", "行动"}} {
			text := externalJSONValueText(record[field.key])
			if text == "" {
				continue
			}
			output.WriteString("\n## ")
			output.WriteString(field.label)
			output.WriteString("\n\n")
			output.WriteString(text)
			output.WriteByte('\n')
		}
		if output.Len() > maxExternalSessionTextBytes {
			return "", errors.New("会话摘要提取结果超过 2 MiB")
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("读取会话摘要失败：%w", err)
	}
	if strings.TrimSpace(output.String()) == "" {
		return "", errors.New("会话摘要中没有可导入的意图、知识、结果或行动字段")
	}
	return strings.TrimSpace(output.String()), nil
}

func externalJSONValueText(value any) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case []any:
		parts := make([]string, 0, len(typed))
		for _, item := range typed {
			if text := externalJSONValueText(item); text != "" {
				parts = append(parts, "- "+text)
			}
		}
		return strings.Join(parts, "\n")
	default:
		encoded, err := json.MarshalIndent(value, "", "  ")
		if err != nil {
			return ""
		}
		return strings.TrimSpace(string(encoded))
	}
}

func copyExternalSkillPackage(sourceRoot, destination string) error {
	return copyExternalSkillPackageContext(context.Background(), sourceRoot, destination)
}

func copyExternalSkillPackageContext(ctx context.Context, sourceRoot, destination string) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	skillFileInfo, err := os.Lstat(filepath.Join(sourceRoot, voltSkill.SkillFile))
	if err != nil || !skillFileInfo.Mode().IsRegular() || skillFileInfo.Mode()&os.ModeSymlink != 0 {
		return errors.New("技能包缺少 SKILL.md")
	}
	if _, err := os.Stat(destination); err == nil {
		return os.ErrExist
	}
	parent := filepath.Dir(destination)
	if err := os.MkdirAll(parent, 0o755); err != nil {
		return err
	}
	temporary, err := os.MkdirTemp(parent, ".external-skill-import-*")
	if err != nil {
		return err
	}
	defer os.RemoveAll(temporary)

	var copied int64
	err = filepath.WalkDir(sourceRoot, func(path string, entry os.DirEntry, walkErr error) error {
		if err := ctx.Err(); err != nil {
			return err
		}
		if walkErr != nil {
			return walkErr
		}
		relative, err := filepath.Rel(sourceRoot, path)
		if err != nil {
			return err
		}
		if relative == "." {
			return nil
		}
		if entry.IsDir() {
			if externalIgnoredDirectories[strings.ToLower(entry.Name())] {
				return filepath.SkipDir
			}
			return os.MkdirAll(filepath.Join(temporary, relative), 0o755)
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return err
		}
		copied += info.Size()
		if copied > maxExternalSkillPackageBytes {
			return fmt.Errorf("技能包超过 %d MiB", maxExternalSkillPackageBytes/(1024*1024))
		}
		input, err := os.Open(path)
		if err != nil {
			return err
		}
		target := filepath.Join(temporary, relative)
		if err := os.MkdirAll(filepath.Dir(target), 0o755); err != nil {
			_ = input.Close()
			return err
		}
		mode := info.Mode().Perm()
		if mode == 0 {
			mode = 0o644
		}
		output, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, mode)
		if err != nil {
			_ = input.Close()
			return err
		}
		_, copyErr := io.Copy(output, contextReader{ctx: ctx, reader: input})
		inputCloseErr := input.Close()
		closeErr := output.Close()
		if copyErr != nil {
			return copyErr
		}
		if inputCloseErr != nil {
			return inputCloseErr
		}
		return closeErr
	})
	if err != nil {
		return err
	}
	if _, err := os.Stat(filepath.Join(temporary, voltSkill.SkillFile)); err != nil {
		return errors.New("技能包复制后缺少 SKILL.md")
	}
	if err := os.Rename(temporary, destination); err != nil {
		return err
	}
	return nil
}

type contextReader struct {
	ctx    context.Context
	reader io.Reader
}

func (r contextReader) Read(p []byte) (int, error) {
	if err := r.ctx.Err(); err != nil {
		return 0, err
	}
	return r.reader.Read(p)
}

func externalSelectionNeedsKnowledge(candidates []externalDataCandidate, selected []string) bool {
	wanted := map[string]bool{}
	for _, id := range selected {
		wanted[id] = true
	}
	for _, candidate := range candidates {
		if wanted[candidate.View.ID] && candidate.View.Target == externalTargetKnowledge && candidate.View.Compatibility != externalCompatibilityIncompatible {
			return true
		}
	}
	return false
}

func externalResultImportedSkills(result ExternalDataImportResult) bool {
	for _, item := range result.Items {
		if item.Status == "imported" && item.Target == externalTargetSkills {
			return true
		}
	}
	return false
}

func externalSkillDestination(name, scope, workspaceRoot, globalSkillsRoot string) string {
	if scope == "project" && strings.TrimSpace(workspaceRoot) != "" {
		return filepath.Join(workspaceRoot, ".voltui", voltSkill.SkillsDirname, name)
	}
	return filepath.Join(globalSkillsRoot, name)
}

func externalCompatibilityLabel(compatibility string) string {
	switch compatibility {
	case externalCompatibilityCompatible:
		return "兼容"
	case externalCompatibilityWarning:
		return "需确认"
	default:
		return "不兼容"
	}
}

func externalCandidateID(sourceID, category, relative string) string {
	sum := sha256.Sum256([]byte(sourceID + "\n" + category + "\n" + filepath.ToSlash(relative)))
	return "external-" + hex.EncodeToString(sum[:10])
}

func externalKnowledgeDocumentID(sourceID, sourcePath string) string {
	sum := sha256.Sum256([]byte(sourceID + "\n" + filepath.ToSlash(filepath.Clean(sourcePath))))
	return "external-doc-" + hex.EncodeToString(sum[:10])
}

func externalKnowledgeContentHash(title, content string) string {
	normalized := strings.TrimSpace(strings.Join(strings.Fields(strings.ReplaceAll(content, "\x00", " ")), " "))
	sum := sha256.Sum256([]byte(strings.TrimSpace(title) + "\n" + normalized))
	return hex.EncodeToString(sum[:])
}

func externalImportDescription(candidate externalDataCandidate) string {
	description := "从 " + candidate.SourceName + " 导入，原始数据保持只读。"
	if candidate.View.Warning != "" {
		description += " " + candidate.View.Warning
	}
	return description
}

func externalRelativePath(rootPath, path string) string {
	relative, err := filepath.Rel(rootPath, path)
	if err != nil || strings.HasPrefix(relative, "..") {
		return filepath.ToSlash(filepath.Base(path))
	}
	return filepath.ToSlash(relative)
}

func externalTitleForPath(category, relative string) string {
	base := strings.TrimSuffix(filepath.Base(relative), filepath.Ext(relative))
	base = strings.NewReplacer("_", " ", "-", " ").Replace(base)
	base = strings.TrimSpace(base)
	if base == "" {
		base = category
	}
	parent := filepath.Base(filepath.Dir(relative))
	if (strings.EqualFold(filepath.Base(relative), "project_memory.md") || strings.EqualFold(filepath.Base(relative), "topics.md")) && parent != "." && parent != "memory" {
		return parent + " · " + base
	}
	return base
}

func externalDepth(rootPath, path string) int {
	relative, err := filepath.Rel(rootPath, path)
	if err != nil || relative == "." {
		return 0
	}
	return len(strings.Split(filepath.Clean(relative), string(filepath.Separator)))
}

func externalPathWithin(path, root string) bool {
	relative, err := filepath.Rel(root, path)
	return err == nil && relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))
}

func externalDatabaseExtension(ext string) bool {
	switch strings.ToLower(ext) {
	case ".db", ".sqlite", ".sqlite3":
		return true
	default:
		return false
	}
}

func externalDirectorySize(root string, stopAfter int64) int64 {
	var total int64
	_ = filepath.WalkDir(root, func(path string, entry os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return nil
		}
		if entry.IsDir() {
			if path != root && externalIgnoredDirectories[strings.ToLower(entry.Name())] {
				return filepath.SkipDir
			}
			return nil
		}
		if !entry.Type().IsRegular() {
			return nil
		}
		if info, err := entry.Info(); err == nil {
			total += info.Size()
		}
		if stopAfter > 0 && total > stopAfter {
			return filepath.SkipAll
		}
		return nil
	})
	return total
}

func dedupeExternalPaths(paths []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(paths))
	for _, path := range paths {
		path = filepath.Clean(path)
		if seen[path] {
			continue
		}
		seen[path] = true
		result = append(result, path)
	}
	return result
}

func dedupeExternalStrings(values []string) []string {
	seen := map[string]bool{}
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" || seen[value] {
			continue
		}
		seen[value] = true
		result = append(result, value)
	}
	return result
}

func sortExternalCandidates(candidates []externalDataCandidate) {
	sort.SliceStable(candidates, func(i, j int) bool {
		left := candidates[i].View
		right := candidates[j].View
		if left.Compatibility != right.Compatibility {
			order := map[string]int{externalCompatibilityCompatible: 0, externalCompatibilityWarning: 1, externalCompatibilityIncompatible: 2}
			return order[left.Compatibility] < order[right.Compatibility]
		}
		if left.Category != right.Category {
			return left.Category < right.Category
		}
		return left.RelativePath < right.RelativePath
	})
}
