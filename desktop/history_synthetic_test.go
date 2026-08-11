package main

import (
	"testing"

	"voltui/internal/provider"
)

func TestHistoryMessagesHideCalculationGateRetry(t *testing.T) {
	messages := []provider.Message{
		{Role: provider.RoleUser, Content: "计算总价"},
		{Role: provider.RoleAssistant, Content: "还需要核对。"},
		{Role: provider.RoleUser, Content: "Internal host instruction: the arithmetic result has not been verified. Call calculate with the complete expression."},
		{Role: provider.RoleAssistant, Content: "总价为 100 元。"},
	}
	history := historyMessages(messages, func(content string) string { return content })

	if len(history) != 3 {
		t.Fatalf("history messages = %d, want 3 after hiding the calculation retry", len(history))
	}
	for _, message := range history {
		if message.Role == "user" && message.Content != "计算总价" {
			t.Fatalf("synthetic calculation retry leaked as a user message: %q", message.Content)
		}
	}
}
