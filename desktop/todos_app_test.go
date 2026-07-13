package main

import "testing"

func TestSaveTodoPersistsWorkbenchTodo(t *testing.T) {
	isolateDesktopUserDirs(t)
	app := &App{}

	initial, err := app.ListTodos()
	if err != nil {
		t.Fatalf("ListTodos initial: %v", err)
	}
	if len(initial) != 0 {
		t.Fatalf("ListTodos initial seeded runtime data: %+v", initial)
	}

	saved, err := app.SaveTodo(WorkbenchTodoInput{
		Title:        "跟进客户反馈",
		Description:  "确认页面样式验收意见。",
		ProjectID:    "homepage",
		ProjectName:  "品牌主页恢复与部署",
		CustomerID:   "internal",
		CustomerName: "内部研发团队",
		AgentID:      "code-review",
		AgentName:    "代码审查 Agent",
		Model:        "agnes/agnes-2.0-flash",
		Priority:     "高",
		DueLabel:     "今天 18:00",
		Status:       "待处理",
	})
	if err != nil {
		t.Fatalf("SaveTodo: %v", err)
	}
	if saved.ID == "" {
		t.Fatal("SaveTodo returned empty id")
	}
	if saved.Status != "pending" {
		t.Fatalf("Status = %q, want pending", saved.Status)
	}
	if saved.Priority != "高" || saved.ProjectID != "homepage" || saved.CustomerID != "internal" {
		t.Fatalf("saved todo did not preserve structured fields: %+v", saved)
	}

	optional, err := app.SaveTodo(WorkbenchTodoInput{
		Title:    "Optional fields todo",
		Priority: "medium",
		Status:   "pending",
	})
	if err != nil {
		t.Fatalf("SaveTodo optional fields: %v", err)
	}
	if optional.ProjectID != "" || optional.ProjectName != "" || optional.CustomerID != "" || optional.CustomerName != "" {
		t.Fatalf("optional relation fields should stay empty: %+v", optional)
	}
	if optional.DueAt != "" || optional.DueLabel != "" {
		t.Fatalf("optional due fields should stay empty: %+v", optional)
	}

	reloaded, err := loadTodos()
	if err != nil {
		t.Fatalf("loadTodos: %v", err)
	}
	if len(reloaded) == 0 {
		t.Fatalf("saved todos not persisted: %+v", reloaded)
	}
	foundSaved := false
	foundOptional := false
	for _, todo := range reloaded {
		if todo.ID == saved.ID {
			foundSaved = true
			if todo.ProjectID != "homepage" || todo.CustomerID != "internal" || todo.Priority != "高" {
				t.Fatalf("reloaded saved todo lost structured fields: %+v", todo)
			}
		}
		if todo.ID == optional.ID {
			foundOptional = true
		}
	}
	if !foundSaved || !foundOptional {
		t.Fatalf("saved todos not persisted: foundSaved=%v foundOptional=%v todos=%+v", foundSaved, foundOptional, reloaded)
	}

	if err := app.DeleteTodo(saved.ID); err != nil {
		t.Fatalf("DeleteTodo: %v", err)
	}
	if err := app.DeleteTodo(optional.ID); err != nil {
		t.Fatalf("DeleteTodo optional: %v", err)
	}
	afterDelete, err := app.ListTodos()
	if err != nil {
		t.Fatalf("ListTodos after delete: %v", err)
	}
	for _, todo := range afterDelete {
		if todo.ID == saved.ID {
			t.Fatalf("deleted todo still present: %+v", todo)
		}
	}
}
