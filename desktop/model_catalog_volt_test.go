package main

import "testing"

func TestReconcileModelCatalogDoesNotDuplicateBundledGatewayAliases(t *testing.T) {
	configured := []ModelInfo{
		{Ref: "xllm/glm-5.2/glm-5.2", Provider: "xllm", Model: "glm-5.2/glm-5.2", Label: "xllm"},
		{Ref: "vlm/step-3.7-flash/step-3.7-flash", Provider: "vlm", Model: "step-3.7-flash/step-3.7-flash", Label: "vlm", Vision: true},
	}
	providerProbes := map[string]modelCatalogProviderProbe{
		"xllm": {key: "gateway", curated: true},
		"vlm":  {key: "gateway", curated: true},
	}
	outcomes := map[string]modelCatalogProbeOutcome{
		"gateway": {modelIDs: []string{
			"glm-5.2/glm-5.2",
			"step-3.7-flash/step-3.7-flash",
			"xllm",
			"vlm",
		}},
	}

	models := reconcileModelCatalog(configured, providerProbes, outcomes)
	if len(models) != len(configured) {
		t.Fatalf("reconciled catalog = %+v, want only the two curated models", models)
	}
	for index, model := range models {
		if model.Ref != configured[index].Ref || model.Label != configured[index].Label || model.Availability != "available" {
			t.Fatalf("model[%d] = %+v, want available %+v", index, model, configured[index])
		}
	}
}
