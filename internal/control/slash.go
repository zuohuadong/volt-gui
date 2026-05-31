package control

import (
	"fmt"
	"strings"

	"reasonix/internal/config"
)

// managementNotice handles the read-only management slash commands on the Submit
// path (used by the desktop and HTTP frontends, which route raw input through
// Submit — the chat TUI has its own richer handlers). It emits a Notice listing
// and reports whether it handled the verb. Skills and custom commands are NOT
// here — those resolve to a turn in Submit.
func (c *Controller) managementNotice(trimmed string) bool {
	fields := strings.Fields(trimmed)
	if len(fields) == 0 {
		return false
	}
	switch fields[0] {
	case "/model":
		c.notice(c.modelListText())
	case "/memory":
		c.notice(c.memoryListText())
	case "/skill", "/skills":
		c.notice(c.skillListText())
	case "/hooks":
		c.notice(c.hookListText())
	case "/mcp":
		c.notice(c.mcpListText())
	default:
		return false
	}
	return true
}

func (c *Controller) modelListText() string {
	cfg, err := config.Load()
	if err != nil {
		return "model: " + err.Error()
	}
	var b strings.Builder
	b.WriteString("models (active: " + c.label + ")\n")
	for i := range cfg.Providers {
		p := &cfg.Providers[i]
		for _, m := range p.ModelList() {
			fmt.Fprintf(&b, "  %s/%s\n", p.Name, m)
		}
	}
	b.WriteString("switch with the model switcher, or type /model <provider/model>")
	return strings.TrimRight(b.String(), "\n")
}

func (c *Controller) memoryListText() string {
	if c.mem == nil || len(c.mem.Docs) == 0 {
		return "memory: none — add with “#<note>” or run /init to generate AGENTS.md"
	}
	var b strings.Builder
	b.WriteString("memory files\n")
	for _, d := range c.mem.Docs {
		fmt.Fprintf(&b, "  (%s) %s\n", d.Scope, d.Path)
	}
	return strings.TrimRight(b.String(), "\n")
}

func (c *Controller) skillListText() string {
	if len(c.skills) == 0 {
		return "skills: none defined — invoke a built-in like /init, or author one with install_skill"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "skills (%d)\n", len(c.skills))
	for _, s := range c.skills {
		tag := ""
		if s.RunAs == "subagent" {
			tag = " 🧬"
		}
		fmt.Fprintf(&b, "  /%s%s — %s\n", s.Name, tag, s.Description)
	}
	return strings.TrimRight(b.String(), "\n")
}

func (c *Controller) hookListText() string {
	hooks := c.hooks.Hooks()
	if len(hooks) == 0 {
		return "hooks: none active — configure in .reasonix/settings.json (project, after trust) or ~/.reasonix/settings.json (global)"
	}
	var b strings.Builder
	fmt.Fprintf(&b, "hooks (%d active)\n", len(hooks))
	for _, h := range hooks {
		match := h.Match
		if match == "" {
			match = "*"
		}
		fmt.Fprintf(&b, "  %s [%s] %s — %s\n", h.Event, h.Scope, match, h.Command)
	}
	return strings.TrimRight(b.String(), "\n")
}

func (c *Controller) mcpListText() string {
	if c.host == nil || len(c.host.ServerNames()) == 0 {
		return "mcp: no servers connected — add one in reasonix.toml ([[plugins]]) or a project .mcp.json"
	}
	var b strings.Builder
	b.WriteString("mcp servers\n")
	for _, name := range c.host.ServerNames() {
		fmt.Fprintf(&b, "  %s\n", name)
	}
	return strings.TrimRight(b.String(), "\n")
}
