/**
 * DSH (DeepSeek Harness) Core Types
 */

export interface DshConfig {
  apiKey?: string;
  baseURL?: string;
  model: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  compactReasoningInHistory?: boolean;
  enableDegenerationGuard?: boolean;
  workingDirectory?: string;
}

export type MessageRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface Message {
  role: MessageRole;
  content: string;
  reasoningContent?: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ToolProperty {
  type: string;
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
  properties?: Record<string, ToolProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolProperty>;
  required?: string[];
  additionalProperties?: boolean;
  [key: string]: unknown;
}

export interface ToolSchema {
  name: string;
  description: string;
  parameters: ToolParameters;
}

export interface ToolResult {
  toolCallId: string;
  name: string;
  output: string;
  isError?: boolean;
}

export interface CacheDiagnostics {
  cachedTokens: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
  cacheHitRatio: number;
  prefixHash: string;
}

export type DshTurnEvent =
  | { type: 'reasoning_delta'; delta: string }
  | { type: 'content_delta'; delta: string }
  | { type: 'tool_call_start'; toolCall: ToolCall }
  | { type: 'tool_call_args_delta'; toolCallId: string; delta: string }
  | { type: 'tool_call_ready'; toolCall: ToolCall; parsedArgs: Record<string, unknown> }
  | { type: 'tool_exec_start'; toolCallId: string; name: string; args: Record<string, unknown> }
  | { type: 'tool_exec_result'; toolCallId: string; name: string; output: string; isError?: boolean }
  | { type: 'cache_diagnostics'; diagnostics: CacheDiagnostics }
  | { type: 'degeneration_detected'; reason: string; count: number }
  | { type: 'turn_complete'; finishReason: string; totalUsage?: CacheDiagnostics };

export interface ToolHandler {
  schema: ToolSchema;
  execute: (args: Record<string, unknown>, context: ToolExecutionContext) => Promise<string | { output: string; isError?: boolean }>;
}

export interface ToolExecutionContext {
  toolCallId: string;
  workingDirectory: string;
  signal?: AbortSignal;
}
