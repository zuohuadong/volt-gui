package controlplane

import (
	"reflect"
	"testing"

	controlgraph "reasonix/internal/controlplane/control_graph"
)

func TestDistributedControlWorksWithoutAnySingleController(t *testing.T) {
	st := controlgraph.SystemState{Stable: true, RecentSuccesses: 4}
	graph := DefaultGraph()
	for _, node := range graph.Nodes {
		decision := DecideWithGraph(st, WithoutNode(graph, node.ID()))
		if decision.Controller != "distributed-control-plane" {
			t.Fatalf("controller = %q, want distributed-control-plane", decision.Controller)
		}
		if decision.Action == "" || decision.Confidence <= 0 {
			t.Fatalf("decision without %s is invalid: %+v", node.ID(), decision)
		}
		if decision.ExplorationRatePercent < controlgraph.MinExplorationRatePercent || decision.ExplorationRatePercent > controlgraph.MaxExplorationRatePercent {
			t.Fatalf("decision without %s has invalid exploration rate: %+v", node.ID(), decision)
		}
	}
}

func TestDistributedControlDecisionIsDeterministic(t *testing.T) {
	st := controlgraph.SystemState{
		Stable:          true,
		RecentSuccesses: 5,
	}
	first := Decide(st)
	for i := 0; i < 8; i++ {
		if got := Decide(st); !reflect.DeepEqual(first, got) {
			t.Fatalf("distributed decision is not deterministic:\nfirst=%+v\ngot=%+v", first, got)
		}
	}
}

func TestDistributedControlResolvesStabilityExplorationConflict(t *testing.T) {
	st := controlgraph.SystemState{
		Stable:      true,
		Oscillating: true,
	}
	decision := Decide(st)
	if decision.Action != controlgraph.ActionDampen {
		t.Fatalf("stability/exploration conflict should dampen, got %+v", decision)
	}
	if decision.ExplorationRatePercent != controlgraph.MinExplorationRatePercent {
		t.Fatalf("damped decision should use exploration floor, got %+v", decision)
	}
}

func TestDistributedControlSemanticShiftFallsBackToStablePolicy(t *testing.T) {
	st := controlgraph.SystemState{
		Stable:        true,
		SemanticShift: []string{"soft semantic variations accumulated across recent turns: 3"},
	}
	decision := Decide(st)
	if decision.Action != controlgraph.ActionStabilize && decision.Action != controlgraph.ActionSafeMode {
		t.Fatalf("semantic shift should stabilize or safe-mode, got %+v", decision)
	}
	if decision.ExplorationRatePercent != controlgraph.MinExplorationRatePercent {
		t.Fatalf("semantic shift should suppress exploration, got %+v", decision)
	}
}

func TestDistributedControlConsensusStaysBounded(t *testing.T) {
	decision := Decide(controlgraph.SystemState{Stable: true, RecentSuccesses: 4})
	if decision.ConsensusScore <= 0 || decision.ConsensusScore > 1 {
		t.Fatalf("invalid consensus score: %+v", decision)
	}
	if decision.Variance > 0.12 {
		t.Fatalf("stable consensus variance too high: %+v", decision)
	}
}
