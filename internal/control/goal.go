package control

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"unicode"
)

// GoalStatus is the lifecycle state for the controller's active long-running
// objective. The frontend treats it as data, while the controller owns the
// actual continuation loop.
type GoalStatus string

const (
	GoalStatusIdle     GoalStatus = "idle"
	GoalStatusActive   GoalStatus = "active"
	GoalStatusComplete GoalStatus = "complete"
	GoalStatusBlocked  GoalStatus = "blocked"
)

const maxGoalTurns = 25

type goalState struct {
	objective             string
	status                GoalStatus
	blockedReason         string
	normalizedBlockReason string
	blockedCount          int
}

type goalMarker struct {
	action string
	reason string
}

var goalMarkerRE = regexp.MustCompile(`(?is)\[goal\s*:\s*(continue|complete|blocked)\s*(?::\s*([^\]]*))?\]`)

// Goal returns the active objective text. Completed goals are cleared; blocked
// goals remain visible so the user can continue or clear them explicitly.
func (c *Controller) Goal() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.goal.objective
}

// GoalStatus returns the most recent goal lifecycle state.
func (c *Controller) GoalStatus() GoalStatus {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.goal.status == "" {
		return GoalStatusIdle
	}
	return c.goal.status
}

// GoalBlockedReason returns the user-facing blocker text from the latest blocked
// marker. It is empty unless the goal has encountered a blocker.
func (c *Controller) GoalBlockedReason() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.goal.blockedReason
}

// StartGoal replaces the active objective and starts the continuation loop.
func (c *Controller) StartGoal(objective string) {
	objective = strings.TrimSpace(objective)
	if objective == "" {
		c.notice(c.goalSummary())
		return
	}
	c.mu.Lock()
	c.goal = goalState{objective: objective, status: GoalStatusActive}
	c.mu.Unlock()
	c.SetPlanMode(false)
	c.notice("goal started: " + objective)
	c.runGuarded(func(ctx context.Context) error {
		return c.runGoal(ctx, "Start working toward the active goal.")
	})
}

// ContinueGoal resumes the current objective, resetting any blocked audit. A
// blocked goal needs three fresh matching blocker reports before it stops again.
func (c *Controller) ContinueGoal() {
	objective := c.Goal()
	if strings.TrimSpace(objective) == "" {
		c.notice("no active goal")
		return
	}
	c.mu.Lock()
	c.goal.status = GoalStatusActive
	c.goal.blockedCount = 0
	c.goal.blockedReason = ""
	c.goal.normalizedBlockReason = ""
	c.mu.Unlock()
	c.SetPlanMode(false)
	c.notice("goal continued: " + objective)
	c.runGuarded(func(ctx context.Context) error {
		return c.runGoal(ctx, "Continue working toward the active goal.")
	})
}

// ClearGoal discards the active objective without touching the conversation.
func (c *Controller) ClearGoal() {
	c.mu.Lock()
	c.goal = goalState{status: GoalStatusIdle}
	c.mu.Unlock()
	c.notice("goal cleared")
}

func (c *Controller) submitGoalCommand(trimmed string) {
	args := strings.TrimSpace(strings.TrimPrefix(trimmed, "/goal"))
	switch strings.ToLower(args) {
	case "":
		c.notice(c.goalSummary())
	case "continue", "resume":
		c.ContinueGoal()
	case "clear", "reset":
		c.ClearGoal()
	default:
		c.StartGoal(args)
	}
}

func (c *Controller) goalSummary() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	status := c.goal.status
	if status == "" {
		status = GoalStatusIdle
	}
	if strings.TrimSpace(c.goal.objective) == "" {
		return "goal: none"
	}
	if c.goal.blockedReason != "" {
		return fmt.Sprintf("goal: %s — %s (blocked: %s)", status, c.goal.objective, c.goal.blockedReason)
	}
	return fmt.Sprintf("goal: %s — %s", status, c.goal.objective)
}

func (c *Controller) runGoal(ctx context.Context, prompt string) error {
	for turn := 0; turn < maxGoalTurns; turn++ {
		objective := c.Goal()
		if strings.TrimSpace(objective) == "" {
			return nil
		}
		input := goalPrompt(objective, prompt)
		if err := c.runTurnWithRawOptions(ctx, input, objective, runTurnOptions{skipAutoPlan: true}); err != nil {
			return err
		}
		marker, ok := parseGoalMarker(lastAssistantText(c.History()))
		if !ok {
			c.setGoalActive()
			c.notice("goal paused: no goal marker found")
			return nil
		}
		switch marker.action {
		case "complete":
			c.markGoalComplete()
			return nil
		case "blocked":
			if c.recordGoalBlocked(marker.reason) {
				return nil
			}
			prompt = "Continue working toward the active goal. If still blocked for the same reason, report it again."
		default:
			c.setGoalActive()
			prompt = "Continue working toward the active goal."
		}
	}
	c.setGoalActive()
	c.notice(fmt.Sprintf("goal paused: reached %d continuation turns", maxGoalTurns))
	return nil
}

func goalPrompt(objective, prompt string) string {
	return "<active-goal>\n" + strings.TrimSpace(objective) + "\n</active-goal>\n\n" + prompt
}

func parseGoalMarker(text string) (goalMarker, bool) {
	match := goalMarkerRE.FindStringSubmatch(text)
	if len(match) == 0 {
		return goalMarker{}, false
	}
	return goalMarker{
		action: strings.ToLower(strings.TrimSpace(match[1])),
		reason: strings.TrimSpace(match[2]),
	}, true
}

func (c *Controller) setGoalActive() {
	c.mu.Lock()
	if c.goal.objective != "" {
		c.goal.status = GoalStatusActive
	}
	c.mu.Unlock()
}

func (c *Controller) markGoalComplete() {
	c.mu.Lock()
	c.goal = goalState{status: GoalStatusComplete}
	c.mu.Unlock()
	c.notice("goal complete")
}

// recordGoalBlocked returns true when the repeated-blocker audit has reached
// the stop threshold.
func (c *Controller) recordGoalBlocked(reason string) bool {
	reason = strings.TrimSpace(reason)
	if reason == "" {
		reason = "unspecified"
	}
	normalized := normalizeGoalBlocker(reason)
	c.mu.Lock()
	if normalized == "" {
		normalized = "unspecified"
	}
	if normalized == c.goal.normalizedBlockReason {
		c.goal.blockedCount++
	} else {
		c.goal.normalizedBlockReason = normalized
		c.goal.blockedCount = 1
	}
	c.goal.blockedReason = reason
	count := c.goal.blockedCount
	if c.goal.blockedCount >= 3 {
		c.goal.status = GoalStatusBlocked
		c.mu.Unlock()
		c.notice("goal blocked: " + reason)
		return true
	}
	c.goal.status = GoalStatusActive
	c.mu.Unlock()
	c.notice(fmt.Sprintf("goal blocker noted (%d/3): %s", count, reason))
	return false
}

func normalizeGoalBlocker(reason string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(reason) {
		if unicode.IsLetter(r) || unicode.IsNumber(r) {
			b.WriteRune(r)
		}
	}
	return b.String()
}
