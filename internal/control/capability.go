package control

import (
	"strings"

	"voltui/internal/agent"
	"voltui/internal/capability"
)

func (c *Controller) withCapabilityRoute(composed, routeInput string) string {
	if c == nil {
		return composed
	}
	routeInput = strings.TrimSpace(agent.StripTransientUserBlocks(routeInput))
	if routeInput == "" {
		routeInput = strings.TrimSpace(agent.StripTransientUserBlocks(composed))
	}
	if routeInput == "" {
		return composed
	}
	tools := c.ToolContractEntries()
	entries := capability.ToolEntries(tools)
	planMode := c.PlanMode()
	entries = append(entries, capability.SkillEntriesForMode(c.Skills(), tools, planMode)...)
	decision := capability.Route(routeInput, entries)
	if _, ok := capability.AutoEnableBuiltinSkillCandidate(decision); ok {
		autoEnable := c.autoEnableBuiltinSkills
		if planMode {
			autoEnable = c.autoEnableReadOnlyBuiltinSkills
		}
		if autoEnable != nil {
			autoEnable()
			tools = c.ToolContractEntries()
			entries = capability.ToolEntries(tools)
			entries = append(entries, capability.SkillEntriesForMode(c.Skills(), tools, planMode)...)
			decision = capability.Route(routeInput, entries)
		}
	}
	block := capability.RenderTransientBlock(decision)
	if block == "" {
		return composed
	}
	return block + "\n\n" + composed
}
