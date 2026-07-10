package main

import (
	"os"
	"testing"
)

func TestWorkbenchDataPersistsBusinessSurfaces(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	initial, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatalf("ListWorkbenchData initial: %v", err)
	}
	if len(initial.Customers) == 0 || len(initial.CalendarEvents) == 0 || len(initial.TeamRooms) == 0 {
		t.Fatalf("default workbench data missing seeded surfaces: %+v", initial)
	}

	customer, err := app.SaveCustomer(WorkbenchCustomerInput{
		Name:       "测试客户",
		Type:       "企业",
		Phone:      "10086",
		Risk:       "中风险",
		RiskLevel:  "medium",
		Owner:      "测试负责人",
		ProjectIDs: []string{"volt-gui"},
		Tags:       []string{"测试", "持久化"},
	})
	if err != nil {
		t.Fatalf("SaveCustomer: %v", err)
	}
	if customer.ID == "" || customer.Name != "测试客户" {
		t.Fatalf("SaveCustomer returned unexpected customer: %+v", customer)
	}

	event, err := app.SaveCalendarEvent(WorkbenchCalendarEventInput{
		Title:     "测试日程",
		Day:       "21",
		Time:      "10:30",
		Type:      "review",
		Place:     "本地工作台",
		ProjectID: "volt-gui",
	})
	if err != nil {
		t.Fatalf("SaveCalendarEvent: %v", err)
	}
	if event.ID == "" || event.Day != "21" || event.ProjectID != "volt-gui" {
		t.Fatalf("SaveCalendarEvent returned unexpected event: %+v", event)
	}

	report, err := app.SaveWorkbenchReport(WorkbenchReportInput{Title: "测试报告", Status: "草稿", Owner: "测试 Agent", Desc: "回归测试报告"})
	if err != nil {
		t.Fatalf("SaveWorkbenchReport: %v", err)
	}
	if report.ID == "" || report.Status != "草稿" {
		t.Fatalf("SaveWorkbenchReport returned unexpected report: %+v", report)
	}

	document, err := app.SaveKnowledgeDocument(WorkbenchKnowledgeDocumentInput{Title: "测试模板", Type: "模板", Count: 1, Status: "草稿", Description: "回归测试模板"})
	if err != nil {
		t.Fatalf("SaveKnowledgeDocument: %v", err)
	}
	if document.ID == "" || document.Status != "草稿" {
		t.Fatalf("SaveKnowledgeDocument returned unexpected document: %+v", document)
	}

	project, err := app.SaveWorkbenchProject(WorkbenchProjectInput{Name: "测试项目搜索", Client: "测试客户", Desc: "跨工作台检索项目"})
	if err != nil {
		t.Fatalf("SaveWorkbenchProject: %v", err)
	}
	todo, err := app.SaveTodo(WorkbenchTodoInput{Title: "测试待办搜索", Description: "跨工作台检索待办", ProjectID: project.ID, ProjectName: project.Name, Priority: "中", Status: "pending"})
	if err != nil {
		t.Fatalf("SaveTodo: %v", err)
	}
	material, err := app.SaveProjectMaterial(WorkbenchProjectMaterialInput{ProjectID: project.ID, ProjectName: project.Name, Title: "测试资料搜索", Category: "测试资料", Source: "manual", Status: "已索引", Desc: "跨工作台检索资料"})
	if err != nil {
		t.Fatalf("SaveProjectMaterial: %v", err)
	}

	run, err := app.SaveTeamRun(WorkbenchTeamRunView{TeamID: "product-lab", Title: "测试团队运行", Status: "running", Task: "验证团队运行持久化"})
	if err != nil {
		t.Fatalf("SaveTeamRun: %v", err)
	}
	if run.ID == "" || len(run.Events) == 0 {
		t.Fatalf("SaveTeamRun did not create a durable run event: %+v", run)
	}

	jobs, err := app.RunWorkbenchSync("测试同步")
	if err != nil {
		t.Fatalf("RunWorkbenchSync: %v", err)
	}
	if len(jobs) == 0 || jobs[0].Title != "测试同步" || jobs[0].Progress != "100%" {
		t.Fatalf("RunWorkbenchSync returned unexpected jobs: %+v", jobs)
	}

	results, err := app.SearchWorkbench("测试")
	if err != nil {
		t.Fatalf("SearchWorkbench: %v", err)
	}
	if len(results) == 0 {
		t.Fatal("SearchWorkbench did not find saved data")
	}
	for _, scope := range []string{"项目管理", "待办事项", "资料库"} {
		if !containsSearchScope(results, scope) {
			t.Fatalf("SearchWorkbench did not include %s results: %+v", scope, results)
		}
	}

	reloaded, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatalf("ListWorkbenchData reloaded: %v", err)
	}
	if !containsCustomer(reloaded.Customers, customer.ID) || !containsCalendarEvent(reloaded.CalendarEvents, event.ID) || !containsReport(reloaded.Reports, report.ID) || !containsKnowledgeDocument(reloaded.KnowledgeDocuments, document.ID) || !containsTeamRun(reloaded.TeamRuns, run.ID) {
		t.Fatalf("saved workbench data not persisted: %+v", reloaded)
	}
	if project.ID == "" || todo.ID == "" || material.ID == "" {
		t.Fatalf("cross-store fixtures were not saved: project=%+v todo=%+v material=%+v", project, todo, material)
	}
}

func TestWorkbenchExportsWriteFiles(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	logPath, err := app.ExportOperationLogs()
	if err != nil {
		t.Fatalf("ExportOperationLogs: %v", err)
	}
	if _, err := os.Stat(logPath); err != nil {
		t.Fatalf("ExportOperationLogs path not written: %v", err)
	}

	reportPath, err := app.ExportWorkbenchReports()
	if err != nil {
		t.Fatalf("ExportWorkbenchReports: %v", err)
	}
	if _, err := os.Stat(reportPath); err != nil {
		t.Fatalf("ExportWorkbenchReports path not written: %v", err)
	}
}

func TestDeleteKnowledgeDocumentRemovesIndexAndWorkbenchMetadata(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	document, err := app.SaveKnowledgeDocument(WorkbenchKnowledgeDocumentInput{
		Title:       "待删除知识",
		Type:        "模板",
		Status:      "草稿",
		Description: "删除时需要同时清理本地 SQLite 索引和工作台元数据。",
		Tags:        "sqlite / metadata",
	})
	if err != nil {
		t.Fatalf("SaveKnowledgeDocument: %v", err)
	}
	if document.ChunkCount == 0 || document.IndexedAt == "" {
		t.Fatalf("SaveKnowledgeDocument did not return index metadata: %+v", document)
	}

	results, err := app.SearchKnowledge("SQLite 索引", 5)
	if err != nil {
		t.Fatalf("SearchKnowledge: %v", err)
	}
	if len(results) == 0 {
		t.Fatalf("SearchKnowledge did not find indexed document")
	}

	if err := app.DeleteKnowledgeDocument(document.ID); err != nil {
		t.Fatalf("DeleteKnowledgeDocument: %v", err)
	}
	afterDelete, err := app.SearchKnowledge("SQLite 索引", 5)
	if err != nil {
		t.Fatalf("SearchKnowledge after delete: %v", err)
	}
	for _, result := range afterDelete {
		if result.DocumentID == document.ID {
			t.Fatalf("deleted document still indexed: %+v", result)
		}
	}
	reloaded, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatalf("ListWorkbenchData: %v", err)
	}
	if containsKnowledgeDocument(reloaded.KnowledgeDocuments, document.ID) {
		t.Fatalf("deleted document still present in workbench metadata: %+v", reloaded.KnowledgeDocuments)
	}
}

func TestWorkbenchDeleteCustomerRemovesRecord(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	saved, err := app.SaveCustomer(WorkbenchCustomerInput{Name: "待删除客户"})
	if err != nil {
		t.Fatalf("SaveCustomer: %v", err)
	}
	if err := app.DeleteCustomer(saved.ID); err != nil {
		t.Fatalf("DeleteCustomer: %v", err)
	}
	reloaded, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatalf("ListWorkbenchData: %v", err)
	}
	if containsCustomer(reloaded.Customers, saved.ID) {
		t.Fatalf("deleted customer still present: %+v", reloaded.Customers)
	}
}

func TestWorkbenchReportUpdateExportAndDelete(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	saved, err := app.SaveWorkbenchReport(WorkbenchReportInput{
		Title:  "单篇报告闭环",
		Status: "草稿",
		Body:   "初始正文",
	})
	if err != nil {
		t.Fatalf("SaveWorkbenchReport create: %v", err)
	}
	updated, err := app.SaveWorkbenchReport(WorkbenchReportInput{
		ID:     saved.ID,
		Title:  "单篇报告闭环更新",
		Status: "已生成",
		Body:   "更新正文",
	})
	if err != nil {
		t.Fatalf("SaveWorkbenchReport update: %v", err)
	}
	if updated.CreatedAt != saved.CreatedAt {
		t.Fatalf("report update should preserve CreatedAt: before=%q after=%q", saved.CreatedAt, updated.CreatedAt)
	}
	if updated.UpdatedAt == "" {
		t.Fatalf("report update should set UpdatedAt: %+v", updated)
	}
	reportPath, err := app.ExportWorkbenchReport(updated.ID)
	if err != nil {
		t.Fatalf("ExportWorkbenchReport: %v", err)
	}
	if _, err := os.Stat(reportPath); err != nil {
		t.Fatalf("ExportWorkbenchReport path not written: %v", err)
	}
	if err := app.DeleteWorkbenchReport(updated.ID); err != nil {
		t.Fatalf("DeleteWorkbenchReport: %v", err)
	}
	reloaded, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatalf("ListWorkbenchData: %v", err)
	}
	if containsReport(reloaded.Reports, updated.ID) {
		t.Fatalf("deleted report still present: %+v", reloaded.Reports)
	}
}

func TestWorkbenchTeamRoomAndChatPersist(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	room, err := app.SaveTeamRoom(WorkbenchTeamRoomView{Title: "测试协作组", MemberIDs: []string{"a", "b"}, Avatars: []string{"A", "B"}})
	if err != nil {
		t.Fatalf("SaveTeamRoom: %v", err)
	}
	if room.ID == "" || room.Members != 2 {
		t.Fatalf("SaveTeamRoom returned unexpected room: %+v", room)
	}
	msg, err := app.SaveTeamChatMessage(WorkbenchTeamChatMessageView{TeamID: room.ID, Role: "user", Content: "测试消息"})
	if err != nil {
		t.Fatalf("SaveTeamChatMessage: %v", err)
	}
	if msg.ID == "" {
		t.Fatalf("SaveTeamChatMessage returned empty ID: %+v", msg)
	}
	reloaded, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatalf("ListWorkbenchData: %v", err)
	}
	if !containsTeamRoom(reloaded.TeamRooms, room.ID) {
		t.Fatalf("team room not persisted: %+v", reloaded.TeamRooms)
	}
	if !containsTeamChatMessage(reloaded.TeamChatMessages, msg.ID) {
		t.Fatalf("team chat message not persisted: %+v", reloaded.TeamChatMessages)
	}
}

func TestWorkbenchDistillAgentFromTodo(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	agent, err := app.DistillAgentFromTodo(WorkbenchTodoInput{Title: "蒸馏测试", Description: "从任务蒸馏 Agent"}, []string{"技能 A"})
	if err != nil {
		t.Fatalf("DistillAgentFromTodo: %v", err)
	}
	if agent.ID == "" || agent.Name != "蒸馏测试 Agent" {
		t.Fatalf("DistillAgentFromTodo returned unexpected agent: %+v", agent)
	}
	if agent.Role != "已蒸馏" || agent.Status != "已启用" {
		t.Fatalf("DistillAgentFromTodo role/status mismatch: %+v", agent)
	}
}

func TestWorkbenchEmptyDataStaysEmpty(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	// Save then delete all customers to get an empty-but-initialized store
	cust, err := app.SaveCustomer(WorkbenchCustomerInput{Name: "临时客户"})
	if err != nil {
		t.Fatalf("SaveCustomer: %v", err)
	}
	_ = app.DeleteCustomer(cust.ID)

	// Write an initialized-but-empty data file directly
	data, err := loadWorkbenchData()
	if err != nil {
		t.Fatalf("loadWorkbenchData: %v", err)
	}
	data.Customers = nil
	data.CalendarEvents = nil
	data.Reports = nil
	data.KnowledgeDocuments = nil
	data.TeamRooms = nil
	if err := saveWorkbenchData(data); err != nil {
		t.Fatalf("saveWorkbenchData: %v", err)
	}

	reloaded, err := loadWorkbenchData()
	if err != nil {
		t.Fatalf("reload: %v", err)
	}
	if len(reloaded.Customers) != 0 || !reloaded.Initialized {
		t.Fatalf("empty data was re-seeded instead of staying empty: %+v", reloaded)
	}
}

func containsTeamRoom(items []WorkbenchTeamRoomView, id string) bool {
	for _, item := range items {
		if item.ID == id {
			return true
		}
	}
	return false
}

func containsTeamChatMessage(items []WorkbenchTeamChatMessageView, id string) bool {
	for _, item := range items {
		if item.ID == id {
			return true
		}
	}
	return false
}

func containsCustomer(items []WorkbenchCustomerView, id string) bool {
	for _, item := range items {
		if item.ID == id {
			return true
		}
	}
	return false
}

func containsCalendarEvent(items []WorkbenchCalendarEventView, id string) bool {
	for _, item := range items {
		if item.ID == id {
			return true
		}
	}
	return false
}

func containsReport(items []WorkbenchReportView, id string) bool {
	for _, item := range items {
		if item.ID == id {
			return true
		}
	}
	return false
}

func containsKnowledgeDocument(items []WorkbenchKnowledgeDocumentView, id string) bool {
	for _, item := range items {
		if item.ID == id {
			return true
		}
	}
	return false
}

func containsTeamRun(items []WorkbenchTeamRunView, id string) bool {
	for _, item := range items {
		if item.ID == id {
			return true
		}
	}
	return false
}

func containsSearchScope(items []WorkbenchSearchResultView, scope string) bool {
	for _, item := range items {
		if item.Scope == scope {
			return true
		}
	}
	return false
}
