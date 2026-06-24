package controlplane

import (
	"reasonix/internal/controlplane/arbitration"
	controlgraph "reasonix/internal/controlplane/control_graph"
	"reasonix/internal/controlplane/controllers"
	policynodes "reasonix/internal/controlplane/policy_nodes"
)

func DefaultGraph() controlgraph.ControlGraph {
	return controllers.DefaultGraph()
}

func Decide(st controlgraph.SystemState) controlgraph.ControlDecision {
	return DecideWithGraph(st, DefaultGraph())
}

func DecideWithGraph(st controlgraph.SystemState, graph controlgraph.ControlGraph) controlgraph.ControlDecision {
	graph = policynodes.LearnControlGraph(graph, st)
	graph = policynodes.ApplyDynamicWeights(graph, st)
	signals := CollectSignals(graph, st)
	return arbitration.Arbitrate(graph, st, signals)
}

func CollectSignals(graph controlgraph.ControlGraph, st controlgraph.SystemState) []controlgraph.ControlSignal {
	signals := make([]controlgraph.ControlSignal, 0, len(graph.Nodes))
	for _, node := range graph.Nodes {
		signals = append(signals, node.Signal(st))
	}
	return signals
}

func WithoutNode(graph controlgraph.ControlGraph, id string) controlgraph.ControlGraph {
	return controlgraph.WithoutNode(graph, id)
}
