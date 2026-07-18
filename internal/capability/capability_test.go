package capability

import (
	"strings"
	"testing"

	"voltui/internal/skill"
	"voltui/internal/tool"
)

func TestRoutePrefersReviewSkillForReviewRequest(t *testing.T) {
	entries := SkillEntries([]skill.Skill{{
		Name:        "review",
		Description: "review code for bugs",
		Scope:       skill.ScopeBuiltin,
	}}, []tool.ContractEntry{{Name: "run_skill"}})

	decision := Route("帮我看看这段代码有没有问题", entries)
	if len(decision.Candidates) == 0 {
		t.Fatal("Route returned no candidates")
	}
	got := decision.Candidates[0]
	if got.Entry.ID != "skill:review" || got.Policy != AutoUsePrefer {
		t.Fatalf("candidate = %+v, want review/prefer", got)
	}
}

func TestRouteRequiresExplicitSkill(t *testing.T) {
	entries := SkillEntries([]skill.Skill{{
		Name:        "audit",
		Description: "audit something",
		Scope:       skill.ScopeProject,
	}}, []tool.ContractEntry{{Name: "run_skill"}})

	decision := Route("请使用 audit skill 检查一下", entries)
	if len(decision.Candidates) == 0 {
		t.Fatal("Route returned no candidates")
	}
	if got := decision.Candidates[0].Policy; got != AutoUseRequire {
		t.Fatalf("policy = %s, want require", got)
	}
}

func TestRouteRespectsSkillAutoUseMetadata(t *testing.T) {
	entries := SkillEntries([]skill.Skill{
		{
			Name:        "quiet",
			Description: "quiet skill",
			Scope:       skill.ScopeProject,
			Triggers:    []string{"inspect"},
			AutoUse:     "off",
		},
		{
			Name:        "gentle",
			Description: "gentle skill",
			Scope:       skill.ScopeProject,
			Triggers:    []string{"inspect"},
			AutoUse:     "suggest",
		},
	}, []tool.ContractEntry{{Name: "run_skill"}})

	decision := Route("please inspect this", entries)
	if len(decision.Candidates) != 1 {
		t.Fatalf("candidates = %+v, want exactly the suggest skill", decision.Candidates)
	}
	if got := decision.Candidates[0]; got.Entry.ID != "skill:gentle" || got.Policy != AutoUseSuggest {
		t.Fatalf("candidate = %+v, want gentle/suggest", got)
	}
}

func TestSkillEntriesReadinessFollowsExecutionModeSurface(t *testing.T) {
	sk := []skill.Skill{{Name: "test", Scope: skill.ScopeBuiltin}}
	readOnlyTools := []tool.ContractEntry{{Name: "read_only_skill"}}

	if got := SkillEntriesForMode(sk, readOnlyTools, true)[0].Status; got != StatusReady {
		t.Fatalf("plan-mode status = %s, want ready", got)
	}
	if got := SkillEntriesForMode(sk, readOnlyTools, false)[0].Status; got != StatusConfigured {
		t.Fatalf("normal-mode status with only read_only_skill = %s, want configured", got)
	}
	if got := SkillEntriesForMode(sk, []tool.ContractEntry{{Name: "run_skill"}}, false)[0].Status; got != StatusReady {
		t.Fatalf("normal-mode status with run_skill = %s, want ready", got)
	}
}

func TestRoutePrefersGitHubMCPForIssueLookup(t *testing.T) {
	entries := ToolEntries([]tool.ContractEntry{{
		Name:        "mcp__github__search_issues",
		Description: "search GitHub issues",
		ReadOnly:    true,
	}})

	decision := Route("查一下 GitHub issue 里有没有相关反馈", entries)
	if len(decision.Candidates) == 0 {
		t.Fatal("Route returned no candidates")
	}
	got := decision.Candidates[0]
	if got.Entry.ID != "mcp-tool:github/search_issues" || got.Policy != AutoUsePrefer {
		t.Fatalf("candidate = %+v, want github mcp/prefer", got)
	}
}

func TestRenderTransientBlockMentionsConnectSource(t *testing.T) {
	decision := RouteDecision{Candidates: []RouteCandidate{{
		Entry: Entry{
			ID:            "skill:review",
			Kind:          KindSkill,
			Name:          "review",
			Status:        StatusConfigured,
			ConnectSource: "skills",
		},
		Policy: AutoUsePrefer,
		Reason: "matched",
	}}}

	block := RenderTransientBlock(decision)
	for _, want := range []string{`<capability-route version="1">`, `source:skills`, `connect_tool_source`} {
		if !strings.Contains(block, want) {
			t.Fatalf("block missing %q:\n%s", want, block)
		}
	}
}

func TestAutoEnableBuiltinSkillCandidateRequiresTrustedStrongConfiguredMatch(t *testing.T) {
	eligible := RouteCandidate{
		Entry: Entry{
			ID:     "skill:review",
			Kind:   KindSkill,
			Name:   "review",
			Source: string(skill.ScopeBuiltin),
			Status: StatusConfigured,
		},
		Policy: AutoUsePrefer,
	}
	if got, ok := AutoEnableBuiltinSkillCandidate(RouteDecision{Candidates: []RouteCandidate{eligible}}); !ok || got.Entry.Name != "review" {
		t.Fatalf("eligible candidate = %+v, ok=%v", got, ok)
	}

	for _, candidate := range []RouteCandidate{
		{Entry: eligible.Entry, Policy: AutoUseSuggest},
		{Entry: func() Entry { e := eligible.Entry; e.Source = string(skill.ScopeProject); return e }(), Policy: AutoUseRequire},
		{Entry: func() Entry { e := eligible.Entry; e.Status = StatusReady; return e }(), Policy: AutoUseRequire},
	} {
		if got, ok := AutoEnableBuiltinSkillCandidate(RouteDecision{Candidates: []RouteCandidate{candidate}}); ok {
			t.Fatalf("candidate should not auto-enable: %+v", got)
		}
	}
}
