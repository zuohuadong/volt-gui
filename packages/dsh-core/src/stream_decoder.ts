import type { DshTurnEvent, ToolCall } from './types.js';
import { ThinkSplitter } from './think_splitter.js';
import { DegenerationGuard } from './degeneration_guard.js';
import { safeParseJson } from './json_repair.js';

export interface StreamCallbacks {
  onEvent: (event: DshTurnEvent) => void;
}

export class StreamDecoder {
  private thinkSplitter = new ThinkSplitter();
  private degenGuard = new DegenerationGuard();
  private accumulatedReasoning = '';
  private accumulatedContent = '';
  private pendingToolCalls: Map<number, ToolCall> = new Map();
  private enableDegenerationGuard = true;

  constructor(enableDegenerationGuard = true) {
    this.enableDegenerationGuard = enableDegenerationGuard;
  }

  public processChunk(
    chunk: any,
    callbacks: StreamCallbacks
  ): void {
    const choice = chunk.choices?.[0];
    if (!choice) return;

    const delta = choice.delta;
    if (!delta) return;

    // 1. Process reasoning_content (DeepSeek first-class field)
    if (delta.reasoning_content) {
      const reasoningDelta = delta.reasoning_content;
      this.accumulatedReasoning += reasoningDelta;
      callbacks.onEvent({
        type: 'reasoning_delta',
        delta: reasoningDelta,
      });
    }

    // 2. Process content & inline <think> tags
    if (delta.content) {
      const rawContent = delta.content;

      // Degeneration guard check on content stream
      if (this.enableDegenerationGuard) {
        const check = this.degenGuard.observe(rawContent);
        if (check.degenerated) {
          callbacks.onEvent({
            type: 'degeneration_detected',
            reason: check.reason,
            count: check.count,
          });
        }
      }

      const { reasoning, content } = this.thinkSplitter.push(rawContent);
      if (reasoning) {
        this.accumulatedReasoning += reasoning;
        callbacks.onEvent({
          type: 'reasoning_delta',
          delta: reasoning,
        });
      }
      if (content) {
        this.accumulatedContent += content;
        callbacks.onEvent({
          type: 'content_delta',
          delta: content,
        });
      }
    }

    // 3. Process tool_calls delta
    if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const index = tc.index ?? 0;
        let call = this.pendingToolCalls.get(index);

        if (!call) {
          call = {
            id: tc.id || `call_${index}_${Date.now()}`,
            type: 'function',
            function: {
              name: tc.function?.name || '',
              arguments: tc.function?.arguments || '',
            },
          };
          this.pendingToolCalls.set(index, call);
          callbacks.onEvent({
            type: 'tool_call_start',
            toolCall: { ...call },
          });
        } else {
          if (tc.id && !call.id) call.id = tc.id;
          if (tc.function?.name) call.function.name += tc.function.name;
          if (tc.function?.arguments) {
            call.function.arguments += tc.function.arguments;
            callbacks.onEvent({
              type: 'tool_call_args_delta',
              toolCallId: call.id,
              delta: tc.function.arguments,
            });
          }
        }
      }
    }
  }

  public finalize(callbacks: StreamCallbacks): {
    reasoningContent: string;
    content: string;
    toolCalls: ToolCall[];
  } {
    // Flush any pending think tag buffer
    const { reasoning, content } = this.thinkSplitter.flush();
    if (reasoning) {
      this.accumulatedReasoning += reasoning;
      callbacks.onEvent({ type: 'reasoning_delta', delta: reasoning });
    }
    if (content) {
      this.accumulatedContent += content;
      callbacks.onEvent({ type: 'content_delta', delta: content });
    }

    const toolCalls: ToolCall[] = [];

    // Finalize all accumulated tool calls with JSON repair
    for (const [_, call] of this.pendingToolCalls.entries()) {
      if (call.function.name) {
        const parsedArgs = safeParseJson<Record<string, unknown>>(call.function.arguments, {});
        callbacks.onEvent({
          type: 'tool_call_ready',
          toolCall: { ...call },
          parsedArgs,
        });
        toolCalls.push(call);
      }
    }

    return {
      reasoningContent: this.accumulatedReasoning,
      content: this.accumulatedContent,
      toolCalls,
    };
  }

  public reset(): void {
    this.thinkSplitter.reset();
    this.degenGuard.reset();
    this.accumulatedReasoning = '';
    this.accumulatedContent = '';
    this.pendingToolCalls.clear();
  }
}
