/**
 * DSH (DeepSeek Harness) Desktop Svelte Bridge
 * Seamlessly connects the Svelte 5 desktop interface to the high-performance DSH Core runtime.
 */

export interface DshStreamState {
  isThinking: boolean;
  reasoningText: string;
  contentText: string;
  activeTool: { name: string; args: Record<string, unknown> } | null;
  toolResults: Array<{ name: string; output: string; isError?: boolean }>;
  cacheHitRatio: number;
  isStreaming: boolean;
  error: string | null;
}

export class DshBridge {
  private baseUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:3210') {
    this.baseUrl = baseUrl;
  }

  public async checkHealth(): Promise<{ status: string; model: string; toolsCount: number }> {
    const res = await fetch(`${this.baseUrl}/api/health`);
    if (!res.ok) throw new Error(`DSH Server not responding (${res.status})`);
    return res.json();
  }

  public async getAvailableTools(): Promise<any[]> {
    const res = await fetch(`${this.baseUrl}/api/tools`);
    if (!res.ok) throw new Error('Failed to fetch DSH tools');
    const data = await res.json();
    return data.tools || [];
  }

  public async submitPrompt(
    prompt: string,
    onStateChange: (state: DshStreamState) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const state: DshStreamState = {
      isThinking: true,
      reasoningText: '',
      contentText: '',
      activeTool: null,
      toolResults: [],
      cacheHitRatio: 0,
      isStreaming: true,
      error: null,
    };

    onStateChange({ ...state });

    try {
      const response = await fetch(`${this.baseUrl}/api/turn`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
        signal,
      });

      if (!response.ok) {
        throw new Error(`DSH server error: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Response stream unavailable');

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
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') {
            state.isStreaming = false;
            state.isThinking = false;
            onStateChange({ ...state });
            return;
          }

          try {
            const event = JSON.parse(dataStr);
            switch (event.type) {
              case 'reasoning_delta':
                state.isThinking = true;
                state.reasoningText += event.delta;
                onStateChange({ ...state });
                break;

              case 'content_delta':
                state.isThinking = false;
                state.contentText += event.delta;
                onStateChange({ ...state });
                break;

              case 'tool_exec_start':
                state.activeTool = { name: event.name, args: event.args };
                onStateChange({ ...state });
                break;

              case 'tool_exec_result':
                state.toolResults.push({
                  name: event.name,
                  output: event.output,
                  isError: event.isError,
                });
                state.activeTool = null;
                onStateChange({ ...state });
                break;

              case 'cache_diagnostics':
                state.cacheHitRatio = event.diagnostics?.cacheHitRatio ?? 0;
                onStateChange({ ...state });
                break;

              case 'turn_complete':
                state.isStreaming = false;
                state.isThinking = false;
                onStateChange({ ...state });
                break;

              case 'error':
                state.error = event.message;
                state.isStreaming = false;
                onStateChange({ ...state });
                break;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    } catch (err: any) {
      state.error = err.message;
      state.isStreaming = false;
      onStateChange({ ...state });
    }
  }
}

export const dshBridge = new DshBridge();
