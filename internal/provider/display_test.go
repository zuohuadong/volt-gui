package provider

import (
	"reflect"
	"testing"
)

func TestDisplayMessage(t *testing.T) {
	t.Run("hidden", func(t *testing.T) {
		if _, ok := DisplayMessage(Message{Role: RoleUser, Content: "internal", DisplayHidden: true}); ok {
			t.Fatal("hidden message was projected")
		}
	})

	t.Run("tools only", func(t *testing.T) {
		original := Message{
			Role:               RoleAssistant,
			Content:            "draft",
			Images:             []string{"data:image/png;base64,AA=="},
			ReasoningContent:   "reasoning",
			ReasoningSignature: "signature",
			ToolCalls:          []ToolCall{{ID: "call-1", Name: "read_file", Arguments: `{}`}},
			MemoryCitations:    []MemoryCitation{{Source: "memory"}},
			DisplayToolsOnly:   true,
			Edited:             true,
			Original:           "original",
		}
		projected, ok := DisplayMessage(original)
		if !ok {
			t.Fatal("tools-only message was dropped")
		}
		if projected.Content != "" || projected.ReasoningContent != "" || projected.ReasoningSignature != "" || len(projected.Images) != 0 || len(projected.MemoryCitations) != 0 || projected.Edited || projected.Original != "" {
			t.Fatalf("tools-only display metadata leaked content: %+v", projected)
		}
		if !reflect.DeepEqual(projected.ToolCalls, original.ToolCalls) {
			t.Fatalf("tool calls = %+v, want %+v", projected.ToolCalls, original.ToolCalls)
		}
		if original.Content != "draft" || original.ReasoningContent != "reasoning" {
			t.Fatalf("projection mutated model context: %+v", original)
		}
	})

	t.Run("ordinary", func(t *testing.T) {
		original := Message{Role: RoleAssistant, Content: "answer", ReasoningContent: "reasoning"}
		projected, ok := DisplayMessage(original)
		if !ok || !reflect.DeepEqual(projected, original) {
			t.Fatalf("ordinary projection = %+v/%v, want unchanged", projected, ok)
		}
	})
}
