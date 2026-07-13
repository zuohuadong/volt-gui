package main

import (
	"archive/zip"
	"bytes"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf16"

	"voltui/internal/config"
	"voltui/internal/fileutil"
)

const workbenchDataFile = "workbench-data.json"

type WorkbenchDataView struct {
	Customers          []WorkbenchCustomerView          `json:"customers"`
	CalendarEvents     []WorkbenchCalendarEventView     `json:"calendarEvents"`
	Reports            []WorkbenchReportView            `json:"reports"`
	KnowledgeDocuments []WorkbenchKnowledgeDocumentView `json:"knowledgeDocuments"`
	Regulations        []WorkbenchRegulationView        `json:"regulations"`
	SyncJobs           []WorkbenchSyncJobView           `json:"syncJobs"`
	OperationLogs      []WorkbenchOperationLogView      `json:"operationLogs"`
	TeamRooms          []WorkbenchTeamRoomView          `json:"teamRooms"`
	TeamRuns           []WorkbenchTeamRunView           `json:"teamRuns"`
	TeamChatMessages   []WorkbenchTeamChatMessageView   `json:"teamChatMessages"`
	Initialized        bool                             `json:"initialized,omitempty"`
}

type WorkbenchCustomerView struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Contact     string   `json:"contact"`
	Phone       string   `json:"phone"`
	Email       string   `json:"email"`
	Risk        string   `json:"risk"`
	RiskLevel   string   `json:"riskLevel"`
	Status      string   `json:"status"`
	Owner       string   `json:"owner"`
	Stage       string   `json:"stage"`
	Industry    string   `json:"industry"`
	Region      string   `json:"region"`
	Address     string   `json:"address"`
	Note        string   `json:"note"`
	Desc        string   `json:"desc"`
	ProjectIDs  []string `json:"projectIds"`
	Matters     int      `json:"matters"`
	Materials   int      `json:"materials"`
	Events      int      `json:"events"`
	Todos       int      `json:"todos"`
	Reports     int      `json:"reports"`
	LastTouch   string   `json:"lastTouch"`
	LastContact string   `json:"lastContact"`
	NextAction  string   `json:"nextAction"`
	Tags        []string `json:"tags"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
}

type WorkbenchCustomerInput struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Type        string   `json:"type"`
	Contact     string   `json:"contact"`
	Phone       string   `json:"phone"`
	Email       string   `json:"email"`
	Risk        string   `json:"risk"`
	RiskLevel   string   `json:"riskLevel"`
	Status      string   `json:"status"`
	Owner       string   `json:"owner"`
	Stage       string   `json:"stage"`
	Industry    string   `json:"industry"`
	Region      string   `json:"region"`
	Address     string   `json:"address"`
	Note        string   `json:"note"`
	Desc        string   `json:"desc"`
	ProjectIDs  []string `json:"projectIds"`
	Matters     int      `json:"matters"`
	Materials   int      `json:"materials"`
	Events      int      `json:"events"`
	Todos       int      `json:"todos"`
	Reports     int      `json:"reports"`
	LastTouch   string   `json:"lastTouch"`
	LastContact string   `json:"lastContact"`
	NextAction  string   `json:"nextAction"`
	Tags        []string `json:"tags"`
}

type WorkbenchCalendarEventView struct {
	ID         string `json:"id"`
	Date       string `json:"date,omitempty"`
	Day        string `json:"day"`
	Title      string `json:"title"`
	Time       string `json:"time"`
	Type       string `json:"type"`
	Place      string `json:"place"`
	ProjectID  string `json:"projectId,omitempty"`
	CustomerID string `json:"customerId,omitempty"`
	Status     string `json:"status,omitempty"`
	Desc       string `json:"desc,omitempty"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

type WorkbenchCalendarEventInput struct {
	ID         string `json:"id"`
	Date       string `json:"date"`
	Day        string `json:"day"`
	Title      string `json:"title"`
	Time       string `json:"time"`
	Type       string `json:"type"`
	Place      string `json:"place"`
	ProjectID  string `json:"projectId"`
	CustomerID string `json:"customerId"`
	Status     string `json:"status"`
	Desc       string `json:"desc"`
}

type WorkbenchReportView struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Status     string `json:"status"`
	Owner      string `json:"owner"`
	Desc       string `json:"desc"`
	Body       string `json:"body,omitempty"`
	Kind       string `json:"kind,omitempty"`
	ProjectID  string `json:"projectId,omitempty"`
	CustomerID string `json:"customerId,omitempty"`
	Source     string `json:"source,omitempty"`
	Format     string `json:"format,omitempty"`
	Priority   string `json:"priority,omitempty"`
	DueAt      string `json:"dueAt,omitempty"`
	CreatedAt  string `json:"createdAt"`
	UpdatedAt  string `json:"updatedAt"`
}

type WorkbenchReportInput struct {
	ID         string `json:"id"`
	Title      string `json:"title"`
	Status     string `json:"status"`
	Owner      string `json:"owner"`
	Desc       string `json:"desc"`
	Body       string `json:"body"`
	Kind       string `json:"kind"`
	ProjectID  string `json:"projectId"`
	CustomerID string `json:"customerId"`
	Source     string `json:"source"`
	Format     string `json:"format"`
	Priority   string `json:"priority"`
	DueAt      string `json:"dueAt"`
}

type WorkbenchKnowledgeDocumentView struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Type        string   `json:"type"`
	Count       int      `json:"count"`
	Status      string   `json:"status"`
	Description string   `json:"description,omitempty"`
	Content     string   `json:"content,omitempty"`
	Source      string   `json:"source,omitempty"`
	Tags        string   `json:"tags,omitempty"`
	FileName    string   `json:"fileName,omitempty"`
	FilePath    string   `json:"filePath,omitempty"`
	MimeType    string   `json:"mimeType,omitempty"`
	FileSize    int64    `json:"fileSize,omitempty"`
	ChunkCount  int      `json:"chunkCount,omitempty"`
	IndexedAt   string   `json:"indexedAt,omitempty"`
	Error       string   `json:"error,omitempty"`
	MaterialIDs []string `json:"materialIds,omitempty"`
	CreatedAt   string   `json:"createdAt"`
	UpdatedAt   string   `json:"updatedAt"`
}

type WorkbenchKnowledgeDocumentInput struct {
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	Type        string   `json:"type"`
	Count       int      `json:"count"`
	Status      string   `json:"status"`
	Description string   `json:"description"`
	Content     string   `json:"content"`
	Source      string   `json:"source"`
	Tags        string   `json:"tags"`
	MaterialIDs []string `json:"materialIds"`
}

type WorkbenchRegulationView struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Category  string `json:"category"`
	Status    string `json:"status"`
	Tags      string `json:"tags"`
	Content   string `json:"content,omitempty"`
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

type WorkbenchSearchResultView struct {
	Title   string `json:"title"`
	Scope   string `json:"scope"`
	Snippet string `json:"snippet"`
}

type WorkbenchSyncJobView struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Status    string `json:"status"`
	Progress  string `json:"progress"`
	Time      string `json:"time"`
	UpdatedAt string `json:"updatedAt"`
}

type WorkbenchOperationLogView struct {
	ID        string `json:"id"`
	Action    string `json:"action"`
	Target    string `json:"target"`
	User      string `json:"user"`
	Time      string `json:"time"`
	Result    string `json:"result"`
	CreatedAt string `json:"createdAt"`
}

type WorkbenchTeamRunStepView struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Owner  string `json:"owner"`
	Status string `json:"status"`
	Detail string `json:"detail"`
}

type WorkbenchTeamRoomView struct {
	ID             string                     `json:"id"`
	Title          string                     `json:"title"`
	Members        int                        `json:"members"`
	Active         string                     `json:"active"`
	Desc           string                     `json:"desc"`
	Leader         string                     `json:"leader"`
	LeaderID       string                     `json:"leaderId"`
	Status         string                     `json:"status"`
	Topic          string                     `json:"topic"`
	Queue          string                     `json:"queue"`
	MemberIDs      []string                   `json:"memberIds"`
	Avatars        []string                   `json:"avatars"`
	Mode           string                     `json:"mode"`
	SharedContext  string                     `json:"sharedContext"`
	RunState       string                     `json:"runState"`
	NextCheckpoint string                     `json:"nextCheckpoint"`
	Outcome        string                     `json:"outcome"`
	Controls       []string                   `json:"controls"`
	Artifacts      []string                   `json:"artifacts"`
	Steps          []WorkbenchTeamRunStepView `json:"steps"`
	CreatedAt      string                     `json:"createdAt"`
	UpdatedAt      string                     `json:"updatedAt"`
}

type WorkbenchTeamRunEventView struct {
	ID     string `json:"id"`
	Time   string `json:"time"`
	Actor  string `json:"actor"`
	Type   string `json:"type"`
	Detail string `json:"detail"`
}

type WorkbenchTeamRunArtifactView struct {
	ID     string `json:"id"`
	Title  string `json:"title"`
	Type   string `json:"type"`
	Status string `json:"status"`
	Path   string `json:"path,omitempty"`
}

type WorkbenchTeamRunView struct {
	ID            string                         `json:"id"`
	TeamID        string                         `json:"teamId"`
	Title         string                         `json:"title"`
	Status        string                         `json:"status"`
	Task          string                         `json:"task"`
	CreatedAt     string                         `json:"createdAt"`
	UpdatedAt     string                         `json:"updatedAt"`
	CurrentStepID string                         `json:"currentStepId"`
	Events        []WorkbenchTeamRunEventView    `json:"events"`
	Artifacts     []WorkbenchTeamRunArtifactView `json:"artifacts"`
}

type WorkbenchTeamChatMessageView struct {
	ID          string `json:"id"`
	TeamID      string `json:"teamId"`
	Role        string `json:"role"`
	AgentID     string `json:"agentId,omitempty"`
	AgentName   string `json:"agentName,omitempty"`
	AgentAvatar string `json:"agentAvatar,omitempty"`
	Content     string `json:"content"`
	CreatedAt   string `json:"createdAt,omitempty"`
}

func (a *App) ListWorkbenchData() (WorkbenchDataView, error) {
	return loadWorkbenchData()
}

func (a *App) ListCustomers() ([]WorkbenchCustomerView, error) {
	data, err := loadWorkbenchData()
	return data.Customers, err
}

func (a *App) SaveCustomer(input WorkbenchCustomerInput) (WorkbenchCustomerView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return WorkbenchCustomerView{}, err
	}
	customer, err := saveCustomerInto(&data, input)
	if err != nil {
		return WorkbenchCustomerView{}, err
	}
	appendOperationLog(&data, "保存客户", customer.Name, "我的", "成功")
	return customer, saveWorkbenchData(data)
}

func (a *App) DeleteCustomer(id string) error {
	data, err := loadWorkbenchData()
	if err != nil {
		return err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("customer id is required")
	}
	next := data.Customers[:0]
	deleted := ""
	for _, customer := range data.Customers {
		if customer.ID == id {
			deleted = customer.Name
			continue
		}
		next = append(next, customer)
	}
	data.Customers = next
	if deleted == "" {
		return fmt.Errorf("customer %q not found", id)
	}
	appendOperationLog(&data, "删除客户", deleted, "我的", "成功")
	return saveWorkbenchData(data)
}

func (a *App) ListCalendarEvents() ([]WorkbenchCalendarEventView, error) {
	data, err := loadWorkbenchData()
	return data.CalendarEvents, err
}

func (a *App) SaveCalendarEvent(input WorkbenchCalendarEventInput) (WorkbenchCalendarEventView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return WorkbenchCalendarEventView{}, err
	}
	event, err := saveCalendarEventInto(&data, input)
	if err != nil {
		return WorkbenchCalendarEventView{}, err
	}
	appendOperationLog(&data, "保存日程", event.Title, "我的", "成功")
	return event, saveWorkbenchData(data)
}

func (a *App) DeleteCalendarEvent(id string) error {
	data, err := loadWorkbenchData()
	if err != nil {
		return err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("calendar event id is required")
	}
	deleted := ""
	next := make([]WorkbenchCalendarEventView, 0, len(data.CalendarEvents))
	for _, event := range data.CalendarEvents {
		if event.ID == id {
			deleted = event.Title
			continue
		}
		next = append(next, event)
	}
	if deleted == "" {
		return fmt.Errorf("calendar event %q not found", id)
	}
	data.CalendarEvents = next
	appendOperationLog(&data, "删除日程", deleted, "我的", "成功")
	return saveWorkbenchData(data)
}

func (a *App) ListWorkbenchReports() ([]WorkbenchReportView, error) {
	data, err := loadWorkbenchData()
	return data.Reports, err
}

func (a *App) SaveWorkbenchReport(input WorkbenchReportInput) (WorkbenchReportView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return WorkbenchReportView{}, err
	}
	report, err := saveReportInto(&data, input)
	if err != nil {
		return WorkbenchReportView{}, err
	}
	appendOperationLog(&data, "保存报告", report.Title, "我的", "成功")
	return report, saveWorkbenchData(data)
}

func (a *App) DeleteWorkbenchReport(id string) error {
	data, err := loadWorkbenchData()
	if err != nil {
		return err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("report id is required")
	}
	deleted := ""
	next := make([]WorkbenchReportView, 0, len(data.Reports))
	for _, report := range data.Reports {
		if report.ID == id {
			deleted = report.Title
			continue
		}
		next = append(next, report)
	}
	if deleted == "" {
		return fmt.Errorf("report %q not found", id)
	}
	data.Reports = next
	appendOperationLog(&data, "删除报告", deleted, "我的", "成功")
	return saveWorkbenchData(data)
}

func (a *App) SaveKnowledgeDocument(input WorkbenchKnowledgeDocumentInput) (WorkbenchKnowledgeDocumentView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return WorkbenchKnowledgeDocumentView{}, err
	}
	doc, err := saveKnowledgeDocumentInto(&data, input)
	if err != nil {
		return WorkbenchKnowledgeDocumentView{}, err
	}
	indexedDoc, indexErr := importKnowledgeDocument(KnowledgeDocumentImportInput{
		ID:          doc.ID,
		Title:       doc.Title,
		Type:        doc.Type,
		Source:      defaultString(doc.Source, "workbench"),
		Tags:        doc.Tags,
		Description: doc.Description,
		Content:     strings.Join([]string{doc.Title, doc.Description, doc.Tags, doc.Content}, "\n"),
	})
	if indexErr != nil {
		doc.Error = indexErr.Error()
	} else {
		mergeKnowledgeIndexMetadata(&doc, workbenchKnowledgeDocumentFromStore(indexedDoc))
	}
	replaceOrPrependKnowledgeDocument(&data, doc)
	appendOperationLog(&data, "保存知识模板", doc.Title, "我的", "成功")
	return doc, saveWorkbenchData(data)
}

func (a *App) ListRegulations() ([]WorkbenchRegulationView, error) {
	data, err := loadWorkbenchData()
	return data.Regulations, err
}

func (a *App) SaveRegulation(input WorkbenchRegulationView) (WorkbenchRegulationView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return WorkbenchRegulationView{}, err
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return WorkbenchRegulationView{}, errors.New("regulation title is required")
	}
	now := time.Now().Format(time.RFC3339)
	input.ID = defaultString(strings.TrimSpace(input.ID), uniqueWorkbenchDataID(slugifyAgentID(title), regulationIDs(data.Regulations)))
	input.Title = title
	input.Category = defaultString(strings.TrimSpace(input.Category), "规则")
	input.Status = defaultString(strings.TrimSpace(input.Status), "草稿")
	input.Tags = strings.TrimSpace(input.Tags)
	input.Content = strings.TrimSpace(input.Content)
	input.CreatedAt = defaultString(input.CreatedAt, now)
	input.UpdatedAt = now
	found := false
	for i, item := range data.Regulations {
		if item.ID == input.ID {
			input.CreatedAt = defaultString(item.CreatedAt, input.CreatedAt)
			data.Regulations[i] = input
			found = true
			break
		}
	}
	if !found {
		data.Regulations = append([]WorkbenchRegulationView{input}, data.Regulations...)
	}
	appendOperationLog(&data, "保存规范", input.Title, "我的", "成功")
	return input, saveWorkbenchData(data)
}

func (a *App) RenderRegulation(id string, variables map[string]string) (string, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return "", err
	}
	id = strings.TrimSpace(id)
	for _, item := range data.Regulations {
		if item.ID == id {
			return renderWorkbenchTemplate(item.Content, variables), nil
		}
	}
	return "", fmt.Errorf("regulation %q not found", id)
}

func (a *App) DeleteRegulation(id string) error {
	data, err := loadWorkbenchData()
	if err != nil {
		return err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("regulation id is required")
	}
	deleted := ""
	next := make([]WorkbenchRegulationView, 0, len(data.Regulations))
	for _, item := range data.Regulations {
		if item.ID == id {
			deleted = item.Title
			continue
		}
		next = append(next, item)
	}
	if deleted == "" {
		return fmt.Errorf("regulation %q not found", id)
	}
	data.Regulations = next
	appendOperationLog(&data, "删除规范", deleted, "我的", "成功")
	return saveWorkbenchData(data)
}

func (a *App) RenderKnowledgeDocument(id string, variables map[string]string) (string, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return "", err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return "", errors.New("knowledge document id is required")
	}
	for _, doc := range data.KnowledgeDocuments {
		if doc.ID != id {
			continue
		}
		content := defaultString(strings.TrimSpace(doc.Content), strings.TrimSpace(doc.Description))
		return renderWorkbenchTemplate(content, variables), nil
	}
	return "", fmt.Errorf("knowledge document %q not found", id)
}

func renderWorkbenchTemplate(content string, variables map[string]string) string {
	for key, value := range variables {
		content = strings.ReplaceAll(content, "{{"+strings.TrimSpace(key)+"}}", value)
	}
	return content
}

func (a *App) RunWorkbenchSync(scope string) ([]WorkbenchSyncJobView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return nil, err
	}
	title := strings.TrimSpace(scope)
	if title == "" {
		return nil, errors.New("sync scope is required")
	}
	now := time.Now().Format(time.RFC3339)
	if err := runWorkbenchSyncScope(a, title); err != nil {
		job := WorkbenchSyncJobView{ID: uniqueWorkbenchDataID(slugifyAgentID(title), syncJobIDs(data.SyncJobs)), Title: title, Status: "失败", Progress: "0%", Time: err.Error(), UpdatedAt: now}
		data.SyncJobs = append([]WorkbenchSyncJobView{job}, data.SyncJobs...)
		appendOperationLog(&data, "同步", title, "我的", "失败")
		_ = saveWorkbenchData(data)
		return data.SyncJobs, err
	}
	job := WorkbenchSyncJobView{ID: uniqueWorkbenchDataID(slugifyAgentID(title), syncJobIDs(data.SyncJobs)), Title: title, Status: "已完成", Progress: "100%", Time: "执行成功", UpdatedAt: now}
	data.SyncJobs = append([]WorkbenchSyncJobView{job}, data.SyncJobs...)
	if len(data.SyncJobs) > 20 {
		data.SyncJobs = data.SyncJobs[:20]
	}
	appendOperationLog(&data, "同步", title, "我的", "成功")
	if err := saveWorkbenchData(data); err != nil {
		return nil, err
	}
	return data.SyncJobs, nil
}

var runWorkbenchSyncScope = defaultRunWorkbenchSyncScope

func defaultRunWorkbenchSyncScope(a *App, scope string) error {
	switch strings.ToLower(strings.TrimSpace(scope)) {
	case "工作台数据", "workbench", "workspace":
		if _, err := loadWorkbenchProjects(); err != nil {
			return err
		}
		if _, err := loadTodos(); err != nil {
			return err
		}
		_, err := loadProjectMaterials()
		return err
	case "知识索引校验", "knowledge", "knowledge-index":
		_, err := a.KnowledgeStatus()
		return err
	case "技能配置刷新", "skills", "skill-refresh":
		return a.RefreshSkills()
	case "模型配置刷新", "models", "model-refresh":
		return a.ReloadSettings()
	default:
		return fmt.Errorf("unsupported sync scope %q", scope)
	}
}

func (a *App) SearchWorkbench(query string) ([]WorkbenchSearchResultView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return nil, err
	}
	keyword := strings.ToLower(strings.TrimSpace(query))
	results := searchWorkbenchData(data, query)
	projects, err := loadWorkbenchProjects()
	if err != nil {
		return nil, err
	}
	for _, project := range projects {
		appendWorkbenchSearchResult(&results, keyword, project.Name, "项目管理", project.Client+" / "+project.Stage+" / "+project.Desc)
	}
	todos, err := loadTodos()
	if err != nil {
		return nil, err
	}
	for _, todo := range todos {
		appendWorkbenchSearchResult(&results, keyword, todo.Title, "待办事项", todo.Description+" / "+todo.ProjectName+" / "+todo.CustomerName)
	}
	materials, err := loadProjectMaterials()
	if err != nil {
		return nil, err
	}
	for _, material := range materials {
		appendWorkbenchSearchResult(&results, keyword, material.Title, "资料库", material.Category+" / "+material.Source+" / "+material.Desc)
	}
	if keyword != "" {
		knowledgeResults, err := a.SearchKnowledge(query, 10)
		if err == nil {
			for _, result := range knowledgeResults {
				results = append(results, WorkbenchSearchResultView{
					Title:   result.Title,
					Scope:   "知识库 / " + result.Match,
					Snippet: result.Snippet,
				})
			}
		}
	}
	return limitWorkbenchSearchResults(results), nil
}

func (a *App) ExportOperationLogs() (string, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return "", err
	}
	return writeWorkbenchExport("operation-logs", data.OperationLogs)
}

func (a *App) ExportWorkbenchReports() (string, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return "", err
	}
	path, err := writeWorkbenchExport("reports-manifest", data.Reports)
	if err != nil {
		return "", err
	}
	appendOperationLog(&data, "导出报告", "分析报告", "我的", "成功")
	if err := saveWorkbenchData(data); err != nil {
		return "", err
	}
	return path, nil
}

func (a *App) ExportWorkbenchReport(id string) (string, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return "", err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return "", errors.New("report id is required")
	}
	for _, report := range data.Reports {
		if report.ID == id {
			path, err := writeWorkbenchReportExport(report)
			if err != nil {
				return "", err
			}
			appendOperationLog(&data, "导出报告", report.Title, "我的", "成功")
			if err := saveWorkbenchData(data); err != nil {
				return "", err
			}
			return path, nil
		}
	}
	return "", fmt.Errorf("report %q not found", id)
}

func (a *App) SaveTeamRoom(input WorkbenchTeamRoomView) (WorkbenchTeamRoomView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return WorkbenchTeamRoomView{}, err
	}
	room, err := saveTeamRoomInto(&data, input)
	if err != nil {
		return WorkbenchTeamRoomView{}, err
	}
	appendOperationLog(&data, "保存协作组", room.Title, "我的", "成功")
	return room, saveWorkbenchData(data)
}

func (a *App) ListTeamRooms() ([]WorkbenchTeamRoomView, error) {
	data, err := loadWorkbenchData()
	return data.TeamRooms, err
}

func (a *App) DeleteTeamRoom(id string) error {
	data, err := loadWorkbenchData()
	if err != nil {
		return err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("team room id is required")
	}
	found := false
	rooms := make([]WorkbenchTeamRoomView, 0, len(data.TeamRooms))
	for _, room := range data.TeamRooms {
		if room.ID == id {
			found = true
			continue
		}
		rooms = append(rooms, room)
	}
	if !found {
		return fmt.Errorf("team room %q not found", id)
	}
	data.TeamRooms = rooms
	runs := data.TeamRuns[:0]
	for _, run := range data.TeamRuns {
		if run.TeamID != id {
			runs = append(runs, run)
		}
	}
	data.TeamRuns = runs
	messages := data.TeamChatMessages[:0]
	for _, message := range data.TeamChatMessages {
		if message.TeamID != id {
			messages = append(messages, message)
		}
	}
	data.TeamChatMessages = messages
	appendOperationLog(&data, "删除协作组", id, "我的", "成功")
	return saveWorkbenchData(data)
}

func (a *App) SaveTeamRun(input WorkbenchTeamRunView) (WorkbenchTeamRunView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return WorkbenchTeamRunView{}, err
	}
	run, err := saveTeamRunInto(&data, input)
	if err != nil {
		return WorkbenchTeamRunView{}, err
	}
	appendOperationLog(&data, "保存团队运行", run.Title, "我的", "成功")
	return run, saveWorkbenchData(data)
}

func (a *App) ListTeamRuns(teamID string) ([]WorkbenchTeamRunView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return nil, err
	}
	teamID = strings.TrimSpace(teamID)
	if teamID == "" {
		return data.TeamRuns, nil
	}
	out := make([]WorkbenchTeamRunView, 0)
	for _, run := range data.TeamRuns {
		if run.TeamID == teamID {
			out = append(out, run)
		}
	}
	return out, nil
}

func (a *App) DeleteTeamRun(id string) error {
	data, err := loadWorkbenchData()
	if err != nil {
		return err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("team run id is required")
	}
	found := false
	next := make([]WorkbenchTeamRunView, 0, len(data.TeamRuns))
	for _, run := range data.TeamRuns {
		if run.ID == id {
			found = true
			continue
		}
		next = append(next, run)
	}
	if !found {
		return fmt.Errorf("team run %q not found", id)
	}
	data.TeamRuns = next
	return saveWorkbenchData(data)
}

func (a *App) ControlTeamRun(runID string, action string) (WorkbenchTeamRuntimeResult, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return WorkbenchTeamRuntimeResult{}, err
	}
	runID = strings.TrimSpace(runID)
	action = strings.ToLower(strings.TrimSpace(action))
	if runID == "" {
		return WorkbenchTeamRuntimeResult{}, errors.New("team run id is required")
	}
	index := -1
	for i := range data.TeamRuns {
		if data.TeamRuns[i].ID == runID {
			index = i
			break
		}
	}
	if index < 0 {
		return WorkbenchTeamRuntimeResult{}, fmt.Errorf("team run %q not found", runID)
	}
	run := data.TeamRuns[index]
	from := strings.ToLower(strings.TrimSpace(run.Status))
	to, label, err := teamRunTransition(from, action)
	if err != nil {
		return WorkbenchTeamRuntimeResult{}, err
	}
	now := time.Now().Format(time.RFC3339)
	run.Status = to
	run.UpdatedAt = now
	if action == "reassign" || action == "重新分配" {
		run.CurrentStepID = nextTeamRunStepID(run.CurrentStepID, data.TeamRooms, run.TeamID)
	}
	run.Events = append(run.Events, WorkbenchTeamRunEventView{
		ID:     uniqueWorkbenchDataID(run.ID+"-control", teamRunEventIDs(run.Events)),
		Time:   now,
		Actor:  "用户",
		Type:   label,
		Detail: fmt.Sprintf("运行状态由 %s 变更为 %s。", from, to),
	})
	data.TeamRuns[index] = run
	room := WorkbenchTeamRoomView{}
	for i := range data.TeamRooms {
		if data.TeamRooms[i].ID != run.TeamID {
			continue
		}
		data.TeamRooms[i].RunState = teamRuntimeRunState(to)
		data.TeamRooms[i].UpdatedAt = now
		if to == "stopped" {
			data.TeamRooms[i].Status = "已停止"
		} else if to == "paused" {
			data.TeamRooms[i].Status = "已暂停"
		} else if to == "running" {
			data.TeamRooms[i].Status = "运行中"
		}
		room = data.TeamRooms[i]
	}
	if room.ID == "" {
		return WorkbenchTeamRuntimeResult{}, fmt.Errorf("team room %q not found", run.TeamID)
	}
	appendOperationLog(&data, label, run.Title, "我的", "成功")
	if err := saveWorkbenchData(data); err != nil {
		return WorkbenchTeamRuntimeResult{}, err
	}
	return WorkbenchTeamRuntimeResult{Room: room, Run: run, Messages: teamMessagesForRoom(data.TeamChatMessages, run.TeamID)}, nil
}

func teamRunTransition(from, action string) (string, string, error) {
	switch action {
	case "start", "启动":
		if from != "draft" {
			return "", "", fmt.Errorf("cannot start team run in %s state", from)
		}
		return "running", "启动团队运行", nil
	case "pause", "暂停":
		if from != "running" {
			return "", "", fmt.Errorf("cannot pause team run in %s state", from)
		}
		return "paused", "暂停团队运行", nil
	case "resume", "continue", "继续":
		if from != "paused" {
			return "", "", fmt.Errorf("cannot resume team run in %s state", from)
		}
		return "running", "继续团队运行", nil
	case "stop", "terminate", "终止":
		if from != "draft" && from != "running" && from != "paused" {
			return "", "", fmt.Errorf("cannot stop team run in %s state", from)
		}
		return "stopped", "终止团队运行", nil
	case "complete", "完成":
		if from != "running" && from != "paused" {
			return "", "", fmt.Errorf("cannot complete team run in %s state", from)
		}
		return "completed", "完成团队运行", nil
	case "reassign", "重新分配":
		if from != "running" && from != "paused" {
			return "", "", fmt.Errorf("cannot reassign team run in %s state", from)
		}
		return from, "重新分配团队运行", nil
	default:
		return "", "", fmt.Errorf("unsupported team run action %q", action)
	}
}

func nextTeamRunStepID(current string, rooms []WorkbenchTeamRoomView, teamID string) string {
	for _, room := range rooms {
		if room.ID != teamID || len(room.Steps) == 0 {
			continue
		}
		for i, step := range room.Steps {
			if step.ID == current {
				return room.Steps[(i+1)%len(room.Steps)].ID
			}
		}
		return room.Steps[0].ID
	}
	return current
}

func teamRunEventIDs(items []WorkbenchTeamRunEventView) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.ID)
	}
	return out
}

func (a *App) SaveTeamChatMessage(input WorkbenchTeamChatMessageView) (WorkbenchTeamChatMessageView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return WorkbenchTeamChatMessageView{}, err
	}
	message, err := saveTeamChatMessageInto(&data, input)
	if err != nil {
		return WorkbenchTeamChatMessageView{}, err
	}
	return message, saveWorkbenchData(data)
}

func (a *App) ListTeamChatMessages(teamID string) ([]WorkbenchTeamChatMessageView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return nil, err
	}
	teamID = strings.TrimSpace(teamID)
	if teamID == "" {
		return data.TeamChatMessages, nil
	}
	return teamMessagesForRoom(data.TeamChatMessages, teamID), nil
}

func (a *App) DeleteTeamChatMessage(id string) error {
	data, err := loadWorkbenchData()
	if err != nil {
		return err
	}
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("team chat message id is required")
	}
	found := false
	next := make([]WorkbenchTeamChatMessageView, 0, len(data.TeamChatMessages))
	for _, message := range data.TeamChatMessages {
		if message.ID == id {
			found = true
			continue
		}
		next = append(next, message)
	}
	if !found {
		return fmt.Errorf("team chat message %q not found", id)
	}
	data.TeamChatMessages = next
	return saveWorkbenchData(data)
}

func (a *App) DistillAgentFromTodo(input WorkbenchTodoInput, skillNames []string) (PersistentAgentView, error) {
	title := defaultString(strings.TrimSpace(input.Title), "蒸馏任务 Agent")
	desc := defaultString(strings.TrimSpace(input.Description), "从工作台任务中提炼出的可复用 Agent。")
	agentInput := PersistentAgentInput{
		Name:      title + " Agent",
		Role:      "已蒸馏",
		Status:    "已启用",
		Desc:      desc,
		Avatar:    "D",
		Tools:     []string{"本地文件与资料", "终端执行"},
		Skills:    cleanAutomationLines(skillNames),
		CoreFiles: []string{"AGENTS.md"},
	}
	return a.SaveAgent(agentInput)
}

func workbenchDataPath() (string, error) {
	userConfig := config.UserConfigPath()
	if strings.TrimSpace(userConfig) == "" {
		return "", errors.New("user config dir is unavailable")
	}
	return filepath.Join(filepath.Dir(userConfig), workbenchDataFile), nil
}

func loadWorkbenchData() (WorkbenchDataView, error) {
	path, err := workbenchDataPath()
	if err != nil {
		return emptyWorkbenchData(), nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return emptyWorkbenchData(), nil
		}
		return WorkbenchDataView{}, err
	}
	var data WorkbenchDataView
	if err := json.Unmarshal(b, &data); err != nil {
		return WorkbenchDataView{}, err
	}
	data, migrated := migrateLegacyWorkbenchSeeds(data)
	data = normalizeWorkbenchData(data)
	if migrated {
		if err := saveWorkbenchData(data); err != nil {
			return WorkbenchDataView{}, err
		}
	}
	return data, nil
}

func saveWorkbenchData(data WorkbenchDataView) error {
	path, err := workbenchDataPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(normalizeWorkbenchData(data), "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".workbench-data.*.tmp")
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

func writeWorkbenchExport(name string, payload any) (string, error) {
	path, err := workbenchDataPath()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(filepath.Dir(path), "exports")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	file := filepath.Join(dir, name+"-"+time.Now().Format("20060102-150405")+".json")
	b, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		return "", err
	}
	return file, os.WriteFile(file, b, 0o644)
}

func writeWorkbenchReportExport(report WorkbenchReportView) (string, error) {
	format := strings.ToLower(strings.TrimSpace(report.Format))
	switch format {
	case "", "json":
		return writeWorkbenchExport("report-"+slugifyAgentID(report.Title), report)
	case "markdown", "md":
		return writeWorkbenchTextExport("report-"+slugifyAgentID(report.Title), ".md", "# "+report.Title+"\n\n"+defaultString(report.Body, report.Desc)+"\n")
	case "html":
		body := "<!doctype html><html lang=\"zh-CN\"><meta charset=\"utf-8\"><title>" + html.EscapeString(report.Title) + "</title><body><h1>" + html.EscapeString(report.Title) + "</h1><pre>" + html.EscapeString(defaultString(report.Body, report.Desc)) + "</pre></body></html>"
		return writeWorkbenchTextExport("report-"+slugifyAgentID(report.Title), ".html", body)
	case "pdf":
		return writeWorkbenchPDF("report-"+slugifyAgentID(report.Title), report.Title+"\n\n"+defaultString(report.Body, report.Desc))
	case "docx", "word":
		return writeWorkbenchDOCX("report-"+slugifyAgentID(report.Title), report.Title, defaultString(report.Body, report.Desc))
	default:
		return "", fmt.Errorf("unsupported report format %q", report.Format)
	}
}

func workbenchExportsDir() (string, error) {
	path, err := workbenchDataPath()
	if err != nil {
		return "", err
	}
	dir := filepath.Join(filepath.Dir(path), "exports")
	return dir, os.MkdirAll(dir, 0o755)
}

func writeWorkbenchTextExport(name, ext, content string) (string, error) {
	dir, err := workbenchExportsDir()
	if err != nil {
		return "", err
	}
	file := filepath.Join(dir, name+"-"+time.Now().Format("20060102-150405")+ext)
	return file, os.WriteFile(file, []byte(content), 0o644)
}

func writeWorkbenchPDF(name, content string) (string, error) {
	stream := "BT /F1 11 Tf 50 780 Td <" + encodePDFUTF16Hex(content) + "> Tj ET"
	var b bytes.Buffer
	b.WriteString("%PDF-1.4\n")
	offsets := []int{0}
	objects := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%s\nendstream", len(stream), stream),
		"<< /Type /Font /Subtype /Type0 /BaseFont /STSong-Light /Encoding /UniGB-UCS2-H /DescendantFonts [6 0 R] >>",
		"<< /Type /Font /Subtype /CIDFontType0 /BaseFont /STSong-Light /CIDSystemInfo << /Registry (Adobe) /Ordering (GB1) /Supplement 2 >> >>",
	}
	for i, object := range objects {
		offsets = append(offsets, b.Len())
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, object)
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(objects)+1)
	for _, offset := range offsets[1:] {
		fmt.Fprintf(&b, "%010d 00000 n \n", offset)
	}
	fmt.Fprintf(&b, "trailer << /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objects)+1, xref)
	dir, err := workbenchExportsDir()
	if err != nil {
		return "", err
	}
	file := filepath.Join(dir, name+"-"+time.Now().Format("20060102-150405")+".pdf")
	return file, os.WriteFile(file, b.Bytes(), 0o644)
}

func encodePDFUTF16Hex(content string) string {
	units := append([]uint16{0xFEFF}, utf16.Encode([]rune(content))...)
	raw := make([]byte, 0, len(units)*2)
	for _, unit := range units {
		raw = append(raw, byte(unit>>8), byte(unit))
	}
	return strings.ToUpper(hex.EncodeToString(raw))
}

func writeWorkbenchDOCX(name, title, body string) (string, error) {
	dir, err := workbenchExportsDir()
	if err != nil {
		return "", err
	}
	file := filepath.Join(dir, name+"-"+time.Now().Format("20060102-150405")+".docx")
	f, err := os.Create(file)
	if err != nil {
		return "", err
	}
	zw := zip.NewWriter(f)
	files := map[string]string{
		"[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
		"_rels/.rels":         `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
		"word/document.xml":   `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` + docxParagraph(title) + docxParagraphs(body) + `<w:sectPr/></w:body></w:document>`,
	}
	for path, content := range files {
		w, createErr := zw.Create(path)
		if createErr != nil {
			_ = zw.Close()
			_ = f.Close()
			return "", createErr
		}
		if _, writeErr := w.Write([]byte(content)); writeErr != nil {
			_ = zw.Close()
			_ = f.Close()
			return "", writeErr
		}
	}
	if err := zw.Close(); err != nil {
		_ = f.Close()
		return "", err
	}
	return file, f.Close()
}

func docxParagraphs(content string) string {
	var out strings.Builder
	for _, line := range strings.Split(strings.ReplaceAll(content, "\r\n", "\n"), "\n") {
		out.WriteString(docxParagraph(line))
	}
	return out.String()
}

func docxParagraph(content string) string {
	return `<w:p><w:r><w:t xml:space="preserve">` + html.EscapeString(content) + `</w:t></w:r></w:p>`
}

func emptyWorkbenchData() WorkbenchDataView {
	return WorkbenchDataView{Initialized: true}
}

func migrateLegacyWorkbenchSeeds(data WorkbenchDataView) (WorkbenchDataView, bool) {
	migrated := false
	customers := data.Customers[:0]
	for _, item := range data.Customers {
		legacy := false
		switch strings.TrimSpace(item.ID) {
		// runtime-mock-guard: allow-legacy-cleanup
		case "internal":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Name == "内部研发团队" && item.Email == "dev@example.com" && item.Desc == "Volt GUI 研发与验证主体。"
		// runtime-mock-guard: allow-legacy-cleanup
		case "ops":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Name == "运营增长团队" && item.Email == "ops@example.com" && item.Desc == "负责发布材料、增长活动和客户触达。"
		}
		if legacy {
			migrated = true
			continue
		}
		customers = append(customers, item)
	}
	data.Customers = customers
	data.CalendarEvents, migrated = filterLegacyCalendarEvents(data.CalendarEvents, migrated)
	data.Reports, migrated = filterLegacyReports(data.Reports, migrated)
	data.KnowledgeDocuments, migrated = filterLegacyKnowledgeDocuments(data.KnowledgeDocuments, migrated)
	data.Regulations, migrated = filterLegacyRegulations(data.Regulations, migrated)
	data.SyncJobs, migrated = filterLegacySyncJobs(data.SyncJobs, migrated)
	data.OperationLogs, migrated = filterLegacyOperationLogs(data.OperationLogs, migrated)
	data.TeamRooms, migrated = filterLegacyTeamRooms(data.TeamRooms, migrated)
	data.TeamChatMessages, migrated = filterLegacyTeamMessages(data.TeamChatMessages, migrated)
	return data, migrated
}

func filterLegacyCalendarEvents(items []WorkbenchCalendarEventView, migrated bool) ([]WorkbenchCalendarEventView, bool) {
	out := items[:0]
	for _, item := range items {
		legacy := false
		switch strings.TrimSpace(item.ID) {
		// runtime-mock-guard: allow-legacy-cleanup
		case "version-review":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "版本评审会议" && item.Time == "09:30" && item.Place == "线上会议室"
		// runtime-mock-guard: allow-legacy-cleanup
		case "customer-workflow":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "客户工作流复盘" && item.Time == "14:00" && item.Place == "项目群"
		// runtime-mock-guard: allow-legacy-cleanup
		case "automation-review":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "自动化验收" && item.Time == "16:30" && item.Place == "研发工作台"
		}
		if legacy {
			migrated = true
		} else {
			out = append(out, item)
		}
	}
	return out, migrated
}

func filterLegacyReports(items []WorkbenchReportView, migrated bool) ([]WorkbenchReportView, bool) {
	out := items[:0]
	for _, item := range items {
		legacy := false
		switch strings.TrimSpace(item.ID) {
		// runtime-mock-guard: allow-legacy-cleanup
		case "project-risk":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "项目风险分析报告" && item.Desc == "覆盖变更风险、测试缺口、回滚建议。"
		// runtime-mock-guard: allow-legacy-cleanup
		case "customer-weekly":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "客户运营周报" && item.Desc == "整理客户触达、项目状态与内容草案。"
		// runtime-mock-guard: allow-legacy-cleanup
		case "automation-run":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "项目自动化运行报告" && item.Desc == "汇总前端门禁、Go/Wails 门禁和本地预览回归的执行证据。"
		}
		if legacy {
			migrated = true
		} else {
			out = append(out, item)
		}
	}
	return out, migrated
}

func filterLegacyKnowledgeDocuments(items []WorkbenchKnowledgeDocumentView, migrated bool) ([]WorkbenchKnowledgeDocumentView, bool) {
	out := items[:0]
	for _, item := range items {
		legacy := false
		switch strings.TrimSpace(item.ID) {
		// runtime-mock-guard: allow-legacy-cleanup
		case "requirement-template":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "需求澄清记录模板" && item.Description == "用于记录目标、非目标、验收标准和执行边界。"
		// runtime-mock-guard: allow-legacy-cleanup
		case "project-retro":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "项目复盘记录" && item.Description == "历史项目复盘与交付证据。"
		// runtime-mock-guard: allow-legacy-cleanup
		case "automation-config":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "项目自动化配置说明" && item.Description == "工作台自动化任务、运行记录和失败处理。"
		}
		if legacy {
			migrated = true
		} else {
			out = append(out, item)
		}
	}
	return out, migrated
}

func filterLegacyRegulations(items []WorkbenchRegulationView, migrated bool) ([]WorkbenchRegulationView, bool) {
	out := items[:0]
	for _, item := range items {
		legacy := false
		switch strings.TrimSpace(item.ID) {
		// runtime-mock-guard: allow-legacy-cleanup
		case "desktop-security":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "桌面端安全执行规范" && item.Tags == "权限 / 沙箱 / 审计"
		// runtime-mock-guard: allow-legacy-cleanup
		case "agent-acceptance":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "Agent 协作验收标准" && item.Tags == "任务 / 验证 / 交付"
		// runtime-mock-guard: allow-legacy-cleanup
		case "customer-boundary":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "客户数据使用边界" && item.Tags == "客户 / 数据 / 留痕"
		}
		if legacy {
			migrated = true
		} else {
			out = append(out, item)
		}
	}
	return out, migrated
}

func filterLegacySyncJobs(items []WorkbenchSyncJobView, migrated bool) ([]WorkbenchSyncJobView, bool) {
	out := items[:0]
	for _, item := range items {
		legacy := false
		switch strings.TrimSpace(item.ID) {
		// runtime-mock-guard: allow-legacy-cleanup
		case "memory-sync":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "记忆与核心文件同步" && item.Progress == "100%"
		// runtime-mock-guard: allow-legacy-cleanup
		case "material-index":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "资料库索引" && item.Progress == "64%"
		// runtime-mock-guard: allow-legacy-cleanup
		case "model-refresh":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "模型配置刷新" && item.Progress == "0%"
		}
		if legacy {
			migrated = true
		} else {
			out = append(out, item)
		}
	}
	return out, migrated
}

func filterLegacyOperationLogs(items []WorkbenchOperationLogView, migrated bool) ([]WorkbenchOperationLogView, bool) {
	out := items[:0]
	for _, item := range items {
		legacy := false
		switch strings.TrimSpace(item.ID) {
		// runtime-mock-guard: allow-legacy-cleanup
		case "create-agent":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Action == "创建 Agent" && item.Target == "代码审查 Agent" && item.Time == "刚刚"
		// runtime-mock-guard: allow-legacy-cleanup
		case "update-automation":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Action == "更新自动化" && item.Target == "桌面前端质量门禁" && item.Time == "12 分钟前"
		// runtime-mock-guard: allow-legacy-cleanup
		case "link-project":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Action == "关联项目" && item.Target == "Volt GUI 桌面端重构" && item.Time == "28 分钟前"
		}
		if legacy {
			migrated = true
		} else {
			out = append(out, item)
		}
	}
	return out, migrated
}

func filterLegacyTeamRooms(items []WorkbenchTeamRoomView, migrated bool) ([]WorkbenchTeamRoomView, bool) {
	out := items[:0]
	for _, item := range items {
		legacy := false
		switch strings.TrimSpace(item.ID) {
		// runtime-mock-guard: allow-legacy-cleanup
		case "product-lab":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "产品研发组" && item.Desc == "围绕桌面端体验、代码质量和发布节奏组织多 Agent 协作。" && item.LeaderID == "code-review"
		// runtime-mock-guard: allow-legacy-cleanup
		case "ops-growth":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.Title == "运营增长组" && item.Desc == "处理客户触达、内容草案和项目跟进。" && item.LeaderID == "research"
		}
		if legacy {
			migrated = true
		} else {
			out = append(out, item)
		}
	}
	return out, migrated
}

func filterLegacyTeamMessages(items []WorkbenchTeamChatMessageView, migrated bool) ([]WorkbenchTeamChatMessageView, bool) {
	out := items[:0]
	for _, item := range items {
		legacy := false
		switch strings.TrimSpace(item.ID) {
		// runtime-mock-guard: allow-legacy-cleanup
		case "product-lab-system-1":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.TeamID == "product-lab" && item.Content == "当前是协作组模板预览。发送任务后会生成运行草稿。"
		// runtime-mock-guard: allow-legacy-cleanup
		case "ops-growth-system-1":
			// runtime-mock-guard: allow-legacy-cleanup
			legacy = item.TeamID == "ops-growth" && item.Content == "请先绑定客户或项目资料，协作运行会基于真实上下文生成跟进建议。"
		}
		if legacy {
			migrated = true
		} else {
			out = append(out, item)
		}
	}
	return out, migrated
}

func normalizeWorkbenchData(data WorkbenchDataView) WorkbenchDataView {
	data.Initialized = true
	data.Customers = normalizeCustomers(data.Customers)
	data.CalendarEvents = normalizeCalendarEvents(data.CalendarEvents)
	data.Reports = normalizeReports(data.Reports)
	data.KnowledgeDocuments = normalizeKnowledgeDocuments(data.KnowledgeDocuments)
	data.Regulations = normalizeRegulations(data.Regulations)
	data.SyncJobs = normalizeSyncJobs(data.SyncJobs)
	data.OperationLogs = normalizeOperationLogs(data.OperationLogs)
	data.TeamRooms = normalizeTeamRooms(data.TeamRooms)
	data.TeamRuns = normalizeTeamRuns(data.TeamRuns)
	data.TeamChatMessages = normalizeTeamChatMessages(data.TeamChatMessages)
	return data
}

func saveCustomerInto(data *WorkbenchDataView, input WorkbenchCustomerInput) (WorkbenchCustomerView, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" {
		return WorkbenchCustomerView{}, errors.New("customer name is required")
	}
	now := time.Now().Format(time.RFC3339)
	id := defaultString(strings.TrimSpace(input.ID), uniqueWorkbenchDataID(slugifyAgentID(name), customerIDs(data.Customers)))
	next := WorkbenchCustomerView{
		ID:          id,
		Name:        name,
		Type:        defaultString(strings.TrimSpace(input.Type), "企业"),
		Contact:     defaultString(strings.TrimSpace(input.Contact), "联系人"),
		Phone:       strings.TrimSpace(input.Phone),
		Email:       strings.TrimSpace(input.Email),
		Risk:        defaultString(strings.TrimSpace(input.Risk), "低风险"),
		RiskLevel:   defaultString(strings.TrimSpace(input.RiskLevel), "low"),
		Status:      defaultString(strings.TrimSpace(input.Status), "active"),
		Owner:       defaultString(strings.TrimSpace(input.Owner), "我的"),
		Stage:       defaultString(strings.TrimSpace(input.Stage), "跟进中"),
		Industry:    strings.TrimSpace(input.Industry),
		Region:      strings.TrimSpace(input.Region),
		Address:     strings.TrimSpace(input.Address),
		Note:        strings.TrimSpace(input.Note),
		Desc:        strings.TrimSpace(input.Desc),
		ProjectIDs:  cleanAutomationLines(input.ProjectIDs),
		Matters:     maxInt(input.Matters, 0),
		Materials:   maxInt(input.Materials, 0),
		Events:      maxInt(input.Events, 0),
		Todos:       maxInt(input.Todos, 0),
		Reports:     maxInt(input.Reports, 0),
		LastTouch:   defaultString(strings.TrimSpace(input.LastTouch), now),
		LastContact: defaultString(strings.TrimSpace(input.LastContact), now),
		NextAction:  strings.TrimSpace(input.NextAction),
		Tags:        cleanAutomationLines(input.Tags),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	replaceOrPrependCustomer(data, next)
	sortCustomers(data.Customers)
	return next, nil
}

func saveCalendarEventInto(data *WorkbenchDataView, input WorkbenchCalendarEventInput) (WorkbenchCalendarEventView, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return WorkbenchCalendarEventView{}, errors.New("calendar title is required")
	}
	now := time.Now().Format(time.RFC3339)
	id := defaultString(strings.TrimSpace(input.ID), uniqueWorkbenchDataID(slugifyAgentID(title), calendarIDs(data.CalendarEvents)))
	date := strings.TrimSpace(input.Date)
	if date == "" {
		date = time.Now().Format("2006-01-02")
	}
	day := defaultString(strings.TrimSpace(input.Day), "")
	if day == "" {
		if parsed, err := time.Parse("2006-01-02", date); err == nil {
			day = parsed.Format("02")
		} else {
			day = time.Now().Format("02")
		}
	}
	next := WorkbenchCalendarEventView{ID: id, Date: date, Day: day, Title: title, Time: defaultString(strings.TrimSpace(input.Time), "09:00"), Type: defaultString(strings.TrimSpace(input.Type), "meeting"), Place: defaultString(strings.TrimSpace(input.Place), "工作台"), ProjectID: strings.TrimSpace(input.ProjectID), CustomerID: strings.TrimSpace(input.CustomerID), Status: defaultString(strings.TrimSpace(input.Status), "待开始"), Desc: strings.TrimSpace(input.Desc), CreatedAt: now, UpdatedAt: now}
	replaceOrPrependCalendar(data, next)
	sortCalendarEvents(data.CalendarEvents)
	return next, nil
}

func saveReportInto(data *WorkbenchDataView, input WorkbenchReportInput) (WorkbenchReportView, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return WorkbenchReportView{}, errors.New("report title is required")
	}
	now := time.Now().Format(time.RFC3339)
	id := defaultString(strings.TrimSpace(input.ID), uniqueWorkbenchDataID(slugifyAgentID(title), reportIDs(data.Reports)))
	createdAt := now
	for _, report := range data.Reports {
		if report.ID == id {
			createdAt = defaultString(report.CreatedAt, now)
			break
		}
	}
	next := WorkbenchReportView{
		ID:         id,
		Title:      title,
		Status:     defaultString(strings.TrimSpace(input.Status), "草稿"),
		Owner:      strings.TrimSpace(input.Owner),
		Desc:       strings.TrimSpace(input.Desc),
		Body:       strings.TrimSpace(input.Body),
		Kind:       defaultString(strings.TrimSpace(input.Kind), "分析报告"),
		ProjectID:  strings.TrimSpace(input.ProjectID),
		CustomerID: strings.TrimSpace(input.CustomerID),
		Source:     defaultString(strings.TrimSpace(input.Source), "工作台数据"),
		Format:     defaultString(strings.TrimSpace(input.Format), "Markdown"),
		Priority:   defaultString(strings.TrimSpace(input.Priority), "中"),
		DueAt:      strings.TrimSpace(input.DueAt),
		CreatedAt:  createdAt,
		UpdatedAt:  now,
	}
	replaceOrPrependReport(data, next)
	sortReports(data.Reports)
	return next, nil
}

func saveKnowledgeDocumentInto(data *WorkbenchDataView, input WorkbenchKnowledgeDocumentInput) (WorkbenchKnowledgeDocumentView, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return WorkbenchKnowledgeDocumentView{}, errors.New("knowledge document title is required")
	}
	now := time.Now().Format(time.RFC3339)
	id := defaultString(strings.TrimSpace(input.ID), uniqueWorkbenchDataID(slugifyAgentID(title), knowledgeDocumentIDs(data.KnowledgeDocuments)))
	next := WorkbenchKnowledgeDocumentView{
		ID:          id,
		Title:       title,
		Type:        defaultString(strings.TrimSpace(input.Type), "模板"),
		Status:      defaultString(strings.TrimSpace(input.Status), "草稿"),
		Description: strings.TrimSpace(input.Description),
		Content:     strings.TrimSpace(input.Content),
		Source:      strings.TrimSpace(input.Source),
		Tags:        strings.TrimSpace(input.Tags),
		MaterialIDs: normalizeKnowledgeMaterialIDs(input.MaterialIDs),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	next.Count = len(next.MaterialIDs)
	replaceOrPrependKnowledgeDocument(data, next)
	return next, nil
}

func mergeKnowledgeIndexMetadata(doc *WorkbenchKnowledgeDocumentView, indexed WorkbenchKnowledgeDocumentView) {
	if doc == nil || indexed.ID == "" {
		return
	}
	doc.Count = maxInt(indexed.Count, doc.Count)
	doc.ChunkCount = maxInt(indexed.ChunkCount, doc.ChunkCount)
	doc.IndexedAt = indexed.IndexedAt
	doc.Error = indexed.Error
	doc.FileName = defaultString(doc.FileName, indexed.FileName)
	doc.FilePath = defaultString(doc.FilePath, indexed.FilePath)
	doc.MimeType = defaultString(doc.MimeType, indexed.MimeType)
	doc.FileSize = maxInt64(doc.FileSize, indexed.FileSize)
	if strings.TrimSpace(doc.Source) == "" {
		doc.Source = indexed.Source
	}
}

func removeWorkbenchKnowledgeDocument(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("knowledge document id is required")
	}
	data, err := loadWorkbenchData()
	if err != nil {
		return err
	}
	next := data.KnowledgeDocuments[:0]
	deleted := ""
	for _, doc := range data.KnowledgeDocuments {
		if doc.ID == id {
			deleted = doc.Title
			continue
		}
		next = append(next, doc)
	}
	if deleted == "" {
		return nil
	}
	data.KnowledgeDocuments = next
	appendOperationLog(&data, "删除知识", defaultString(deleted, id), "我的", "成功")
	return saveWorkbenchData(data)
}

func saveTeamRoomInto(data *WorkbenchDataView, input WorkbenchTeamRoomView) (WorkbenchTeamRoomView, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return WorkbenchTeamRoomView{}, errors.New("team title is required")
	}
	now := time.Now().Format(time.RFC3339)
	input.ID = defaultString(strings.TrimSpace(input.ID), uniqueWorkbenchDataID(slugifyAgentID(title), teamRoomIDs(data.TeamRooms)))
	input.Title = title
	input.Members = maxInt(input.Members, len(input.MemberIDs))
	input.Active = defaultString(strings.TrimSpace(input.Active), "已配置")
	input.Status = defaultString(strings.TrimSpace(input.Status), "模板")
	input.CreatedAt = defaultString(input.CreatedAt, now)
	input.UpdatedAt = now
	replaceOrPrependTeamRoom(data, input)
	return input, nil
}

func saveTeamRunInto(data *WorkbenchDataView, input WorkbenchTeamRunView) (WorkbenchTeamRunView, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return WorkbenchTeamRunView{}, errors.New("team run title is required")
	}
	if strings.TrimSpace(input.TeamID) == "" {
		return WorkbenchTeamRunView{}, errors.New("team id is required")
	}
	input.ID = defaultString(strings.TrimSpace(input.ID), uniqueWorkbenchDataID(slugifyAgentID(title), teamRunIDs(data.TeamRuns)))
	input.Title = title
	input.Status = defaultString(strings.TrimSpace(input.Status), "draft")
	now := time.Now().Format(time.RFC3339)
	input.CreatedAt = defaultString(input.CreatedAt, now)
	input.UpdatedAt = now
	if len(input.Events) == 0 {
		input.Events = []WorkbenchTeamRunEventView{{ID: input.ID + "-created", Time: now, Actor: "用户", Type: "创建运行", Detail: defaultString(input.Task, title)}}
	}
	replaceOrPrependTeamRun(data, input)
	return input, nil
}

func saveTeamChatMessageInto(data *WorkbenchDataView, input WorkbenchTeamChatMessageView) (WorkbenchTeamChatMessageView, error) {
	if strings.TrimSpace(input.TeamID) == "" {
		return WorkbenchTeamChatMessageView{}, errors.New("team id is required")
	}
	if strings.TrimSpace(input.Content) == "" {
		return WorkbenchTeamChatMessageView{}, errors.New("message content is required")
	}
	now := time.Now().Format(time.RFC3339)
	input.ID = defaultString(strings.TrimSpace(input.ID), uniqueWorkbenchDataID("team-message", teamMessageIDs(data.TeamChatMessages)))
	input.Role = defaultString(strings.TrimSpace(input.Role), "user")
	input.CreatedAt = defaultString(input.CreatedAt, now)
	data.TeamChatMessages = append(data.TeamChatMessages, input)
	if len(data.TeamChatMessages) > 500 {
		data.TeamChatMessages = data.TeamChatMessages[len(data.TeamChatMessages)-500:]
	}
	return input, nil
}

func appendOperationLog(data *WorkbenchDataView, action, target, user, result string) {
	now := time.Now().Format(time.RFC3339)
	data.OperationLogs = append([]WorkbenchOperationLogView{{ID: uniqueWorkbenchDataID(slugifyAgentID(action+"-"+target), operationLogIDs(data.OperationLogs)), Action: action, Target: target, User: defaultString(user, "我的"), Result: defaultString(result, "成功"), CreatedAt: now}}, data.OperationLogs...)
	if len(data.OperationLogs) > 100 {
		data.OperationLogs = data.OperationLogs[:100]
	}
}

func searchWorkbenchData(data WorkbenchDataView, query string) []WorkbenchSearchResultView {
	keyword := strings.ToLower(strings.TrimSpace(query))
	var results []WorkbenchSearchResultView
	add := func(title, scope, snippet string) {
		appendWorkbenchSearchResult(&results, keyword, title, scope, snippet)
	}
	for _, customer := range data.Customers {
		add(customer.Name, "客户管理", customer.Desc)
	}
	for _, event := range data.CalendarEvents {
		add(event.Title, "日历日程", event.Place+" / "+event.Status)
	}
	for _, report := range data.Reports {
		add(report.Title, "报告中心", report.Desc)
	}
	for _, doc := range data.KnowledgeDocuments {
		add(doc.Title, "知识库", doc.Description)
	}
	for _, regulation := range data.Regulations {
		add(regulation.Title, "规范知识", regulation.Category+" / "+regulation.Tags)
	}
	return results
}

func appendWorkbenchSearchResult(results *[]WorkbenchSearchResultView, keyword, title, scope, snippet string) {
	haystack := strings.ToLower(title + " " + scope + " " + snippet)
	if keyword == "" || strings.Contains(haystack, keyword) {
		*results = append(*results, WorkbenchSearchResultView{Title: title, Scope: scope, Snippet: snippet})
	}
}

func limitWorkbenchSearchResults(results []WorkbenchSearchResultView) []WorkbenchSearchResultView {
	if len(results) > 30 {
		return results[:30]
	}
	return results
}

func normalizeCustomers(customers []WorkbenchCustomerView) []WorkbenchCustomerView {
	now := time.Now().Format(time.RFC3339)
	out := make([]WorkbenchCustomerView, 0, len(customers))
	for _, customer := range customers {
		customer.ID = strings.TrimSpace(customer.ID)
		customer.Name = strings.TrimSpace(customer.Name)
		if customer.Name == "" {
			continue
		}
		customer.ID = defaultString(customer.ID, slugifyAgentID(customer.Name))
		customer.Type = defaultString(strings.TrimSpace(customer.Type), "企业")
		customer.Contact = defaultString(strings.TrimSpace(customer.Contact), "联系人")
		customer.Risk = defaultString(strings.TrimSpace(customer.Risk), "低风险")
		customer.RiskLevel = defaultString(strings.TrimSpace(customer.RiskLevel), "low")
		customer.Status = defaultString(strings.TrimSpace(customer.Status), "active")
		customer.LastTouch = defaultString(strings.TrimSpace(customer.LastTouch), customer.UpdatedAt)
		customer.LastContact = defaultString(strings.TrimSpace(customer.LastContact), customer.LastTouch)
		customer.ProjectIDs = cleanAutomationLines(customer.ProjectIDs)
		customer.Tags = cleanAutomationLines(customer.Tags)
		customer.CreatedAt = defaultString(customer.CreatedAt, now)
		customer.UpdatedAt = defaultString(customer.UpdatedAt, customer.CreatedAt)
		out = append(out, customer)
	}
	sortCustomers(out)
	return out
}

func normalizeCalendarEvents(events []WorkbenchCalendarEventView) []WorkbenchCalendarEventView {
	now := time.Now().Format(time.RFC3339)
	out := make([]WorkbenchCalendarEventView, 0, len(events))
	for _, event := range events {
		event.ID = strings.TrimSpace(event.ID)
		event.Title = strings.TrimSpace(event.Title)
		if event.Title == "" {
			continue
		}
		event.ID = defaultString(event.ID, slugifyAgentID(event.Title))
		event.Day = defaultString(strings.TrimSpace(event.Day), time.Now().Format("02"))
		event.Time = defaultString(strings.TrimSpace(event.Time), "09:00")
		event.Type = defaultString(strings.TrimSpace(event.Type), "meeting")
		event.Place = defaultString(strings.TrimSpace(event.Place), "工作台")
		event.CreatedAt = defaultString(event.CreatedAt, now)
		event.UpdatedAt = defaultString(event.UpdatedAt, event.CreatedAt)
		out = append(out, event)
	}
	sortCalendarEvents(out)
	return out
}

func normalizeReports(reports []WorkbenchReportView) []WorkbenchReportView {
	now := time.Now().Format(time.RFC3339)
	out := make([]WorkbenchReportView, 0, len(reports))
	for _, report := range reports {
		report.Title = strings.TrimSpace(report.Title)
		if report.Title == "" {
			continue
		}
		report.ID = defaultString(strings.TrimSpace(report.ID), slugifyAgentID(report.Title))
		report.Status = defaultString(strings.TrimSpace(report.Status), "草稿")
		report.Owner = strings.TrimSpace(report.Owner)
		report.Desc = strings.TrimSpace(report.Desc)
		report.Body = strings.TrimSpace(report.Body)
		if report.Body == "" && report.Desc != "" {
			report.Body = report.Desc
		}
		report.Kind = defaultString(strings.TrimSpace(report.Kind), "分析报告")
		report.Source = defaultString(strings.TrimSpace(report.Source), "工作台数据")
		report.Format = defaultString(strings.TrimSpace(report.Format), "Markdown")
		report.Priority = defaultString(strings.TrimSpace(report.Priority), "中")
		report.CreatedAt = defaultString(report.CreatedAt, now)
		report.UpdatedAt = defaultString(report.UpdatedAt, report.CreatedAt)
		out = append(out, report)
	}
	sortReports(out)
	return out
}

func normalizeKnowledgeDocuments(items []WorkbenchKnowledgeDocumentView) []WorkbenchKnowledgeDocumentView {
	now := time.Now().Format(time.RFC3339)
	out := make([]WorkbenchKnowledgeDocumentView, 0, len(items))
	for _, item := range items {
		item.Title = strings.TrimSpace(item.Title)
		if item.Title == "" {
			continue
		}
		item.ID = defaultString(strings.TrimSpace(item.ID), slugifyAgentID(item.Title))
		item.Type = defaultString(strings.TrimSpace(item.Type), "文档")
		item.Status = defaultString(strings.TrimSpace(item.Status), "可用")
		item.Content = strings.TrimSpace(item.Content)
		item.FileSize = maxInt64(item.FileSize, 0)
		item.ChunkCount = maxInt(item.ChunkCount, 0)
		item.MaterialIDs = normalizeKnowledgeMaterialIDs(item.MaterialIDs)
		if len(item.MaterialIDs) > 0 {
			item.Count = len(item.MaterialIDs)
		} else {
			item.Count = maxInt(item.Count, 0)
		}
		item.CreatedAt = defaultString(item.CreatedAt, now)
		item.UpdatedAt = defaultString(item.UpdatedAt, item.CreatedAt)
		out = append(out, item)
	}
	return out
}

func normalizeRegulations(items []WorkbenchRegulationView) []WorkbenchRegulationView {
	now := time.Now().Format(time.RFC3339)
	out := make([]WorkbenchRegulationView, 0, len(items))
	for _, item := range items {
		item.Title = strings.TrimSpace(item.Title)
		if item.Title == "" {
			continue
		}
		item.ID = defaultString(strings.TrimSpace(item.ID), slugifyAgentID(item.Title))
		item.Category = defaultString(strings.TrimSpace(item.Category), "规则")
		item.Status = defaultString(strings.TrimSpace(item.Status), "现行有效")
		item.Content = strings.TrimSpace(item.Content)
		item.CreatedAt = defaultString(item.CreatedAt, now)
		item.UpdatedAt = defaultString(item.UpdatedAt, item.CreatedAt)
		out = append(out, item)
	}
	return out
}

func normalizeSyncJobs(items []WorkbenchSyncJobView) []WorkbenchSyncJobView {
	now := time.Now().Format(time.RFC3339)
	out := make([]WorkbenchSyncJobView, 0, len(items))
	for _, item := range items {
		item.Title = strings.TrimSpace(item.Title)
		if item.Title == "" {
			continue
		}
		item.ID = defaultString(strings.TrimSpace(item.ID), slugifyAgentID(item.Title))
		item.Status = defaultString(strings.TrimSpace(item.Status), "未知")
		item.Progress = defaultString(strings.TrimSpace(item.Progress), "0%")
		item.Time = strings.TrimSpace(item.Time)
		item.UpdatedAt = defaultString(item.UpdatedAt, now)
		out = append(out, item)
	}
	return out
}

func normalizeOperationLogs(items []WorkbenchOperationLogView) []WorkbenchOperationLogView {
	now := time.Now().Format(time.RFC3339)
	out := make([]WorkbenchOperationLogView, 0, len(items))
	for _, item := range items {
		item.Action = strings.TrimSpace(item.Action)
		if item.Action == "" {
			continue
		}
		item.ID = defaultString(strings.TrimSpace(item.ID), slugifyAgentID(item.Action+"-"+item.Target))
		item.User = defaultString(strings.TrimSpace(item.User), "我的")
		item.Result = defaultString(strings.TrimSpace(item.Result), "未知")
		item.CreatedAt = defaultString(item.CreatedAt, now)
		out = append(out, item)
	}
	return out
}

func normalizeTeamRooms(items []WorkbenchTeamRoomView) []WorkbenchTeamRoomView {
	now := time.Now().Format(time.RFC3339)
	out := make([]WorkbenchTeamRoomView, 0, len(items))
	for _, item := range items {
		item.Title = strings.TrimSpace(item.Title)
		if item.Title == "" {
			continue
		}
		item.ID = defaultString(strings.TrimSpace(item.ID), slugifyAgentID(item.Title))
		item.Members = maxInt(item.Members, len(item.MemberIDs))
		item.MemberIDs = cleanAutomationLines(item.MemberIDs)
		item.Avatars = cleanAutomationLines(item.Avatars)
		item.Controls = cleanAutomationLines(item.Controls)
		item.Artifacts = cleanAutomationLines(item.Artifacts)
		item.CreatedAt = defaultString(item.CreatedAt, now)
		item.UpdatedAt = defaultString(item.UpdatedAt, item.CreatedAt)
		out = append(out, item)
	}
	return out
}

func normalizeTeamRuns(items []WorkbenchTeamRunView) []WorkbenchTeamRunView {
	out := make([]WorkbenchTeamRunView, 0, len(items))
	for _, item := range items {
		item.Title = strings.TrimSpace(item.Title)
		if item.Title == "" || strings.TrimSpace(item.TeamID) == "" {
			continue
		}
		item.ID = defaultString(strings.TrimSpace(item.ID), slugifyAgentID(item.Title))
		item.Status = defaultString(strings.TrimSpace(item.Status), "draft")
		out = append(out, item)
	}
	return out
}

func normalizeTeamChatMessages(items []WorkbenchTeamChatMessageView) []WorkbenchTeamChatMessageView {
	existing := make([]string, 0, len(items))
	for _, item := range items {
		existing = append(existing, item.ID)
	}
	out := make([]WorkbenchTeamChatMessageView, 0, len(items))
	for _, item := range items {
		if strings.TrimSpace(item.TeamID) == "" || strings.TrimSpace(item.Content) == "" {
			continue
		}
		item.ID = defaultString(strings.TrimSpace(item.ID), uniqueWorkbenchDataID("team-message", existing))
		existing = append(existing, item.ID)
		item.Role = defaultString(strings.TrimSpace(item.Role), "user")
		out = append(out, item)
	}
	return out
}

func replaceOrPrependCustomer(data *WorkbenchDataView, next WorkbenchCustomerView) {
	for i, item := range data.Customers {
		if item.ID == next.ID {
			next.CreatedAt = defaultString(item.CreatedAt, next.CreatedAt)
			data.Customers[i] = next
			return
		}
	}
	data.Customers = append([]WorkbenchCustomerView{next}, data.Customers...)
}

func replaceOrPrependCalendar(data *WorkbenchDataView, next WorkbenchCalendarEventView) {
	for i, item := range data.CalendarEvents {
		if item.ID == next.ID {
			next.CreatedAt = defaultString(item.CreatedAt, next.CreatedAt)
			data.CalendarEvents[i] = next
			return
		}
	}
	data.CalendarEvents = append([]WorkbenchCalendarEventView{next}, data.CalendarEvents...)
}

func replaceOrPrependReport(data *WorkbenchDataView, next WorkbenchReportView) {
	for i, item := range data.Reports {
		if item.ID == next.ID {
			next.CreatedAt = defaultString(item.CreatedAt, next.CreatedAt)
			data.Reports[i] = next
			return
		}
	}
	data.Reports = append([]WorkbenchReportView{next}, data.Reports...)
}

func replaceOrPrependKnowledgeDocument(data *WorkbenchDataView, next WorkbenchKnowledgeDocumentView) {
	for i, item := range data.KnowledgeDocuments {
		if item.ID == next.ID {
			next.CreatedAt = defaultString(item.CreatedAt, next.CreatedAt)
			data.KnowledgeDocuments[i] = next
			return
		}
	}
	data.KnowledgeDocuments = append([]WorkbenchKnowledgeDocumentView{next}, data.KnowledgeDocuments...)
}

func replaceOrPrependTeamRoom(data *WorkbenchDataView, next WorkbenchTeamRoomView) {
	for i, item := range data.TeamRooms {
		if item.ID == next.ID {
			next.CreatedAt = defaultString(item.CreatedAt, next.CreatedAt)
			data.TeamRooms[i] = next
			return
		}
	}
	data.TeamRooms = append([]WorkbenchTeamRoomView{next}, data.TeamRooms...)
}

func replaceOrPrependTeamRun(data *WorkbenchDataView, next WorkbenchTeamRunView) {
	for i, item := range data.TeamRuns {
		if item.ID == next.ID {
			next.CreatedAt = defaultString(item.CreatedAt, next.CreatedAt)
			data.TeamRuns[i] = next
			return
		}
	}
	data.TeamRuns = append(data.TeamRuns, next)
}

func uniqueWorkbenchDataID(base string, existing []string) string {
	base = defaultString(strings.TrimSpace(base), "item")
	seen := map[string]bool{}
	for _, id := range existing {
		seen[id] = true
	}
	if !seen[base] {
		return base
	}
	for i := 2; ; i++ {
		candidate := base + "-" + strconv.Itoa(i)
		if !seen[candidate] {
			return candidate
		}
	}
}

func customerIDs(items []WorkbenchCustomerView) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.ID)
	}
	return out
}

func calendarIDs(items []WorkbenchCalendarEventView) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.ID)
	}
	return out
}

func reportIDs(items []WorkbenchReportView) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.ID)
	}
	return out
}

func knowledgeDocumentIDs(items []WorkbenchKnowledgeDocumentView) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.ID)
	}
	return out
}

func regulationIDs(items []WorkbenchRegulationView) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.ID)
	}
	return out
}

func normalizeKnowledgeMaterialIDs(ids []string) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(ids))
	for _, id := range ids {
		id = strings.TrimSpace(id)
		if id == "" {
			continue
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out
}

func syncJobIDs(items []WorkbenchSyncJobView) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.ID)
	}
	return out
}

func operationLogIDs(items []WorkbenchOperationLogView) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.ID)
	}
	return out
}

func teamRoomIDs(items []WorkbenchTeamRoomView) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.ID)
	}
	return out
}

func teamRunIDs(items []WorkbenchTeamRunView) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.ID)
	}
	return out
}

func teamMessageIDs(items []WorkbenchTeamChatMessageView) []string {
	out := make([]string, 0, len(items))
	for _, item := range items {
		out = append(out, item.ID)
	}
	return out
}

func sortCustomers(items []WorkbenchCustomerView) {
	sort.SliceStable(items, func(i, j int) bool { return items[i].UpdatedAt > items[j].UpdatedAt })
}

func sortCalendarEvents(items []WorkbenchCalendarEventView) {
	sort.SliceStable(items, func(i, j int) bool {
		if items[i].Date != items[j].Date {
			return items[i].Date < items[j].Date
		}
		if items[i].Day == items[j].Day {
			return items[i].Time < items[j].Time
		}
		return items[i].Day < items[j].Day
	})
}

func sortReports(items []WorkbenchReportView) {
	sort.SliceStable(items, func(i, j int) bool { return items[i].UpdatedAt > items[j].UpdatedAt })
}
