package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"voltui/internal/config"
	"voltui/internal/fileutil"
)

const workbenchProjectMaterialsFile = "workbench-project-materials.json"

type WorkbenchProjectMaterialView struct {
	ID          string `json:"id"`
	ProjectID   string `json:"projectId"`
	ProjectName string `json:"projectName,omitempty"`
	Title       string `json:"title"`
	Category    string `json:"category"`
	Source      string `json:"source"`
	Status      string `json:"status"`
	UpdatedAt   string `json:"updatedAt"`
	Desc        string `json:"desc"`
	FileName    string `json:"fileName,omitempty"`
	FilePath    string `json:"filePath,omitempty"`
	FileSize    int64  `json:"fileSize,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
	CreatedAt   string `json:"createdAt"`
	UpdatedISO  string `json:"updatedISO"`
}

type WorkbenchProjectMaterialInput struct {
	ID          string `json:"id"`
	ProjectID   string `json:"projectId"`
	ProjectName string `json:"projectName"`
	Title       string `json:"title"`
	Category    string `json:"category"`
	Source      string `json:"source"`
	Status      string `json:"status"`
	Desc        string `json:"desc"`
	FileName    string `json:"fileName"`
	FilePath    string `json:"filePath"`
	FileSize    int64  `json:"fileSize"`
	MimeType    string `json:"mimeType"`
}

type workbenchProjectMaterialsDiskFile struct {
	Materials []WorkbenchProjectMaterialView `json:"materials"`
}

func (a *App) ListProjectMaterials() ([]WorkbenchProjectMaterialView, error) {
	materials, err := loadProjectMaterials()
	if err != nil {
		return nil, err
	}
	return materials, nil
}

func (a *App) SaveProjectMaterial(input WorkbenchProjectMaterialInput) (WorkbenchProjectMaterialView, error) {
	return saveProjectMaterialInput(input)
}

func (a *App) SaveProjectMaterialsBatch(inputs []WorkbenchProjectMaterialInput) ([]WorkbenchProjectMaterialView, error) {
	if len(inputs) == 0 {
		return nil, errors.New("material batch is empty")
	}
	saved := make([]WorkbenchProjectMaterialView, 0, len(inputs))
	for _, input := range inputs {
		material, err := saveProjectMaterialInput(input)
		if err != nil {
			return nil, err
		}
		saved = append(saved, material)
	}
	return saved, nil
}

func (a *App) DeleteProjectMaterial(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("material id is required")
	}
	materials, err := loadProjectMaterials()
	if err != nil {
		return err
	}
	next := materials[:0]
	for _, material := range materials {
		if material.ID == id {
			continue
		}
		next = append(next, material)
	}
	_ = deleteKnowledgeDocument(id)
	return saveProjectMaterials(next)
}

func saveProjectMaterialInput(input WorkbenchProjectMaterialInput) (WorkbenchProjectMaterialView, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return WorkbenchProjectMaterialView{}, errors.New("material title is required")
	}
	projectID := strings.TrimSpace(input.ProjectID)
	if projectID == "" {
		return WorkbenchProjectMaterialView{}, errors.New("project id is required")
	}
	materials, err := loadProjectMaterials()
	if err != nil {
		return WorkbenchProjectMaterialView{}, err
	}
	now := time.Now()
	nowISO := now.Format(time.RFC3339)
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = uniqueProjectMaterialID(slugifyAgentID(title), materials)
	}
	next := WorkbenchProjectMaterialView{
		ID:          id,
		ProjectID:   projectID,
		ProjectName: strings.TrimSpace(input.ProjectName),
		Title:       title,
		Category:    defaultString(strings.TrimSpace(input.Category), "项目资料"),
		Source:      defaultString(strings.TrimSpace(input.Source), "manual"),
		Status:      defaultString(strings.TrimSpace(input.Status), "待复核"),
		UpdatedAt:   "刚刚",
		Desc:        strings.TrimSpace(input.Desc),
		FileName:    strings.TrimSpace(input.FileName),
		FilePath:    strings.TrimSpace(input.FilePath),
		FileSize:    maxInt64(input.FileSize, 0),
		MimeType:    strings.TrimSpace(input.MimeType),
		CreatedAt:   nowISO,
		UpdatedISO:  nowISO,
	}
	if status, err := indexProjectMaterialIntoKnowledge(next); err == nil {
		next.Status = status
	} else {
		next.Status = "索引失败"
	}
	replaced := false
	for i, existing := range materials {
		if existing.ID != id {
			continue
		}
		next.CreatedAt = defaultString(existing.CreatedAt, nowISO)
		materials[i] = next
		replaced = true
		break
	}
	if !replaced {
		materials = append([]WorkbenchProjectMaterialView{next}, materials...)
	}
	sortProjectMaterials(materials)
	if err := saveProjectMaterials(materials); err != nil {
		return WorkbenchProjectMaterialView{}, err
	}
	return next, nil
}

func indexProjectMaterialIntoKnowledge(material WorkbenchProjectMaterialView) (string, error) {
	content := strings.TrimSpace(material.Desc)
	if strings.TrimSpace(material.FilePath) != "" {
		extracted, err := extractProjectMaterialText(material.FilePath, material.MimeType, material.FileName)
		if err != nil {
			return "索引失败", err
		}
		if strings.TrimSpace(extracted) != "" {
			content = extracted
		}
	}
	if strings.TrimSpace(content) == "" {
		content = strings.Join([]string{material.Title, material.Category, material.Source}, "\n")
	}
	doc, err := importKnowledgeDocument(KnowledgeDocumentImportInput{
		ID:          material.ID,
		Title:       material.Title,
		Type:        defaultString(material.Category, "项目资料"),
		Source:      defaultString(material.Source, "project-material"),
		Tags:        material.Category,
		Description: material.Desc,
		FileName:    material.FileName,
		FilePath:    material.FilePath,
		MimeType:    material.MimeType,
		FileSize:    material.FileSize,
		Content:     content,
	})
	if err != nil {
		return "索引失败", err
	}
	if doc.ChunkCount == 0 {
		return "无可索引文本", nil
	}
	return "已索引", nil
}

func projectMaterialsPath() (string, error) {
	userConfig := config.UserConfigPath()
	if strings.TrimSpace(userConfig) == "" {
		return "", errors.New("user config dir is unavailable")
	}
	return filepath.Join(filepath.Dir(userConfig), workbenchProjectMaterialsFile), nil
}

func loadProjectMaterials() ([]WorkbenchProjectMaterialView, error) {
	path, err := projectMaterialsPath()
	if err != nil {
		return defaultProjectMaterials(), nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultProjectMaterials(), nil
		}
		return nil, err
	}
	var disk workbenchProjectMaterialsDiskFile
	if err := json.Unmarshal(b, &disk); err != nil {
		return nil, err
	}
	materials := make([]WorkbenchProjectMaterialView, 0, len(disk.Materials))
	for _, material := range disk.Materials {
		material = normalizeProjectMaterial(material)
		if material.ID != "" {
			materials = append(materials, material)
		}
	}
	sortProjectMaterials(materials)
	return materials, nil
}

func saveProjectMaterials(materials []WorkbenchProjectMaterialView) error {
	path, err := projectMaterialsPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(workbenchProjectMaterialsDiskFile{Materials: materials}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".workbench-project-materials.*.tmp")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	if _, err := tmp.Write(b); err != nil {
		tmp.Close()
		os.Remove(tmpPath)
		return err
	}
	if err := tmp.Close(); err != nil {
		os.Remove(tmpPath)
		return err
	}
	return fileutil.ReplaceFile(tmpPath, path)
}

func defaultProjectMaterials() []WorkbenchProjectMaterialView {
	now := time.Now().Format(time.RFC3339)
	return []WorkbenchProjectMaterialView{
		{ID: "volt-gui-aoristlawer-map", ProjectID: "volt-gui", ProjectName: "Volt GUI 桌面端重构", Title: "AORISTLAWER 项目详情源码对照", Category: "参考资料", Source: "MatterDetailPage.tsx", Status: "已关联", UpdatedAt: "28 分钟前", Desc: "映射概览、资料、日程、报告、待办五个标签页。", CreatedAt: now, UpdatedISO: now},
		{ID: "volt-gui-ia-notes", ProjectID: "volt-gui", ProjectName: "Volt GUI 桌面端重构", Title: "Volt GUI 工作台 IA 调整记录", Category: "需求资料", Source: "App.svelte", Status: "已索引", UpdatedAt: "今天", Desc: "覆盖项目管理、客户管理、能力中心与资料中心入口调整。", CreatedAt: now, UpdatedISO: now},
		{ID: "volt-gui-quality-gate", ProjectID: "volt-gui", ProjectName: "Volt GUI 桌面端重构", Title: "桌面前端质量门禁说明", Category: "验证资料", Source: "desktop/frontend", Status: "已同步", UpdatedAt: "今天", Desc: "记录 Svelte 检查、Vite 构建和本地预览回归要求。", CreatedAt: now, UpdatedISO: now},
		{ID: "volt-gui-relation-sample", ProjectID: "volt-gui", ProjectName: "Volt GUI 桌面端重构", Title: "客户与项目关联样例", Category: "业务资料", Source: "local", Status: "待复核", UpdatedAt: "昨天", Desc: "用于验证项目详情与客户详情之间的跳转和任务关联。", CreatedAt: now, UpdatedISO: now},
		{ID: "lurefree-release-checklist", ProjectID: "lurefree", ProjectName: "Lurefree 小程序发布", Title: "小程序发布清单", Category: "发布资料", Source: "lurefree", Status: "已索引", UpdatedAt: "2 小时前", Desc: "包体、地图交互、图钉资产与发布前检查记录。", CreatedAt: now, UpdatedISO: now},
		{ID: "lurefree-map-regression", ProjectID: "lurefree", ProjectName: "Lurefree 小程序发布", Title: "地图交互回归记录", Category: "验证资料", Source: "dist/wx", Status: "待复核", UpdatedAt: "今天", Desc: "确认运行产物和源码行为一致。", CreatedAt: now, UpdatedISO: now},
		{ID: "homepage-restore-log", ProjectID: "homepage", ProjectName: "品牌主页恢复与部署", Title: "历史版本恢复记录", Category: "归档资料", Source: "_restore-backups", Status: "已归档", UpdatedAt: "昨天", Desc: "记录恢复来源、构建验证和无截图校验边界。", CreatedAt: now, UpdatedISO: now},
	}
}

func normalizeProjectMaterial(material WorkbenchProjectMaterialView) WorkbenchProjectMaterialView {
	material.ID = strings.TrimSpace(material.ID)
	material.ProjectID = strings.TrimSpace(material.ProjectID)
	material.Title = strings.TrimSpace(material.Title)
	if material.Title == "" || material.ProjectID == "" {
		return WorkbenchProjectMaterialView{}
	}
	if material.ID == "" {
		material.ID = slugifyAgentID(material.Title)
	}
	material.ProjectName = strings.TrimSpace(material.ProjectName)
	material.Category = defaultString(strings.TrimSpace(material.Category), "项目资料")
	material.Source = defaultString(strings.TrimSpace(material.Source), "manual")
	material.Status = defaultString(strings.TrimSpace(material.Status), "待复核")
	material.UpdatedAt = defaultString(strings.TrimSpace(material.UpdatedAt), "刚刚")
	material.Desc = strings.TrimSpace(material.Desc)
	material.FileName = strings.TrimSpace(material.FileName)
	material.FilePath = strings.TrimSpace(material.FilePath)
	material.FileSize = maxInt64(material.FileSize, 0)
	material.MimeType = strings.TrimSpace(material.MimeType)
	now := time.Now().Format(time.RFC3339)
	material.CreatedAt = defaultString(material.CreatedAt, now)
	material.UpdatedISO = defaultString(material.UpdatedISO, material.CreatedAt)
	return material
}

func maxInt64(value, min int64) int64 {
	if value < min {
		return min
	}
	return value
}

func sortProjectMaterials(materials []WorkbenchProjectMaterialView) {
	sort.SliceStable(materials, func(i, j int) bool {
		return materials[i].UpdatedISO > materials[j].UpdatedISO
	})
}

func uniqueProjectMaterialID(base string, materials []WorkbenchProjectMaterialView) string {
	base = defaultString(strings.TrimSpace(base), "material")
	used := make(map[string]struct{}, len(materials))
	for _, material := range materials {
		used[material.ID] = struct{}{}
	}
	if _, ok := used[base]; !ok {
		return base
	}
	for i := 2; ; i++ {
		candidate := base + "-" + strconv.Itoa(i)
		if _, ok := used[candidate]; !ok {
			return candidate
		}
	}
}
