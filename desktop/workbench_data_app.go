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
	ID          string `json:"id"`
	Title       string `json:"title"`
	Type        string `json:"type"`
	Count       int    `json:"count"`
	Status      string `json:"status"`
	Description string `json:"description,omitempty"`
	Source      string `json:"source,omitempty"`
	Tags        string `json:"tags,omitempty"`
	FileName    string `json:"fileName,omitempty"`
	FilePath    string `json:"filePath,omitempty"`
	MimeType    string `json:"mimeType,omitempty"`
	FileSize    int64  `json:"fileSize,omitempty"`
	ChunkCount  int    `json:"chunkCount,omitempty"`
	IndexedAt   string `json:"indexedAt,omitempty"`
	Error       string `json:"error,omitempty"`
	CreatedAt   string `json:"createdAt"`
	UpdatedAt   string `json:"updatedAt"`
}

type WorkbenchKnowledgeDocumentInput struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Type        string `json:"type"`
	Count       int    `json:"count"`
	Status      string `json:"status"`
	Description string `json:"description"`
	Source      string `json:"source"`
	Tags        string `json:"tags"`
}

type WorkbenchRegulationView struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Category  string `json:"category"`
	Status    string `json:"status"`
	Tags      string `json:"tags"`
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
	appendOperationLog(&data, "删除客户", defaultString(deleted, id), "我的", "成功")
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
		Content:     strings.Join([]string{doc.Title, doc.Description, doc.Tags}, "\n"),
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

func (a *App) RunWorkbenchSync(scope string) ([]WorkbenchSyncJobView, error) {
	data, err := loadWorkbenchData()
	if err != nil {
		return nil, err
	}
	now := time.Now().Format(time.RFC3339)
	title := defaultString(strings.TrimSpace(scope), "工作台同步")
	job := WorkbenchSyncJobView{ID: uniqueWorkbenchDataID(slugifyAgentID(title), syncJobIDs(data.SyncJobs)), Title: title, Status: "已完成", Progress: "100%", Time: "刚刚", UpdatedAt: now}
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
	appendOperationLog(&data, "导出报告", "分析报告", "我的", "成功")
	if err := saveWorkbenchData(data); err != nil {
		return "", err
	}
	return writeWorkbenchExport("reports", data.Reports)
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
		return defaultWorkbenchData(), nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return defaultWorkbenchData(), nil
		}
		return WorkbenchDataView{}, err
	}
	var data WorkbenchDataView
	if err := json.Unmarshal(b, &data); err != nil {
		return WorkbenchDataView{}, err
	}
	return normalizeWorkbenchData(data), nil
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

func defaultWorkbenchData() WorkbenchDataView {
	now := time.Now().Format(time.RFC3339)
	return WorkbenchDataView{
		Customers: []WorkbenchCustomerView{
			{ID: "internal", Name: "内部研发团队", Type: "企业", Contact: "产品负责人", Phone: "internal", Email: "dev@example.com", Risk: "低风险", RiskLevel: "low", Status: "active", Owner: "产品工作台", Stage: "活跃", Industry: "研发", Region: "本地", Address: "局域网本地客户档案", Note: "围绕 Volt GUI 桌面端体验、代码质量和发布节奏维护长期项目上下文。", Desc: "Volt GUI 研发与验证主体。", ProjectIDs: []string{"volt-gui", "homepage"}, Matters: 2, Materials: 4, Events: 2, Todos: 5, Reports: 2, LastTouch: "刚刚", LastContact: "刚刚", NextAction: "继续验证工作台功能", Tags: []string{"内部", "研发"}, CreatedAt: now, UpdatedAt: now},
			{ID: "ops", Name: "运营增长团队", Type: "企业", Contact: "增长负责人", Phone: "ops", Email: "ops@example.com", Risk: "中风险", RiskLevel: "medium", Status: "active", Owner: "增长项目", Stage: "跟进中", Industry: "运营", Region: "本地", Address: "运营项目群", Note: "负责发布材料、增长活动和客户触达。", Desc: "负责发布材料、增长活动和客户触达。", ProjectIDs: []string{"lurefree"}, Matters: 1, Materials: 2, Events: 1, Todos: 4, Reports: 1, LastTouch: "今天", LastContact: "今天", NextAction: "复核发布素材", Tags: []string{"运营", "增长"}, CreatedAt: now, UpdatedAt: now},
		},
		CalendarEvents: []WorkbenchCalendarEventView{
			{ID: "version-review", Day: "09", Title: "版本评审会议", Time: "09:30", Type: "meeting", Place: "线上会议室", Status: "已排期", CreatedAt: now, UpdatedAt: now},
			{ID: "customer-workflow", Day: "12", Title: "客户工作流复盘", Time: "14:00", Type: "deadline", Place: "项目群", Status: "待开始", CreatedAt: now, UpdatedAt: now},
			{ID: "automation-review", Day: "18", Title: "自动化验收", Time: "16:30", Type: "review", Place: "研发工作台", Status: "待验收", CreatedAt: now, UpdatedAt: now},
		},
		Reports: []WorkbenchReportView{
			{ID: "project-risk", Title: "项目风险分析报告", Status: "已生成", Owner: "代码审查 Agent", Desc: "覆盖变更风险、测试缺口、回滚建议。", Kind: "风险报告", CreatedAt: now, UpdatedAt: now},
			{ID: "customer-weekly", Title: "客户运营周报", Status: "草稿", Owner: "运营 Agent", Desc: "整理客户触达、项目状态与内容草案。", Kind: "周报", CreatedAt: now, UpdatedAt: now},
			{ID: "automation-run", Title: "项目自动化运行报告", Status: "待复核", Owner: "自动化 Agent", Desc: "汇总前端门禁、Go/Wails 门禁和本地预览回归的执行证据。", Kind: "验证报告", CreatedAt: now, UpdatedAt: now},
		},
		KnowledgeDocuments: []WorkbenchKnowledgeDocumentView{
			{ID: "requirement-template", Title: "需求澄清记录模板", Type: "模板", Count: 18, Status: "可用", Description: "用于记录目标、非目标、验收标准和执行边界。", CreatedAt: now, UpdatedAt: now},
			{ID: "project-retro", Title: "项目复盘记录", Type: "归档", Count: 42, Status: "已索引", Description: "历史项目复盘与交付证据。", CreatedAt: now, UpdatedAt: now},
			{ID: "automation-config", Title: "项目自动化配置说明", Type: "说明", Count: 9, Status: "已更新", Description: "工作台自动化任务、运行记录和失败处理。", CreatedAt: now, UpdatedAt: now},
		},
		Regulations: []WorkbenchRegulationView{
			{ID: "desktop-security", Title: "桌面端安全执行规范", Category: "内部规则", Status: "现行有效", Tags: "权限 / 沙箱 / 审计", CreatedAt: now, UpdatedAt: now},
			{ID: "agent-acceptance", Title: "Agent 协作验收标准", Category: "流程规范", Status: "试行", Tags: "任务 / 验证 / 交付", CreatedAt: now, UpdatedAt: now},
			{ID: "customer-boundary", Title: "客户数据使用边界", Category: "合规要求", Status: "现行有效", Tags: "客户 / 数据 / 留痕", CreatedAt: now, UpdatedAt: now},
		},
		SyncJobs: []WorkbenchSyncJobView{
			{ID: "memory-sync", Title: "记忆与核心文件同步", Status: "已完成", Progress: "100%", Time: "5 分钟前", UpdatedAt: now},
			{ID: "material-index", Title: "资料库索引", Status: "运行中", Progress: "64%", Time: "正在执行", UpdatedAt: now},
			{ID: "model-refresh", Title: "模型配置刷新", Status: "排队中", Progress: "0%", Time: "等待中", UpdatedAt: now},
		},
		OperationLogs: []WorkbenchOperationLogView{
			{ID: "create-agent", Action: "创建 Agent", Target: "代码审查 Agent", User: "我的", Time: "刚刚", Result: "成功", CreatedAt: now},
			{ID: "update-automation", Action: "更新自动化", Target: "桌面前端质量门禁", User: "我的", Time: "12 分钟前", Result: "成功", CreatedAt: now},
			{ID: "link-project", Action: "关联项目", Target: "Volt GUI 桌面端重构", User: "我的", Time: "28 分钟前", Result: "成功", CreatedAt: now},
		},
		TeamRooms: defaultTeamRooms(now),
		TeamChatMessages: []WorkbenchTeamChatMessageView{
			{ID: "product-lab-system-1", TeamID: "product-lab", Role: "agent", AgentID: "code-review", AgentName: "代码审查 Agent", AgentAvatar: "C", Content: "当前是协作组模板预览。发送任务后会生成运行草稿。", CreatedAt: now},
			{ID: "ops-growth-system-1", TeamID: "ops-growth", Role: "agent", AgentID: "research", AgentName: "资料研究 Agent", AgentAvatar: "R", Content: "请先绑定客户或项目资料，协作运行会基于真实上下文生成跟进建议。", CreatedAt: now},
		},
		Initialized: true,
	}
}

func defaultTeamRooms(now string) []WorkbenchTeamRoomView {
	return []WorkbenchTeamRoomView{
		{ID: "product-lab", Title: "产品研发组", Members: 3, Active: "模板已就绪", Desc: "围绕桌面端体验、代码质量和发布节奏组织多 Agent 协作。", Leader: "代码审查 Agent", LeaderID: "code-review", Status: "模板", Topic: "桌面端体验复核", Queue: "0 个运行节点", MemberIDs: []string{"code-review", "research", "automation"}, Avatars: []string{"C", "R", "A"}, Mode: "协调者编排", SharedContext: "项目资料库 / 当前变更", RunState: "待运行", NextCheckpoint: "发送任务后生成运行草稿", Outcome: "等待首次运行", Controls: []string{"暂停", "继续", "终止", "重新分配"}, Artifacts: []string{"报告草稿", "待办清单", "资料归档"}, Steps: []WorkbenchTeamRunStepView{{ID: "triage", Title: "拆解目标", Owner: "代码审查 Agent", Status: "待运行", Detail: "明确目标、非目标、验收标准和风险边界。"}, {ID: "research", Title: "补充资料", Owner: "资料研究 Agent", Status: "待运行", Detail: "读取关联资料并给出可引用依据。"}, {ID: "verify", Title: "验证闭环", Owner: "自动化 Agent", Status: "待运行", Detail: "生成检查命令、产物路径和失败处理建议。"}}, CreatedAt: now, UpdatedAt: now},
		{ID: "ops-growth", Title: "运营增长组", Members: 2, Active: "需补上下文", Desc: "处理客户触达、内容草案和项目跟进。", Leader: "资料研究 Agent", LeaderID: "research", Status: "待补充", Topic: "客户运营协同", Queue: "0 个运行节点", MemberIDs: []string{"research", "automation"}, Avatars: []string{"R", "A"}, Mode: "串行交接", SharedContext: "客户资料 / 报告模板", RunState: "未启动", NextCheckpoint: "绑定客户或项目资料", Outcome: "等待配置资料", Controls: []string{"暂停", "继续", "终止"}, Artifacts: []string{"跟进话术", "待办清单"}, Steps: []WorkbenchTeamRunStepView{{ID: "brief", Title: "整理背景", Owner: "资料研究 Agent", Status: "待补充", Detail: "收集客户状态、历史沟通和当前目标。"}, {ID: "actions", Title: "生成行动", Owner: "自动化 Agent", Status: "待运行", Detail: "把建议转为待办、日程和跟进记录。"}}, CreatedAt: now, UpdatedAt: now},
	}
}

func normalizeWorkbenchData(data WorkbenchDataView) WorkbenchDataView {
	if !data.Initialized && len(data.Customers) == 0 && len(data.CalendarEvents) == 0 && len(data.Reports) == 0 && len(data.KnowledgeDocuments) == 0 && len(data.TeamRooms) == 0 {
		seeded := defaultWorkbenchData()
		seeded.Initialized = true
		return seeded
	}
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
		LastTouch:   defaultString(strings.TrimSpace(input.LastTouch), "刚刚"),
		LastContact: defaultString(strings.TrimSpace(input.LastContact), "刚刚"),
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
	day := defaultString(strings.TrimSpace(input.Day), time.Now().Format("02"))
	next := WorkbenchCalendarEventView{ID: id, Day: day, Title: title, Time: defaultString(strings.TrimSpace(input.Time), "09:00"), Type: defaultString(strings.TrimSpace(input.Type), "meeting"), Place: defaultString(strings.TrimSpace(input.Place), "工作台"), ProjectID: strings.TrimSpace(input.ProjectID), CustomerID: strings.TrimSpace(input.CustomerID), Status: defaultString(strings.TrimSpace(input.Status), "待开始"), Desc: strings.TrimSpace(input.Desc), CreatedAt: now, UpdatedAt: now}
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
	next := WorkbenchReportView{
		ID:         id,
		Title:      title,
		Status:     defaultString(strings.TrimSpace(input.Status), "草稿"),
		Owner:      defaultString(strings.TrimSpace(input.Owner), "自动化 Agent"),
		Desc:       strings.TrimSpace(input.Desc),
		Body:       strings.TrimSpace(input.Body),
		Kind:       defaultString(strings.TrimSpace(input.Kind), "分析报告"),
		ProjectID:  strings.TrimSpace(input.ProjectID),
		CustomerID: strings.TrimSpace(input.CustomerID),
		Source:     defaultString(strings.TrimSpace(input.Source), "工作台数据"),
		Format:     defaultString(strings.TrimSpace(input.Format), "Markdown"),
		Priority:   defaultString(strings.TrimSpace(input.Priority), "中"),
		DueAt:      strings.TrimSpace(input.DueAt),
		CreatedAt:  now,
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
		Count:       maxInt(input.Count, 1),
		Status:      defaultString(strings.TrimSpace(input.Status), "草稿"),
		Description: strings.TrimSpace(input.Description),
		Source:      strings.TrimSpace(input.Source),
		Tags:        strings.TrimSpace(input.Tags),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
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
		input.Events = []WorkbenchTeamRunEventView{{ID: input.ID + "-created", Time: "刚刚", Actor: "用户", Type: "创建运行", Detail: defaultString(input.Task, title)}}
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
	data.OperationLogs = append([]WorkbenchOperationLogView{{ID: uniqueWorkbenchDataID(slugifyAgentID(action+"-"+target), operationLogIDs(data.OperationLogs)), Action: action, Target: target, User: defaultString(user, "我的"), Time: "刚刚", Result: defaultString(result, "成功"), CreatedAt: now}}, data.OperationLogs...)
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
		customer.LastContact = defaultString(strings.TrimSpace(customer.LastContact), defaultString(strings.TrimSpace(customer.LastTouch), "刚刚"))
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
		report.Status = defaultString(strings.TrimSpace(report.Status), "??")
		report.Owner = defaultString(strings.TrimSpace(report.Owner), "自动化 Agent")
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
		item.Count = maxInt(item.Count, 1)
		item.FileSize = maxInt64(item.FileSize, 0)
		item.ChunkCount = maxInt(item.ChunkCount, 0)
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
		item.Status = defaultString(strings.TrimSpace(item.Status), "已完成")
		item.Progress = defaultString(strings.TrimSpace(item.Progress), "100%")
		item.Time = defaultString(strings.TrimSpace(item.Time), "刚刚")
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
		item.Result = defaultString(strings.TrimSpace(item.Result), "成功")
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
		if items[i].Day == items[j].Day {
			return items[i].Time < items[j].Time
		}
		return items[i].Day < items[j].Day
	})
}

func sortReports(items []WorkbenchReportView) {
	sort.SliceStable(items, func(i, j int) bool { return items[i].UpdatedAt > items[j].UpdatedAt })
}
