package agent

import (
	"context"
	"encoding/json"
	"testing"

	"voltui/internal/event"
	"voltui/internal/provider"
	"voltui/internal/tool"
)

type browserInteractionContextProbe struct {
	seen bool
}

func (*browserInteractionContextProbe) Name() string        { return "browser_interaction_context_probe" }
func (*browserInteractionContextProbe) Description() string { return "" }
func (*browserInteractionContextProbe) Schema() json.RawMessage {
	return json.RawMessage(`{"type":"object"}`)
}
func (*browserInteractionContextProbe) ReadOnly() bool { return true }
func (p *browserInteractionContextProbe) Execute(ctx context.Context, _ json.RawMessage) (string, error) {
	_, p.seen = tool.BrowserInteractionProviderFrom(ctx)
	return "ok", nil
}

func TestAgentInjectsBrowserInteractionProviderWithoutEvidenceLedger(t *testing.T) {
	registry := tool.NewRegistry()
	probe := &browserInteractionContextProbe{}
	registry.Add(probe)
	agent := New(nil, registry, NewSession(""), Options{}, event.Discard)
	agent.evidence = nil
	agent.SetBrowserInteractionProvider(&coordinatorBrowserInteractionStub{})

	outcome := agent.executeOne(context.Background(), provider.ToolCall{
		ID: "browser-context", Name: probe.Name(), Arguments: `{}`,
	})

	if outcome.errMsg != "" || !probe.seen {
		t.Fatalf("browser provider context missing: outcome=%#v seen=%v", outcome, probe.seen)
	}
}
