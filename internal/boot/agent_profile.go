package boot

import "strings"

// AgentProfile is a session-scoped runtime overlay supplied by rich clients
// such as the desktop. Empty fields inherit the project/user configuration.
type AgentProfile struct {
	ID           string
	Name         string
	SystemPrompt string
	ToolIDs      []string
	SkillNames   []string
}

func applyAgentProfilePrompt(base string, profile *AgentProfile) string {
	if profile == nil || strings.TrimSpace(profile.SystemPrompt) == "" {
		return base
	}
	name := strings.TrimSpace(profile.Name)
	if name == "" {
		name = strings.TrimSpace(profile.ID)
	}
	if name == "" {
		name = "Selected profile"
	}
	return strings.TrimSpace(base) + "\n\n# Agent Profile: " + name + "\n\n" + strings.TrimSpace(profile.SystemPrompt)
}

func agentProfileSkillNames(profile *AgentProfile) []string {
	if profile == nil || len(profile.SkillNames) == 0 {
		return nil
	}
	seen := map[string]bool{}
	out := make([]string, 0, len(profile.SkillNames))
	for _, name := range profile.SkillNames {
		name = strings.TrimSpace(name)
		key := strings.ToLower(name)
		if name == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, name)
	}
	return out
}

func agentProfileToolAllowPolicy(profile *AgentProfile) func(string) bool {
	if profile == nil || len(profile.ToolIDs) == 0 {
		return nil
	}
	exact := map[string]bool{}
	groups := map[string]bool{}
	for _, raw := range profile.ToolIDs {
		name := strings.TrimSpace(raw)
		if name == "" {
			continue
		}
		key := strings.ToLower(name)
		switch key {
		case "file", "files", "workspace", "git", "文件", "文件系统", "工作区", "代码", "本地文件与资料":
			groups["files"] = true
		case "terminal", "shell", "终端", "命令行", "终端执行":
			groups["terminal"] = true
		case "browser", "web", "浏览器", "网页", "浏览器预览":
			groups["browser"] = true
		case "memory", "memories", "记忆", "知识库", "长期记忆":
			groups["memory"] = true
		case "automation", "scheduler", "自动化", "自动化管理", "计划任务":
			groups["automation"] = true
		default:
			exact[name] = true
			exact[key] = true
		}
	}
	if len(exact) == 0 && len(groups) == 0 {
		return nil
	}
	core := map[string]bool{
		"ask":                 true,
		"calculate":           true,
		"complete_step":       true,
		"todo_write":          true,
		"slash_command":       true,
		"run_skill":           true,
		"read_skill":          true,
		"read_only_skill":     true,
		"connect_tool_source": true,
	}
	fileTools := map[string]bool{
		"read_file": true, "write_file": true, "edit_file": true,
		"multi_edit": true, "move_file": true, "delete_range": true,
		"delete_symbol": true, "notebook_edit": true, "ls": true,
		"glob": true, "grep": true, "code_index": true,
	}
	terminalTools := map[string]bool{"bash": true, "bash_output": true, "kill_shell": true, "wait": true}
	browserTools := map[string]bool{"browser_control": true, "browser_navigate": true, "web_fetch": true}
	memoryTools := map[string]bool{"memory": true, "remember": true, "forget": true}
	automationTools := map[string]bool{
		"automation_list": true, "automation_save": true,
		"automation_delete": true, "automation_run_now": true,
	}
	return func(name string) bool {
		trimmed := strings.TrimSpace(name)
		key := strings.ToLower(trimmed)
		if core[key] || exact[trimmed] || exact[key] {
			return true
		}
		return (groups["files"] && fileTools[key]) ||
			(groups["terminal"] && terminalTools[key]) ||
			(groups["browser"] && browserTools[key]) ||
			(groups["memory"] && memoryTools[key]) ||
			(groups["automation"] && automationTools[key])
	}
}
