package agent

type untrustedReadOnlyTool struct {
	fakeTool
}

func (untrustedReadOnlyTool) PlanModeUntrustedReadOnly() bool { return true }
