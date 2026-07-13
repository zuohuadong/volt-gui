package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLegacyRuntimeSeedsAreRemovedFromDiskWithoutDeletingCustomizedIDs(t *testing.T) {
	t.Run("agents", func(t *testing.T) {
		isolateDesktopUserDirs(t)
		path, _ := agentsPath()
		legacy := PersistentAgentView{ID: "code-review", Name: "代码审查 Agent", Role: "内置", Runs: 128, Status: "已启用", Desc: "阅读仓库上下文，发现风险、缺失测试和回归点。", Avatar: "C", Tools: []string{"workspace", "git", "terminal"}, Skills: []string{"code-review"}, CoreFiles: []string{"AGENTS.md"}, BuiltIn: true}
		custom := legacy
		custom.Name = "真实自定义 Agent"
		writeRuntimeMigrationFixture(t, path, agentsDiskFile{Agents: []PersistentAgentView{legacy, custom}})
		items, err := loadAgents()
		if err != nil || len(items) != 1 || items[0].ID != custom.ID {
			t.Fatalf("loadAgents = %+v, err=%v", items, err)
		}
		assertRuntimeMigrationPersisted(t, path, "代码审查 Agent", "真实自定义 Agent")
	})

	t.Run("todos", func(t *testing.T) {
		isolateDesktopUserDirs(t)
		path, _ := todosPath()
		legacy := WorkbenchTodoView{ID: "todo-preview-load", Title: "验证桌面预览加载状态", Description: "确认浏览器模式无需 Wails 绑定也能进入工作台", Source: "seed"}
		custom := legacy
		custom.Title = "用户自己的预览检查"
		custom.Source = "workbench"
		writeRuntimeMigrationFixture(t, path, todosDiskFile{Todos: []WorkbenchTodoView{legacy, custom}})
		items, err := loadTodos()
		if err != nil || len(items) != 1 || items[0].Title != custom.Title {
			t.Fatalf("loadTodos = %+v, err=%v", items, err)
		}
		assertRuntimeMigrationPersisted(t, path, "验证桌面预览加载状态", custom.Title)
	})

	t.Run("projects", func(t *testing.T) {
		isolateDesktopUserDirs(t)
		path, _ := workbenchProjectsPath()
		legacy := WorkbenchProjectView{ID: "volt-gui", Name: "Volt GUI 桌面端重构", Code: "PRJ-2026-0615", Desc: "恢复 AoristLawer 式导航、Agent 与能力中心，并把 Coding 模式统一到新建对话。"}
		custom := legacy
		custom.Name = "真实 Volt GUI 项目"
		writeRuntimeMigrationFixture(t, path, workbenchProjectsDiskFile{Projects: []WorkbenchProjectView{legacy, custom}})
		items, err := loadWorkbenchProjects()
		if err != nil || len(items) != 1 || items[0].Name != custom.Name {
			t.Fatalf("loadWorkbenchProjects = %+v, err=%v", items, err)
		}
		assertRuntimeMigrationPersisted(t, path, "Volt GUI 桌面端重构", custom.Name)
	})

	t.Run("materials", func(t *testing.T) {
		isolateDesktopUserDirs(t)
		path, _ := projectMaterialsPath()
		legacy := WorkbenchProjectMaterialView{ID: "volt-gui-relation-sample", ProjectID: "volt-gui", Title: "客户与项目关联样例", Desc: "用于验证项目详情与客户详情之间的跳转和任务关联。"}
		custom := legacy
		custom.Title = "真实客户关联资料"
		writeRuntimeMigrationFixture(t, path, workbenchProjectMaterialsDiskFile{Materials: []WorkbenchProjectMaterialView{legacy, custom}})
		items, err := loadProjectMaterials()
		if err != nil || len(items) != 1 || items[0].Title != custom.Title {
			t.Fatalf("loadProjectMaterials = %+v, err=%v", items, err)
		}
		assertRuntimeMigrationPersisted(t, path, "客户与项目关联样例", custom.Title)
	})

	t.Run("automations", func(t *testing.T) {
		isolateDesktopUserDirs(t)
		path, _ := automationsPath()
		legacy := WorkbenchAutomationView{ID: "desktop-frontend-gate", Title: "桌面前端质量门禁", Desc: "针对 desktop/frontend 执行 Svelte 类型检查、Vite 构建和差异空白检查。"}
		custom := legacy
		custom.Title = "真实质量门禁"
		writeRuntimeMigrationFixture(t, path, automationsDiskFile{Automations: []WorkbenchAutomationView{legacy, custom}})
		items, err := loadAutomations()
		if err != nil || len(items) != 1 || items[0].Title != custom.Title {
			t.Fatalf("loadAutomations = %+v, err=%v", items, err)
		}
		assertRuntimeMigrationPersisted(t, path, "桌面前端质量门禁", custom.Title)
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

func assertRuntimeMigrationPersisted(t *testing.T, path, removed, preserved string) {
	t.Helper()
	b, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(b), removed) || !strings.Contains(string(b), preserved) {
		t.Fatalf("migration was not durably persisted: %s", b)
	}
}
