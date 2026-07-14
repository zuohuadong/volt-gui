package boot

import (
	"context"
	"strings"
	"testing"
)

func TestBuildAppliesAgentProfilePromptAndSkillAllowlist(t *testing.T) {
	dir := robustTempDir(t)
	t.Chdir(dir)
	writeFile(t, dir, "voltui.toml", `
default_model = "test-model"

[agent]
system_prompt = "BASE SYSTEM"

[[providers]]
name = "test-model"
kind = "openai"
base_url = "https://example.invalid"
model = "x"
api_key_env = "AGENT_PROFILE_TEST_KEY_UNSET"
`)
	writeFile(t, dir, ".voltui/skills/alpha/SKILL.md", "---\ndescription: alpha\n---\nalpha body")
	writeFile(t, dir, ".voltui/skills/beta/SKILL.md", "---\ndescription: beta\n---\nbeta body")

	ctrl, err := Build(context.Background(), Options{AgentProfile: &AgentProfile{
		ID:           "reviewer",
		Name:         "Reviewer",
		SystemPrompt: "PROFILE SYSTEM",
		SkillNames:   []string{"alpha"},
	}})
	if err != nil {
		t.Fatalf("Build: %v", err)
	}
	defer ctrl.Close()
	if sys := systemMessage(ctrl.History()); !strings.Contains(sys, "PROFILE SYSTEM") {
		t.Fatalf("profile instructions missing from controller system prompt: %q", sys)
	}
	sk := ctrl.Skills()
	if len(sk) != 1 || sk[0].Name != "alpha" {
		t.Fatalf("controller skills = %+v, want only alpha", sk)
	}
}

func TestApplyAgentProfilePrompt(t *testing.T) {
	base := "base system prompt"
	profile := &AgentProfile{ID: "reviewer", Name: "Reviewer", SystemPrompt: "Focus on regression risks."}
	got := applyAgentProfilePrompt(base, profile)
	if !strings.HasPrefix(got, base) {
		t.Fatalf("profile prompt replaced base system prompt: %q", got)
	}
	if !strings.Contains(got, "Agent Profile: Reviewer") || !strings.Contains(got, profile.SystemPrompt) {
		t.Fatalf("profile prompt missing identity/instructions: %q", got)
	}
	if inherited := applyAgentProfilePrompt(base, &AgentProfile{}); inherited != base {
		t.Fatalf("empty profile changed prompt: %q", inherited)
	}
}

func TestAgentProfileToolPolicyGroupsAndCoreTools(t *testing.T) {
	policy := agentProfileToolAllowPolicy(&AgentProfile{ToolIDs: []string{"本地文件与资料", "浏览器预览", "custom_exact"}})
	if policy == nil {
		t.Fatal("non-empty tool profile should install an allow policy")
	}
	for _, name := range []string{"read_file", "edit_file", "browser_navigate", "web_fetch", "custom_exact", "ask", "complete_step", "run_skill", "connect_tool_source"} {
		if !policy(name) {
			t.Errorf("tool %q should be allowed", name)
		}
	}
	for _, name := range []string{"bash", "remember", "mcp__database__query"} {
		if policy(name) {
			t.Errorf("tool %q should be denied", name)
		}
	}
	if inherited := agentProfileToolAllowPolicy(&AgentProfile{}); inherited != nil {
		t.Fatal("empty tool list should inherit the full registry")
	}
}

func TestAgentProfileToolPolicyCoversTerminalAndMemoryAliases(t *testing.T) {
	policy := agentProfileToolAllowPolicy(&AgentProfile{ToolIDs: []string{"终端执行", "长期记忆"}})
	for _, name := range []string{"bash", "bash_output", "kill_shell", "wait", "memory", "remember", "forget"} {
		if !policy(name) {
			t.Errorf("tool %q should be allowed by terminal/memory groups", name)
		}
	}
	if policy("write_file") {
		t.Fatal("unselected files group should remain denied")
	}
}

func TestAgentProfileToolPolicyCoversAutomationAliases(t *testing.T) {
	policy := agentProfileToolAllowPolicy(&AgentProfile{ToolIDs: []string{"scheduler"}})
	for _, name := range []string{"automation_list", "automation_save", "automation_delete", "automation_run_now"} {
		if !policy(name) {
			t.Errorf("tool %q should be allowed by scheduler group", name)
		}
	}
	if policy("bash") {
		t.Fatal("unselected terminal group should remain denied")
	}
}
