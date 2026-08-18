import type { DshTurnEvent, Message, ToolSchema } from '@dsh/core';

export interface DshClientCallbacks {
  onReasoningDelta?: (delta: string) => void;
  onContentDelta?: (delta: string) => void;
  onToolCallStart?: (toolCall: any) => void;
  onToolExecStart?: (name: string, args: Record<string, unknown>) => void;
  onToolExecResult?: (name: string, output: string, isError?: boolean) => void;
  onCacheDiagnostics?: (diagnostics: any) => void;
  onTurnComplete?: (finishReason: string) => void;
  onError?: (error: Error) => void;
}

export class DshClient {
  private baseUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:3210') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  public async getHealth(): Promise<{ status: string; model: string; toolsCount: number }> {
    const res = await fetch(`${this.baseUrl}/api/health`);
    if (!res.ok) throw new Error(`Health check failed with status: ${res.status}`);
    return res.json();
  }

  public async listTools(): Promise<{ tools: ToolSchema[] }> {
    const res = await fetch(`${this.baseUrl}/api/tools`);
    if (!res.ok) throw new Error(`List tools failed with status: ${res.status}`);
    return res.json();
  }

  public async getHistory(): Promise<{ messages: Message[] }> {
    const res = await fetch(`${this.baseUrl}/api/history`);
    if (!res.ok) throw new Error(`Get history failed with status: ${res.status}`);
    return res.json();
  }

  public async clearHistory(): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/history`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`Clear history failed with status: ${res.status}`);
  }

  public async runTurn(prompt: string, callbacks: DshClientCallbacks, signal?: AbortSignal): Promise<void> {
    const response = await fetch(`${this.baseUrl}/api/turn`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
      signal,
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`DSH request failed (${response.status}): ${errBody}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('Response body is not readable');

    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        if (dataStr === '[DONE]') return;

        try {
          const event = JSON.parse(dataStr) as DshTurnEvent | { type: 'error'; message: string };

          switch (event.type) {
            case 'reasoning_delta':
              callbacks.onReasoningDelta?.(event.delta);
              break;
            case 'content_delta':
              callbacks.onContentDelta?.(event.delta);
              break;
            case 'tool_call_start':
              callbacks.onToolCallStart?.(event.toolCall);
              break;
            case 'tool_exec_start':
              callbacks.onToolExecStart?.(event.name, event.args);
              break;
            case 'tool_exec_result':
              callbacks.onToolExecResult?.(event.name, event.output, event.isError);
              break;
            case 'cache_diagnostics':
              callbacks.onCacheDiagnostics?.(event.diagnostics);
              break;
            case 'turn_complete':
              callbacks.onTurnComplete?.(event.finishReason);
              break;
            case 'error':
              callbacks.onError?.(new Error((event as any).message));
              break;
          }
        } catch {
          // Ignore json parse error
        }
      }
    }
  }
}
