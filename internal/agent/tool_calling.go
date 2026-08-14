package agent

import "voltui/internal/provider"

const toolCallingDisabledError = "provider emitted a tool call although tool calling is disabled"

func (a *Agent) requestTools() []provider.ToolSchema {
	if a == nil || !a.toolCalling || a.tools == nil {
		return nil
	}
	return a.tools.Schemas()
}

func isToolCallChunk(kind provider.ChunkType) bool {
	return kind == provider.ChunkToolCallStart || kind == provider.ChunkToolCallArgsDelta || kind == provider.ChunkToolCall
}
