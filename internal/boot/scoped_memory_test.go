package boot

import (
	"context"
	"strings"
	"testing"
)

func TestBuildInjectsScopedMemoryBlockBeforeAgentProfile(t *testing.T) {
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
api_key_env = "SCOPED_MEMORY_TEST_KEY_UNSET"
`)
	ctrl, err := Build(context.Background(), Options{
		ScopedMemoryBlock: "# Scoped Memory\n\nworkspace policy",
		AgentProfile:      &AgentProfile{Name: "Reviewer", SystemPrompt: "PROFILE SYSTEM"},
	})
	if err != nil {
		t.Fatal(err)
	}
	defer ctrl.Close()
	system := systemMessage(ctrl.History())
	memoryIndex := strings.Index(system, "workspace policy")
	profileIndex := strings.Index(system, "PROFILE SYSTEM")
	if memoryIndex < 0 || profileIndex < 0 || memoryIndex > profileIndex {
		t.Fatalf("system prompt order is wrong: %q", system)
	}
}
