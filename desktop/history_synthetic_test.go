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

func TestHistoryMessagesHideDiscardedLocalOnlyStreamOutput(t *testing.T) {
	messages := []provider.Message{
		{Role: provider.RoleUser, Content: "修复问题"},
		{
			Role: provider.RoleTool, ToolCallID: provider.LocalOnlyToolID, Name: provider.LocalOnlyToolName,
			Content: "异常重复输出", LocalOnly: true,
			InterruptedTurn: &provider.InterruptedTurnRecovery{DroppedPartialText: true},
		},
		{Role: provider.RoleAssistant, Content: "恢复后的完整回答"},
		{
			Role: provider.RoleTool, ToolCallID: provider.LocalOnlyToolID, Name: provider.LocalOnlyToolName,
			Content: "用户主动取消时保留的局部输出", LocalOnly: true,
			InterruptedTurn: &provider.InterruptedTurnRecovery{Pending: true},
		},
		{
			Role: provider.RoleTool, ToolCallID: provider.LocalOnlyToolID, Name: provider.LocalOnlyToolName,
			Content: "第二次异常重复输出", LocalOnly: true,
			InterruptedTurn: &provider.InterruptedTurnRecovery{Pending: true, DroppedPartialText: true},
		},
	}

	history := historyMessages(messages, func(content string) string { return content })
	if len(history) != 3 {
		t.Fatalf("history messages = %d, want user, recovered answer, and pending local display: %+v", len(history), history)
	}
	for _, message := range history {
		if message.Content == "异常重复输出" || message.Content == "第二次异常重复输出" {
			t.Fatalf("discarded stream output leaked into history: %+v", history)
		}
	}
	if history[2].Role != string(provider.RoleTool) || history[2].ToolCallID != provider.LocalOnlyToolID {
		t.Fatalf("pending local display record was unexpectedly hidden: %+v", history)
	}
}
