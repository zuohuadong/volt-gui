package planmode

import (
	"encoding/json"
	"fmt"
)

// Marker describes a planning workflow, not a second authorization system. A
// tool call made while planning still goes through the ordinary Permissions and
// Sandbox gates; the model is responsible for waiting for plan approval before
// beginning implementation.
const Marker = "[Plan mode — planning workflow. Do not begin implementation until the user approves the plan. This workflow instruction is not a permission boundary: every tool call still goes through the ordinary Permissions and Sandbox checks. You may research the codebase and web, ask clarifying questions with ask, maintain planning state with todo_write, and delegate focused research. Before planning, if a decision that is genuinely the user's — tech stack, an ambiguous requirement, scope, or an irreversible choice — would materially shape the plan and cannot be settled from the codebase or a sensible default, use ask to clarify it; otherwise state the assumption in the plan. Present a LAYERED plan as a two-level markdown list: each phase is a top-level numbered item and its concrete, verifiable sub-steps are indented bullets. Keep phases few (about 2-6), then stop so the user can approve the plan before the workflow switches to implementation.]"

// PlanSafety is a tool's explicit planning-phase stance. It is separate from
// ReadOnly: permissions decide whether an operation may run, while this value
// only lets a tool opt out because it belongs to a later workflow phase.
type PlanSafety int

const (
	PlanSafetyUnknown PlanSafety = iota
	PlanSafetySafe
	PlanSafetyUnsafe
)

// Call is the planning-workflow view of one tool invocation. ReadOnly,
// Untrusted, and Args remain in the compatibility surface because callers and
// plugins may still populate them; authorization is handled downstream.
type Call struct {
	Name      string
	ReadOnly  bool
	Untrusted bool
	Safety    PlanSafety
	Args      json.RawMessage
}

type Decision struct {
	Blocked              bool
	Message              string
	ReadOnlyCommandTrust *ReadOnlyCommandTrust
}

// ReadOnlyCommandTrust is retained for source compatibility with older hosts.
// The planning workflow no longer emits this legacy approval request.
type ReadOnlyCommandTrust struct {
	Command string
	Prefix  string
}

// Policy retains the old configuration fields so older callers continue to
// compile. They no longer authorize or deny calls; Permissions and Sandbox own
// that decision.
type Policy struct {
	AllowedTools        []string
	ReadOnlyCommands    []string
	BlockHostAutomation bool
}

// Decide blocks only an explicit planning-phase opt-out. All ordinary tools,
// including writers and shell commands, continue to the normal authorization
// and sandbox path.
func (Policy) Decide(call Call) Decision {
	if call.Safety != PlanSafetyUnsafe {
		return Decision{}
	}
	if call.Name == "complete_step" {
		return Decision{
			Blocked: true,
			Message: "blocked: complete_step is only available after plan approval. Keep planning state with todo_write and present the plan for approval.",
		}
	}
	return Decision{
		Blocked: true,
		Message: fmt.Sprintf("blocked: %q is unavailable during the planning workflow and is only available after plan approval", call.Name),
	}
}

// IgnoredAllowedTools and IgnoredReadOnlyCommands are compatibility diagnostics.
// The legacy overrides are now inert, so there is nothing unsafe to report as
// selectively ignored.
func (Policy) IgnoredAllowedTools() []string     { return nil }
func (Policy) IgnoredReadOnlyCommands() []string { return nil }
