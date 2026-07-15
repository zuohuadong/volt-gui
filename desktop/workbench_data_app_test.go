package main

import (
	"archive/zip"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWorkbenchDataPersistsBusinessSurfaces(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	initial, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatalf("ListWorkbenchData initial: %v", err)
	}
	if len(initial.Customers) != 0 || len(initial.CalendarEvents) != 0 || len(initial.TeamRooms) != 0 || !initial.Initialized {
		t.Fatalf("fresh workbench data should be initialized and empty: %+v", initial)
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

	room, err := app.SaveTeamRoom(WorkbenchTeamRoomView{Title: "测试团队", MemberIDs: []string{"member-a"}})
	if err != nil {
		t.Fatalf("SaveTeamRoom: %v", err)
	}
	run, err := app.SaveTeamRun(WorkbenchTeamRunView{TeamID: room.ID, Title: "测试团队运行", Status: "running", Task: "验证团队运行持久化"})
	if err != nil {
		t.Fatalf("SaveTeamRun: %v", err)
	}
	if run.ID == "" || len(run.Events) == 0 {
		t.Fatalf("SaveTeamRun did not create a durable run event: %+v", run)
	}

	jobs, err := app.RunWorkbenchSync("工作台数据")
	if err != nil {
		t.Fatalf("RunWorkbenchSync: %v", err)
	}
	if len(jobs) == 0 || jobs[0].Title != "工作台数据" || jobs[0].Progress != "100%" {
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

	if _, err := app.SaveWorkbenchReport(WorkbenchReportInput{Title: "待审批导出报告", Body: "导出前必须完成审批"}); err != nil {
		t.Fatalf("SaveWorkbenchReport: %v", err)
	}
	if _, err := app.ExportWorkbenchReports(); err == nil {
		t.Fatal("ExportWorkbenchReports should reject unapproved reports")
	}
	reports, err := app.ListWorkbenchReports()
	if err != nil {
		t.Fatalf("ListWorkbenchReports: %v", err)
	}
	for _, report := range reports {
		if _, err := app.ReviewWorkbenchReport(report.ID, "submit", "测试审批人", "提交导出审批"); err != nil {
			t.Fatalf("submit report %s: %v", report.ID, err)
		}
		if _, err := app.ReviewWorkbenchReport(report.ID, "approve", "测试审批人", "允许导出"); err != nil {
			t.Fatalf("approve report %s: %v", report.ID, err)
		}
	}
	reportPath, err := app.ExportWorkbenchReports()
	if err != nil {
		t.Fatalf("ExportWorkbenchReports after approval: %v", err)
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

func TestDeleteCustomerNotFoundDoesNotWriteSuccessLog(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	before, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatal(err)
	}
	if err := app.DeleteCustomer("missing-customer"); err == nil {
		t.Fatal("DeleteCustomer should report not found")
	}
	after, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatal(err)
	}
	if len(after.OperationLogs) != len(before.OperationLogs) {
		t.Fatalf("not-found delete wrote a success log: %+v", after.OperationLogs)
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
	if _, err := app.ReviewWorkbenchReport(updated.ID, "submit", "测试审批人", "请审批"); err != nil {
		t.Fatalf("submit report: %v", err)
	}
	if _, err := app.ReviewWorkbenchReport(updated.ID, "approve", "测试审批人", "允许导出"); err != nil {
		t.Fatalf("approve report: %v", err)
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

func TestWorkbenchReportReviewStateTransitionsPersist(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	report, err := app.SaveWorkbenchReport(WorkbenchReportInput{Title: "审批状态流转", Body: "初始正文", ArtifactStyleID: "brief-v1"})
	if err != nil {
		t.Fatalf("SaveWorkbenchReport: %v", err)
	}
	if report.ReviewStatus != reportReviewStatusDraft || report.ReviewStage != reportReviewStageDesign || report.StyleApproved {
		t.Fatalf("new report should start as design draft: %+v", report)
	}
	if _, err := app.ReviewWorkbenchReport(report.ID, "approve", "审批人", "跳过提交"); err == nil {
		t.Fatal("approve should reject draft reports")
	}
	submitted, err := app.ReviewWorkbenchReport(report.ID, "submit", "提交人", "请审核设计")
	if err != nil {
		t.Fatalf("submit: %v", err)
	}
	if submitted.ReviewStatus != reportReviewStatusSubmitted || submitted.ReviewStage != reportReviewStageDesign || submitted.StyleApproved {
		t.Fatalf("unexpected submitted report: %+v", submitted)
	}
	approved, err := app.ReviewWorkbenchReport(report.ID, "approve", "审批人", "设计通过，可导出")
	if err != nil {
		t.Fatalf("approve: %v", err)
	}
	if !reportHasExportApproval(approved) || approved.ReviewedBy != "审批人" || approved.ReviewedAt == "" {
		t.Fatalf("unexpected approved report: %+v", approved)
	}
	reloaded, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatalf("ListWorkbenchData: %v", err)
	}
	for _, item := range reloaded.Reports {
		if item.ID == report.ID && item.ReviewStatus == reportReviewStatusApproved && item.ReviewComment == "设计通过，可导出" {
			return
		}
	}
	t.Fatalf("reviewed report was not persisted: %+v", reloaded.Reports)
}

func TestWorkbenchReportSaveInvalidatesExportApproval(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	input := WorkbenchReportInput{
		Title:           "审批失效",
		Status:          "已生成",
		Owner:           "测试负责人",
		Desc:            "初始摘要",
		Body:            "初始正文",
		Kind:            "风险报告",
		ProjectID:       "volt-gui",
		CustomerID:      "internal",
		Source:          "manual",
		Format:          "Markdown",
		Priority:        "高",
		DueAt:           "2026-07-31",
		ArtifactStyleID: "brief-v1",
	}
	report, err := app.SaveWorkbenchReport(input)
	if err != nil {
		t.Fatalf("SaveWorkbenchReport: %v", err)
	}
	approveReportForExport(t, app, report.ID)

	input.ID = report.ID
	unchanged, err := app.SaveWorkbenchReport(input)
	if err != nil {
		t.Fatalf("SaveWorkbenchReport unchanged: %v", err)
	}
	if !reportHasExportApproval(unchanged) {
		t.Fatalf("unchanged report should keep approval: %+v", unchanged)
	}

	changes := []struct {
		name  string
		apply func(*WorkbenchReportInput)
	}{
		{name: "title", apply: func(next *WorkbenchReportInput) { next.Title = "审批失效（更新）" }},
		{name: "summary", apply: func(next *WorkbenchReportInput) { next.Desc = "更新摘要" }},
		{name: "body", apply: func(next *WorkbenchReportInput) { next.Body = "更新正文" }},
		{name: "format", apply: func(next *WorkbenchReportInput) { next.Format = "HTML" }},
		{name: "style", apply: func(next *WorkbenchReportInput) { next.ArtifactStyleID = "brief-v2" }},
	}
	for _, change := range changes {
		t.Run(change.name, func(t *testing.T) {
			nextInput := input
			change.apply(&nextInput)
			changed, err := app.SaveWorkbenchReport(nextInput)
			if err != nil {
				t.Fatalf("SaveWorkbenchReport %s change: %v", change.name, err)
			}
			if changed.ReviewStatus != reportReviewStatusDraft || changed.StyleApproved || changed.ReviewedBy != "" {
				t.Fatalf("%s change should invalidate approval: %+v", change.name, changed)
			}
			if _, err := app.ExportWorkbenchReport(report.ID); err == nil || !strings.Contains(err.Error(), "not approved") {
				t.Fatalf("%s change should block export: %v", change.name, err)
			}
			input = nextInput
			approveReportForExport(t, app, report.ID)
		})
	}
}

func TestWorkbenchReportExportRequiresApproval(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	report, err := app.SaveWorkbenchReport(WorkbenchReportInput{Title: "导出门禁", Body: "待导出正文"})
	if err != nil {
		t.Fatalf("SaveWorkbenchReport: %v", err)
	}
	if _, err := app.ExportWorkbenchReport(report.ID); err == nil || !strings.Contains(err.Error(), "not approved") {
		t.Fatalf("single export should reject unapproved report: %v", err)
	}
	approveReportForExport(t, app, report.ID)
	path, err := app.ExportWorkbenchReport(report.ID)
	if err != nil {
		t.Fatalf("ExportWorkbenchReport after approval: %v", err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("approved report export was not written: %v", err)
	}
}

func approveReportForExport(t *testing.T, app *App, id string) {
	t.Helper()
	if _, err := app.ReviewWorkbenchReport(id, "submit", "测试审批人", "提交审批"); err != nil {
		t.Fatalf("submit report %s: %v", id, err)
	}
	if _, err := app.ReviewWorkbenchReport(id, "approve", "测试审批人", "允许导出"); err != nil {
		t.Fatalf("approve report %s: %v", id, err)
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

func TestWorkbenchDeletesCalendarTeamRunAndMessage(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	event, err := app.SaveCalendarEvent(WorkbenchCalendarEventInput{Title: "待删除日程"})
	if err != nil {
		t.Fatalf("SaveCalendarEvent: %v", err)
	}
	room, err := app.SaveTeamRoom(WorkbenchTeamRoomView{Title: "待删除团队"})
	if err != nil {
		t.Fatalf("SaveTeamRoom: %v", err)
	}
	run, err := app.SaveTeamRun(WorkbenchTeamRunView{TeamID: room.ID, Title: "待删除运行"})
	if err != nil {
		t.Fatalf("SaveTeamRun: %v", err)
	}
	message, err := app.SaveTeamChatMessage(WorkbenchTeamChatMessageView{TeamID: room.ID, Content: "待删除消息"})
	if err != nil {
		t.Fatalf("SaveTeamChatMessage: %v", err)
	}
	if err := app.DeleteCalendarEvent(event.ID); err != nil {
		t.Fatalf("DeleteCalendarEvent: %v", err)
	}
	if err := app.DeleteTeamRun(run.ID); err != nil {
		t.Fatalf("DeleteTeamRun: %v", err)
	}
	if err := app.DeleteTeamChatMessage(message.ID); err != nil {
		t.Fatalf("DeleteTeamChatMessage: %v", err)
	}
	if err := app.DeleteTeamRoom(room.ID); err != nil {
		t.Fatalf("DeleteTeamRoom: %v", err)
	}
	data, err := app.ListWorkbenchData()
	if err != nil {
		t.Fatalf("ListWorkbenchData: %v", err)
	}
	if containsCalendarEvent(data.CalendarEvents, event.ID) || containsTeamRoom(data.TeamRooms, room.ID) || containsTeamRun(data.TeamRuns, run.ID) || containsTeamChatMessage(data.TeamChatMessages, message.ID) {
		t.Fatalf("deleted team/calendar records remain: %+v", data)
	}
}

func TestControlTeamRunPersistsValidatedStateTransitions(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	room, err := app.SaveTeamRoom(WorkbenchTeamRoomView{Title: "控制测试团队", Steps: []WorkbenchTeamRunStepView{{ID: "one", Title: "第一步"}, {ID: "two", Title: "第二步"}}})
	if err != nil {
		t.Fatalf("SaveTeamRoom: %v", err)
	}
	run, err := app.SaveTeamRun(WorkbenchTeamRunView{TeamID: room.ID, Title: "控制测试运行", Status: "draft", CurrentStepID: "one"})
	if err != nil {
		t.Fatalf("SaveTeamRun: %v", err)
	}
	for _, transition := range []struct{ action, want string }{{"start", "running"}, {"reassign", "running"}, {"pause", "paused"}, {"resume", "running"}, {"complete", "completed"}} {
		result, err := app.ControlTeamRun(run.ID, transition.action)
		if err != nil {
			t.Fatalf("ControlTeamRun(%s): %v", transition.action, err)
		}
		if result.Run.Status != transition.want || result.Room.ID != room.ID {
			t.Fatalf("ControlTeamRun(%s) = %+v", transition.action, result)
		}
		if transition.action == "reassign" && result.Run.CurrentStepID != "two" {
			t.Fatalf("reassign did not advance persisted step: %+v", result.Run)
		}
	}
	if _, err := app.ControlTeamRun(run.ID, "pause"); err == nil {
		t.Fatal("completed run should reject pause")
	}
}

func TestRunWorkbenchSyncRejectsUnknownScopeAndRecordsFailure(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	jobs, err := app.RunWorkbenchSync("不存在的同步")
	if err == nil || !strings.Contains(err.Error(), "unsupported sync scope") {
		t.Fatalf("RunWorkbenchSync error = %v, want unsupported", err)
	}
	if len(jobs) == 0 || jobs[0].Status != "失败" || jobs[0].Progress != "0%" {
		t.Fatalf("failed sync evidence missing: %+v", jobs)
	}
}

func TestRunWorkbenchSyncUsesExecutionSeamForSuccessAndFailure(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	original := runWorkbenchSyncScope
	defer func() { runWorkbenchSyncScope = original }()
	runWorkbenchSyncScope = func(_ *App, scope string) error {
		if scope == "失败范围" {
			return errors.New("real sync failed")
		}
		return nil
	}
	if _, err := app.RunWorkbenchSync("失败范围"); err == nil || !strings.Contains(err.Error(), "real sync failed") {
		t.Fatalf("failure seam error = %v", err)
	}
	jobs, err := app.RunWorkbenchSync("成功范围")
	if err != nil {
		t.Fatalf("success seam: %v", err)
	}
	if len(jobs) == 0 || jobs[0].Title != "成功范围" || jobs[0].Status != "已完成" {
		t.Fatalf("success seam evidence = %+v", jobs)
	}
}

func TestWorkbenchReportExportsMatchRequestedFormats(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	formats := []struct {
		format string
		ext    string
		magic  string
	}{
		{format: "Markdown", ext: ".md", magic: "# 中文报告"},
		{format: "HTML", ext: ".html", magic: "<meta charset=\"utf-8\">"},
		{format: "PDF", ext: ".pdf", magic: "%PDF-1.4"},
		{format: "DOCX", ext: ".docx", magic: "PK"},
		{format: "JSON", ext: ".json", magic: `"title": "中文报告`},
	}
	for _, tc := range formats {
		t.Run(tc.format, func(t *testing.T) {
			report, err := app.SaveWorkbenchReport(WorkbenchReportInput{Title: "中文报告 " + tc.format, Body: "第一段\n第二段", Format: tc.format})
			if err != nil {
				t.Fatalf("SaveWorkbenchReport: %v", err)
			}
			approveReportForExport(t, app, report.ID)
			path, err := app.ExportWorkbenchReport(report.ID)
			if err != nil {
				t.Fatalf("ExportWorkbenchReport: %v", err)
			}
			if filepath.Ext(path) != tc.ext {
				t.Fatalf("export extension = %q, want %q", filepath.Ext(path), tc.ext)
			}
			content, err := os.ReadFile(path)
			if err != nil {
				t.Fatalf("ReadFile: %v", err)
			}
			if !strings.Contains(string(content), tc.magic) {
				t.Fatalf("export %s missing format marker %q", path, tc.magic)
			}
			if tc.format == "PDF" && !strings.Contains(string(content), encodePDFUTF16Hex("中文报告 "+tc.format+"\n\n第一段\n第二段")) {
				t.Fatal("PDF does not contain UTF-16BE encoded Chinese report content")
			}
			if tc.format == "DOCX" {
				zr, err := zip.OpenReader(path)
				if err != nil {
					t.Fatalf("OpenReader: %v", err)
				}
				found := false
				for _, file := range zr.File {
					if file.Name == "word/document.xml" {
						found = true
					}
				}
				_ = zr.Close()
				if !found {
					t.Fatal("DOCX missing word/document.xml")
				}
			}
		})
	}
}

func TestKnowledgeTemplateContentPersistsIndexesAndRenders(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	doc, err := app.SaveKnowledgeDocument(WorkbenchKnowledgeDocumentInput{Title: "通知模板", Content: "尊敬的 {{name}}：{{message}}"})
	if err != nil {
		t.Fatalf("SaveKnowledgeDocument: %v", err)
	}
	rendered, err := app.RenderKnowledgeDocument(doc.ID, map[string]string{"name": "张三", "message": "测试完成"})
	if err != nil {
		t.Fatalf("RenderKnowledgeDocument: %v", err)
	}
	if rendered != "尊敬的 张三：测试完成" {
		t.Fatalf("rendered = %q", rendered)
	}
	results, err := app.SearchKnowledge("尊敬的", 5)
	if err != nil || len(results) == 0 {
		t.Fatalf("template content not indexed: results=%+v err=%v", results, err)
	}
}

func TestRegulationContentPersistsRendersAndDeletes(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}
	regulation, err := app.SaveRegulation(WorkbenchRegulationView{Title: "交付规范", Content: "项目 {{project}} 必须完成验证"})
	if err != nil {
		t.Fatalf("SaveRegulation: %v", err)
	}
	rendered, err := app.RenderRegulation(regulation.ID, map[string]string{"project": "Volt GUI"})
	if err != nil || rendered != "项目 Volt GUI 必须完成验证" {
		t.Fatalf("RenderRegulation = %q, err=%v", rendered, err)
	}
	items, err := app.ListRegulations()
	if err != nil || len(items) != 1 || items[0].Content == "" {
		t.Fatalf("ListRegulations = %+v, err=%v", items, err)
	}
	if err := app.DeleteRegulation(regulation.ID); err != nil {
		t.Fatalf("DeleteRegulation: %v", err)
	}
	items, err = app.ListRegulations()
	if err != nil || len(items) != 0 {
		t.Fatalf("regulation not deleted: %+v, err=%v", items, err)
	}
}

func TestLegacyWorkbenchSeedMigrationPersistsRemovalAndPreservesCustomizedID(t *testing.T) {
	isolateDesktopUserDirs(t)
	path, err := workbenchDataPath()
	if err != nil {
		t.Fatalf("workbenchDataPath: %v", err)
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatal(err)
	}
	const stamp = "2026-06-15T08:00:00Z"
	data := WorkbenchDataView{Customers: []WorkbenchCustomerView{
		{ID: "internal", Name: "内部研发团队", Type: "企业", Contact: "产品负责人", Phone: "internal", Email: "dev@example.com", Risk: "低风险", RiskLevel: "low", Status: "active", Owner: "产品工作台", Stage: "活跃", Industry: "研发", Region: "本地", Address: "局域网本地客户档案", Note: "围绕 Volt GUI 桌面端体验、代码质量和发布节奏维护长期项目上下文。", Desc: "Volt GUI 研发与验证主体。", ProjectIDs: []string{"volt-gui", "homepage"}, Matters: 2, Materials: 4, Events: 2, Todos: 5, Reports: 2, LastTouch: "刚刚", LastContact: "刚刚", NextAction: "继续验证工作台功能", Tags: []string{"内部", "研发"}, CreatedAt: stamp, UpdatedAt: stamp},
		{ID: "ops", Name: "用户自定义运营团队", Email: "owner@example.com", Desc: "真实数据"},
	}, Initialized: true}
	b, _ := json.Marshal(data)
	if err := os.WriteFile(path, b, 0o644); err != nil {
		t.Fatal(err)
	}
	loaded, err := loadWorkbenchData()
	if err != nil {
		t.Fatalf("loadWorkbenchData: %v", err)
	}
	if len(loaded.Customers) != 1 || loaded.Customers[0].Name != "用户自定义运营团队" {
		t.Fatalf("migration result = %+v", loaded.Customers)
	}
	persisted, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(persisted), "Volt GUI 研发与验证主体") {
		t.Fatalf("legacy seed was filtered but not removed from disk: %s", persisted)
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
