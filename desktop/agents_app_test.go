package main

import "testing"

func TestFreshAgentStoreIsEmpty(t *testing.T) {
	isolateDesktopUserDirs(t)
	agents, err := loadAgents()
	if err != nil {
		t.Fatalf("loadAgents: %v", err)
	}
	if len(agents) != 0 {
		t.Fatalf("fresh agent store seeded runtime data: %+v", agents)
	}
}

func TestNormalizeAgentClearsLegacySeededMockModelOnly(t *testing.T) {
	seeded := normalizeAgent(PersistentAgentView{ID: "code-review", Provider: "OpenAI", Model: "GPT-4o"})
	if seeded.Provider != "" || seeded.Model != "" {
		t.Fatalf("legacy seeded agent kept provider/model %q/%q", seeded.Provider, seeded.Model)
	}

	custom := normalizeAgent(PersistentAgentView{ID: "custom-agent", Provider: "OpenAI", Model: "GPT-4o"})
	if custom.Provider != "OpenAI" || custom.Model != "GPT-4o" {
		t.Fatalf("custom agent provider/model = %q/%q, want preserved", custom.Provider, custom.Model)
	}
}
