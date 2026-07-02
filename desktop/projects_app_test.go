package main

import (
	"testing"
	"time"
)

func TestSaveWorkbenchProjectPersistsProject(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	initial, err := app.ListWorkbenchProjects()
	if err != nil {
		t.Fatalf("ListWorkbenchProjects initial: %v", err)
	}
	if len(initial) == 0 {
		t.Fatal("ListWorkbenchProjects initial returned no seed projects")
	}

	saved, err := app.SaveWorkbenchProject(WorkbenchProjectInput{
		Name:       "客户门户上线",
		Code:       "PRJ-2026-0702",
		Client:     "测试客户",
		Stage:      "进行中",
		Owner:      "交付团队",
		Desc:       "补齐真实项目保存流程。",
		Category:   "交付项目",
		Budget:     "120,000",
		AcceptedAt: "2026-07-02",
		Status:     "active",
		Progress:   35,
		Priority:   "高",
		Risk:       "中风险",
		NextStep:   "完成验收",
		Agent:      "代码审查 Agent",
		Timeline:   []string{"创建项目", "", "进入执行"},
	})
	if err != nil {
		t.Fatalf("SaveWorkbenchProject: %v", err)
	}
	if saved.ID == "" {
		t.Fatal("SaveWorkbenchProject returned empty id")
	}
	if saved.Status != "active" || saved.Priority != "高" || saved.Progress != 35 {
		t.Fatalf("saved project did not normalize expected fields: %+v", saved)
	}
	if len(saved.Timeline) != 2 {
		t.Fatalf("timeline should be trimmed: %+v", saved.Timeline)
	}

	reloaded, err := loadWorkbenchProjects()
	if err != nil {
		t.Fatalf("loadWorkbenchProjects: %v", err)
	}
	found := false
	for _, project := range reloaded {
		if project.ID == saved.ID {
			found = true
			if project.Name != "客户门户上线" || project.Client != "测试客户" {
				t.Fatalf("reloaded project lost fields: %+v", project)
			}
		}
	}
	if !found {
		t.Fatalf("saved project not persisted: %+v", reloaded)
	}

	updated, err := app.SaveWorkbenchProject(WorkbenchProjectInput{
		ID:       saved.ID,
		Name:     "客户门户上线",
		Client:   "测试客户",
		Status:   "closed",
		Progress: 120,
	})
	if err != nil {
		t.Fatalf("SaveWorkbenchProject update: %v", err)
	}
	if updated.Status != "closed" || updated.Progress != 100 {
		t.Fatalf("updated project normalization failed: %+v", updated)
	}

	if err := app.DeleteWorkbenchProject(saved.ID); err != nil {
		t.Fatalf("DeleteWorkbenchProject: %v", err)
	}
	afterDelete, err := app.ListWorkbenchProjects()
	if err != nil {
		t.Fatalf("ListWorkbenchProjects after delete: %v", err)
	}
	for _, project := range afterDelete {
		if project.ID == saved.ID {
			t.Fatalf("deleted project still present: %+v", project)
		}
	}
}

func TestNextWorkbenchProjectCodeIncrementsByDate(t *testing.T) {
	projects := []WorkbenchProjectView{
		{ID: "a", Name: "A", Code: "PRJ-2026-0615-01"},
		{ID: "b", Name: "B", Code: "PRJ-2026-0615-03"},
		{ID: "c", Name: "C", Code: "PRJ-2026-0614-09"},
	}
	got := nextWorkbenchProjectCode(projects, mustParseProjectTestDate(t, "2026-06-15"))
	if got != "PRJ-2026-0615-04" {
		t.Fatalf("nextWorkbenchProjectCode = %q, want PRJ-2026-0615-04", got)
	}
}

func mustParseProjectTestDate(t *testing.T, value string) time.Time {
	t.Helper()
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		t.Fatalf("parse test date: %v", err)
	}
	return parsed
}
