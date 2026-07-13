package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"voltui/internal/config"
	"voltui/internal/fileutil"
)

const todosFile = "todos.json"

type WorkbenchTodoView struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	ProjectID    string `json:"projectId,omitempty"`
	ProjectName  string `json:"projectName,omitempty"`
	CustomerID   string `json:"customerId,omitempty"`
	CustomerName string `json:"customerName,omitempty"`
	AgentID      string `json:"agentId,omitempty"`
	AgentName    string `json:"agentName,omitempty"`
	Model        string `json:"model,omitempty"`
	Priority     string `json:"priority"`
	DueAt        string `json:"dueAt,omitempty"`
	DueLabel     string `json:"dueLabel"`
	Status       string `json:"status"`
	Source       string `json:"source,omitempty"`
	CreatedAt    string `json:"createdAt"`
	UpdatedAt    string `json:"updatedAt"`
	CompletedAt  string `json:"completedAt,omitempty"`
}

type WorkbenchTodoInput struct {
	ID           string `json:"id"`
	Title        string `json:"title"`
	Description  string `json:"description"`
	ProjectID    string `json:"projectId"`
	ProjectName  string `json:"projectName"`
	CustomerID   string `json:"customerId"`
	CustomerName string `json:"customerName"`
	AgentID      string `json:"agentId"`
	AgentName    string `json:"agentName"`
	Model        string `json:"model"`
	Priority     string `json:"priority"`
	DueAt        string `json:"dueAt"`
	DueLabel     string `json:"dueLabel"`
	Status       string `json:"status"`
	Source       string `json:"source"`
}

type todosDiskFile struct {
	Todos []WorkbenchTodoView `json:"todos"`
}

func (a *App) ListTodos() ([]WorkbenchTodoView, error) {
	todos, err := loadTodos()
	if err != nil {
		return nil, err
	}
	return todos, nil
}

func (a *App) SaveTodo(input WorkbenchTodoInput) (WorkbenchTodoView, error) {
	title := strings.TrimSpace(input.Title)
	if title == "" {
		return WorkbenchTodoView{}, errors.New("todo title is required")
	}
	todos, err := loadTodos()
	if err != nil {
		return WorkbenchTodoView{}, err
	}
	now := time.Now().Format(time.RFC3339)
	id := strings.TrimSpace(input.ID)
	if id == "" {
		id = uniqueTodoID(slugifyAgentID(title), todos)
	}
	status := normalizeTodoStatus(input.Status)
	next := WorkbenchTodoView{
		ID:           id,
		Title:        title,
		Description:  strings.TrimSpace(input.Description),
		ProjectID:    strings.TrimSpace(input.ProjectID),
		ProjectName:  strings.TrimSpace(input.ProjectName),
		CustomerID:   strings.TrimSpace(input.CustomerID),
		CustomerName: strings.TrimSpace(input.CustomerName),
		AgentID:      strings.TrimSpace(input.AgentID),
		AgentName:    strings.TrimSpace(input.AgentName),
		Model:        strings.TrimSpace(input.Model),
		Priority:     normalizeTodoPriority(input.Priority),
		DueAt:        strings.TrimSpace(input.DueAt),
		DueLabel:     strings.TrimSpace(input.DueLabel),
		Status:       status,
		Source:       defaultString(strings.TrimSpace(input.Source), "workbench"),
		CreatedAt:    now,
		UpdatedAt:    now,
	}
	replaced := false
	for i, existing := range todos {
		if existing.ID != id {
			continue
		}
		next.CreatedAt = defaultString(existing.CreatedAt, now)
		if status == "done" {
			next.CompletedAt = defaultString(existing.CompletedAt, now)
		} else {
			next.CompletedAt = ""
		}
		todos[i] = next
		replaced = true
		break
	}
	if !replaced {
		todos = append([]WorkbenchTodoView{next}, todos...)
	}
	sortTodos(todos)
	if err := saveTodos(todos); err != nil {
		return WorkbenchTodoView{}, err
	}
	return next, nil
}

func (a *App) DeleteTodo(id string) error {
	id = strings.TrimSpace(id)
	if id == "" {
		return errors.New("todo id is required")
	}
	todos, err := loadTodos()
	if err != nil {
		return err
	}
	next := todos[:0]
	for _, todo := range todos {
		if todo.ID == id {
			continue
		}
		next = append(next, todo)
	}
	return saveTodos(next)
}

func todosPath() (string, error) {
	userConfig := config.UserConfigPath()
	if strings.TrimSpace(userConfig) == "" {
		return "", errors.New("user config dir is unavailable")
	}
	return filepath.Join(filepath.Dir(userConfig), todosFile), nil
}

func loadTodos() ([]WorkbenchTodoView, error) {
	path, err := todosPath()
	if err != nil {
		return []WorkbenchTodoView{}, nil
	}
	b, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return []WorkbenchTodoView{}, nil
		}
		return nil, err
	}
	var disk todosDiskFile
	if err := json.Unmarshal(b, &disk); err != nil {
		return nil, err
	}
	todos := make([]WorkbenchTodoView, 0, len(disk.Todos))
	migrated := false
	for _, todo := range disk.Todos {
		if isLegacySeedTodo(todo) {
			migrated = true
			continue
		}
		todo = normalizeTodo(todo)
		if todo.ID != "" {
			todos = append(todos, todo)
		}
	}
	sortTodos(todos)
	if migrated {
		if err := saveTodos(todos); err != nil {
			return nil, err
		}
	}
	return todos, nil
}

func saveTodos(todos []WorkbenchTodoView) error {
	path, err := todosPath()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	b, err := json.MarshalIndent(todosDiskFile{Todos: todos}, "", "  ")
	if err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".todos.*.tmp")
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

func isLegacySeedTodo(todo WorkbenchTodoView) bool {
	// runtime-mock-guard: allow-legacy-cleanup
	if strings.TrimSpace(todo.Source) != "seed" {
		return false
	}
	switch strings.TrimSpace(todo.ID) {
	// runtime-mock-guard: allow-legacy-cleanup
	case "todo-preview-load":
		// runtime-mock-guard: allow-legacy-cleanup
		return todo.Title == "验证桌面预览加载状态" && todo.Description == "确认浏览器模式无需 Wails 绑定也能进入工作台"
	// runtime-mock-guard: allow-legacy-cleanup
	case "todo-agent-template":
		// runtime-mock-guard: allow-legacy-cleanup
		return todo.Title == "整理 Agent 创建模板" && todo.Description == "补齐工具、技能、核心文件与模型配置"
	// runtime-mock-guard: allow-legacy-cleanup
	case "todo-link-review":
		// runtime-mock-guard: allow-legacy-cleanup
		return todo.Title == "复核项目与客户关联" && todo.Description == "检查新建对话中的关联入口"
	default:
		return false
	}
}

func normalizeTodo(todo WorkbenchTodoView) WorkbenchTodoView {
	todo.ID = strings.TrimSpace(todo.ID)
	todo.Title = strings.TrimSpace(todo.Title)
	if todo.Title == "" {
		return WorkbenchTodoView{}
	}
	if todo.ID == "" {
		todo.ID = slugifyAgentID(todo.Title)
	}
	todo.Description = strings.TrimSpace(todo.Description)
	todo.Priority = normalizeTodoPriority(todo.Priority)
	todo.Status = normalizeTodoStatus(todo.Status)
	todo.DueAt = strings.TrimSpace(todo.DueAt)
	todo.DueLabel = strings.TrimSpace(todo.DueLabel)
	todo.Source = defaultString(strings.TrimSpace(todo.Source), "workbench")
	now := time.Now().Format(time.RFC3339)
	todo.CreatedAt = defaultString(todo.CreatedAt, now)
	todo.UpdatedAt = defaultString(todo.UpdatedAt, todo.CreatedAt)
	if todo.Status != "done" {
		todo.CompletedAt = ""
	}
	return todo
}

func normalizeTodoPriority(value string) string {
	switch strings.TrimSpace(value) {
	case "高", "high":
		return "高"
	case "低", "low":
		return "低"
	default:
		return "中"
	}
}

func normalizeTodoStatus(value string) string {
	switch strings.TrimSpace(value) {
	case "done", "completed", "已完成":
		return "done"
	case "in_progress", "进行中":
		return "in_progress"
	case "blocked", "阻塞":
		return "blocked"
	default:
		return "pending"
	}
}

func sortTodos(todos []WorkbenchTodoView) {
	sort.SliceStable(todos, func(i, j int) bool {
		return todos[i].UpdatedAt > todos[j].UpdatedAt
	})
}

func uniqueTodoID(base string, todos []WorkbenchTodoView) string {
	base = defaultString(strings.TrimSpace(base), "todo")
	seen := map[string]struct{}{}
	for _, todo := range todos {
		seen[todo.ID] = struct{}{}
	}
	if _, ok := seen[base]; !ok {
		return base
	}
	for i := 2; ; i++ {
		id := fmt.Sprintf("%s-%d", base, i)
		if _, ok := seen[id]; !ok {
			return id
		}
	}
}
