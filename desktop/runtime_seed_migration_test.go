package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestLegacyRuntimeSeedsAreRemovedFromDiskWithoutDeletingCustomizedIDs(t *testing.T) {
	const stamp = "2026-06-15T08:00:00Z"
	const updated = "2026-06-15T09:00:00Z"

	t.Run("agents", func(t *testing.T) {
		isolateDesktopUserDirs(t)
		path, _ := agentsPath()
		legacy := PersistentAgentView{ID: "code-review", Name: "代码审查 Agent", Role: "内置", Runs: 128, Status: "已启用", Desc: "阅读仓库上下文，发现风险、缺失测试和回归点。", Avatar: "C", Provider: "OpenAI", Model: "GPT-4o", Tools: []string{"workspace", "git", "terminal"}, Skills: []string{"code-review"}, CoreFiles: []string{"AGENTS.md"}, BuiltIn: true, CreatedAt: stamp, UpdatedAt: stamp}
		custom := legacy
		custom.Vibe = "用户自定义风格"
		custom.UpdatedAt = updated
		writeRuntimeMigrationFixture(t, path, agentsDiskFile{Agents: []PersistentAgentView{legacy, custom}})
		items, err := loadAgents()
		if err != nil || len(items) != 1 || items[0].Vibe != custom.Vibe || items[0].Provider != "OpenAI" || items[0].Model != "GPT-4o" {
			t.Fatalf("loadAgents = %+v, err=%v", items, err)
		}
		assertRuntimeMigrationRecordCount(t, path, "agents", 1)
	})

	t.Run("todos", func(t *testing.T) {
		isolateDesktopUserDirs(t)
		path, _ := todosPath()
		legacy := WorkbenchTodoView{ID: "todo-preview-load", Title: "验证桌面预览加载状态", Description: "确认浏览器模式无需 Wails 绑定也能进入工作台", DueLabel: "今天", Status: "in_progress", Priority: "中", Source: "seed", CreatedAt: stamp, UpdatedAt: stamp}
		custom := legacy
		custom.ProjectID = "real-project"
		custom.UpdatedAt = updated
		writeRuntimeMigrationFixture(t, path, todosDiskFile{Todos: []WorkbenchTodoView{legacy, custom}})
		items, err := loadTodos()
		if err != nil || len(items) != 1 || items[0].ProjectID != custom.ProjectID {
			t.Fatalf("loadTodos = %+v, err=%v", items, err)
		}
		assertRuntimeMigrationRecordCount(t, path, "todos", 1)
	})

	t.Run("projects", func(t *testing.T) {
		isolateDesktopUserDirs(t)
		path, _ := workbenchProjectsPath()
		legacy := WorkbenchProjectView{ID: "volt-gui", Name: "Volt GUI 桌面端重构", Code: "PRJ-2026-0615", Client: "内部研发", Stage: "进行中", Owner: "产品工作台", Desc: "恢复 AoristLawer 式导航、Agent 与能力中心，并把 Coding 模式统一到新建对话。", Category: "桌面端重构", Court: "研发工作台", Budget: "1,200,000", AcceptedAt: "2026-06-15", Status: "active", Progress: 78, Priority: "高", Risk: "中风险", UpdatedAt: "28 分钟前", NextStep: "完成项目管理页深化并做构建验证", Agent: "代码审查 Agent", Materials: 12, Todos: 5, Events: 3, Reports: 4, Timeline: []string{"AORISTLAWER 参考界面已完成源码对照", "新建对话与代码状态入口已统一", "项目管理页进入深化验收"}, CreatedAt: stamp, UpdatedISO: stamp}
		custom := legacy
		custom.Owner = "用户负责人"
		custom.UpdatedISO = updated
		writeRuntimeMigrationFixture(t, path, workbenchProjectsDiskFile{Projects: []WorkbenchProjectView{legacy, custom}})
		items, err := loadWorkbenchProjects()
		if err != nil || len(items) != 1 || items[0].Owner != custom.Owner {
			t.Fatalf("loadWorkbenchProjects = %+v, err=%v", items, err)
		}
		assertRuntimeMigrationRecordCount(t, path, "projects", 1)
	})

	t.Run("materials", func(t *testing.T) {
		isolateDesktopUserDirs(t)
		path, _ := projectMaterialsPath()
		legacy := WorkbenchProjectMaterialView{ID: "volt-gui-relation-sample", ProjectID: "volt-gui", ProjectName: "Volt GUI 桌面端重构", Title: "客户与项目关联样例", Category: "业务资料", Source: "local", Status: "待复核", UpdatedAt: "昨天", Desc: "用于验证项目详情与客户详情之间的跳转和任务关联。", CreatedAt: stamp, UpdatedISO: stamp}
		custom := legacy
		custom.FilePath = "/real/customer-link.md"
		custom.UpdatedISO = updated
		writeRuntimeMigrationFixture(t, path, workbenchProjectMaterialsDiskFile{Materials: []WorkbenchProjectMaterialView{legacy, custom}})
		items, err := loadProjectMaterials()
		if err != nil || len(items) != 1 || items[0].FilePath != custom.FilePath {
			t.Fatalf("loadProjectMaterials = %+v, err=%v", items, err)
		}
		assertRuntimeMigrationRecordCount(t, path, "materials", 1)
	})

	t.Run("automations", func(t *testing.T) {
		isolateDesktopUserDirs(t)
		path, _ := automationsPath()
		legacy := WorkbenchAutomationView{ID: "desktop-frontend-gate", Title: "桌面前端质量门禁", Desc: "针对 desktop/frontend 执行 Svelte 类型检查、Vite 构建和差异空白检查。", Status: automationStatusRunning, Kind: "质量门禁", Owner: "代码审查 Agent", StartedAtMs: 1, Cadence: "每次前端改动后", Schedule: "改动后手动复跑", ScheduleMode: "manual", Scope: "desktop/frontend", Environment: "local workspace", Command: "frontend-check", Result: "通过", LastRun: "12 分钟前", NextRun: "下一次前端改动", Steps: []string{"pnpm check", "pnpm build", "git diff --check"}, Logs: []string{"svelte-check passed"}, CreatedAt: stamp, UpdatedAt: stamp}
		custom := legacy
		custom.Command = "root-go-test"
		custom.UpdatedAt = updated
		writeRuntimeMigrationFixture(t, path, automationsDiskFile{Automations: []WorkbenchAutomationView{legacy, custom}})
		items, err := loadAutomations()
		if err != nil || len(items) != 1 || items[0].Command != custom.Command {
			t.Fatalf("loadAutomations = %+v, err=%v", items, err)
		}
		assertRuntimeMigrationRecordCount(t, path, "automations", 1)
	})

	t.Run("workbench data", func(t *testing.T) {
		isolateDesktopUserDirs(t)
		path, _ := workbenchDataPath()
		legacyCustomer := WorkbenchCustomerView{ID: "internal", Name: "内部研发团队", Type: "企业", Contact: "产品负责人", Phone: "internal", Email: "dev@example.com", Risk: "低风险", RiskLevel: "low", Status: "active", Owner: "产品工作台", Stage: "活跃", Industry: "研发", Region: "本地", Address: "局域网本地客户档案", Note: "围绕 Volt GUI 桌面端体验、代码质量和发布节奏维护长期项目上下文。", Desc: "Volt GUI 研发与验证主体。", ProjectIDs: []string{"volt-gui", "homepage"}, Matters: 2, Materials: 4, Events: 2, Todos: 5, Reports: 2, LastTouch: "刚刚", LastContact: "刚刚", NextAction: "继续验证工作台功能", Tags: []string{"内部", "研发"}, CreatedAt: stamp, UpdatedAt: stamp}
		customCustomer := legacyCustomer
		customCustomer.Owner = "用户负责人"
		customCustomer.UpdatedAt = updated
		legacyMessage := WorkbenchTeamChatMessageView{ID: "product-lab-system-1", TeamID: "product-lab", Role: "agent", AgentID: "code-review", AgentName: "代码审查 Agent", AgentAvatar: "C", Content: "当前是协作组模板预览。发送任务后会生成运行草稿。", CreatedAt: stamp}
		customMessage := legacyMessage
		customMessage.AgentName = "用户配置 Agent"
		legacyReport := WorkbenchReportView{ID: "project-risk", Title: "项目风险分析报告", Status: "已生成", Owner: "代码审查 Agent", Desc: "覆盖变更风险、测试缺口、回滚建议。", Body: "覆盖变更风险、测试缺口、回滚建议。", Kind: "风险报告", Source: "工作台数据", Format: "Markdown", Priority: "中", CreatedAt: stamp, UpdatedAt: stamp}
		customReport := legacyReport
		customReport.Priority = "高"
		customReport.UpdatedAt = updated
		legacyKnowledge := WorkbenchKnowledgeDocumentView{ID: "requirement-template", Title: "需求澄清记录模板", Type: "模板", Count: 2, Status: "可用", Description: "用于记录目标、非目标、验收标准和执行边界。", MaterialIDs: []string{"volt-gui-ia-notes", "volt-gui-relation-sample"}, CreatedAt: stamp, UpdatedAt: stamp}
		customKnowledge := legacyKnowledge
		customKnowledge.Content = "用户维护的真实模板内容"
		customKnowledge.UpdatedAt = updated
		writeRuntimeMigrationFixture(t, path, WorkbenchDataView{Customers: []WorkbenchCustomerView{legacyCustomer, customCustomer}, Reports: []WorkbenchReportView{legacyReport, customReport}, KnowledgeDocuments: []WorkbenchKnowledgeDocumentView{legacyKnowledge, customKnowledge}, TeamChatMessages: []WorkbenchTeamChatMessageView{legacyMessage, customMessage}, Initialized: true})
		data, err := loadWorkbenchData()
		if err != nil || len(data.Customers) != 1 || data.Customers[0].Owner != customCustomer.Owner || len(data.Reports) != 1 || data.Reports[0].Priority != customReport.Priority || len(data.KnowledgeDocuments) != 1 || data.KnowledgeDocuments[0].Content != customKnowledge.Content || len(data.TeamChatMessages) != 1 || data.TeamChatMessages[0].AgentName != customMessage.AgentName {
			t.Fatalf("loadWorkbenchData = %+v, err=%v", data, err)
		}
		assertRuntimeMigrationRecordCount(t, path, "customers", 1)
		assertRuntimeMigrationRecordCount(t, path, "reports", 1)
		assertRuntimeMigrationRecordCount(t, path, "knowledgeDocuments", 1)
		assertRuntimeMigrationRecordCount(t, path, "teamChatMessages", 1)
	})
}

func writeRuntimeMigrationFixture(t *testing.T, path string, payload any) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	b, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, b, 0o644); err != nil {
		t.Fatal(err)
	}
}

func assertRuntimeMigrationRecordCount(t *testing.T, path, key string, want int) {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(b, &payload); err != nil {
		t.Fatal(err)
	}
	var records []json.RawMessage
	if err := json.Unmarshal(payload[key], &records); err != nil {
		t.Fatal(err)
	}
	if len(records) != want {
		t.Fatalf("migration did not persist %s count %d: %s", key, want, b)
	}
}
