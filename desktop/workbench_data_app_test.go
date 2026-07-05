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
