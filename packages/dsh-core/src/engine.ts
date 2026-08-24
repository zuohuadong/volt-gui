import OpenAI from 'openai';
import type {
  DshConfig,
  Message,
  ToolHandler,
  ToolSchema,
  DshTurnEvent,
  ToolExecutionContext,
  ToolCall,
  ToolAuthorizationDecision,
} from './types.js';
import { PrefixCachePipeline } from './prefix_cache.js';
import { StreamDecoder } from './stream_decoder.js';
import { safeParseJson } from './json_repair.js';

export class DshEngine {
  private client: OpenAI;
  private config: DshConfig;
  private tools: Map<string, ToolHandler> = new Map();
  private pipeline: PrefixCachePipeline;
  private history: Message[] = [];

  constructor(config: DshConfig) {
    this.config = {
      baseURL: 'https://api.deepseek.com',
      temperature: 0.0,
      compactReasoningInHistory: true,
      enableDegenerationGuard: true,
      workingDirectory: process.cwd(),
      ...config,
    };

    const apiKey = this.config.apiKey || process.env.DEEPSEEK_API_KEY || 'dummy-key';

    this.client = new OpenAI({
      apiKey,
      baseURL: this.config.baseURL,
    });

    this.pipeline = new PrefixCachePipeline(
      this.config.systemPrompt || 'You are an expert AI software engineer powered by DeepSeek Harness (DSH).',
      []
    );
  }

  public registerTool(handler: ToolHandler): void {
    this.tools.set(handler.schema.name, handler);
    this.syncToolSchemas();
  }

  public registerTools(handlers: ToolHandler[]): void {
    for (const h of handlers) {
      this.tools.set(h.schema.name, h);
    }
    this.syncToolSchemas();
  }

  public getToolSchemas(): ToolSchema[] {
    return Array.from(this.tools.values()).map((t) => t.schema);
  }

  private syncToolSchemas(): void {
    this.pipeline.updateStaticRoot(
      this.config.systemPrompt || '',
      this.getToolSchemas()
    );
  }

  public setModel(model: string): void {
    this.config.model = model;
  }

  public getModel(): string {
    return this.config.model;
  }

  public getHistory(): Message[] {
    return [...this.history];
  }

  public setHistory(messages: Message[]): void {
    this.history = [...messages];
  }

  public clearHistory(): void {
    this.history = [];
  }

  /**
   * Execute a complete turn (may involve multiple reasoning + tool call cycles).
   */
  public async *runTurn(
    userPrompt: string,
    options?: { signal?: AbortSignal; maxSteps?: number; model?: string }
  ): AsyncGenerator<DshTurnEvent, Message, void> {
    const maxSteps = options?.maxSteps ?? 25;
    const activeModel = options?.model || this.config.model;
    let stepCount = 0;

    const userMessage: Message = { role: 'user', content: userPrompt };
    const activeTurnMessages: Message[] = [userMessage];

    while (stepCount < maxSteps) {
      stepCount++;
      const decoder = new StreamDecoder(this.config.enableDegenerationGuard);
      const eventQueue: DshTurnEvent[] = [];

      const emit = (event: DshTurnEvent) => {
        eventQueue.push(event);
      };

      // 1. Build cache-aligned context
      const formattedMessages = this.pipeline.buildContext(
        this.history,
        activeTurnMessages,
        this.config.compactReasoningInHistory
      );

      // Map to OpenAI messages format
      const openAiMessages = formattedMessages.map((m) => {
        const base: any = { role: m.role, content: m.content || '' };
        if (m.toolCalls && m.toolCalls.length > 0) {
          base.tool_calls = m.toolCalls;
        }
        if (m.toolCallId) {
          base.tool_call_id = m.toolCallId;
        }
        return base;
      });

      // 2. Prepare Tool Schemas for API
      const toolsPayload = this.pipeline.getNormalizedTools().map((t) => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));

      // 3. Initiate Streaming Call to Model Gateway
      let stream: any;
      try {
        stream = await this.client.chat.completions.create(
          {
            model: activeModel,
            messages: openAiMessages,
            tools: toolsPayload.length > 0 ? toolsPayload : undefined,
            temperature: this.config.temperature,
            stream: true,
            stream_options: { include_usage: true },
          },
          { signal: options?.signal }
        );
      } catch (err: any) {
        throw new Error(`API request failed for model '${activeModel}': ${err.message}`);
      }

      let finishReason = 'stop';
      let lastUsage: any = null;

      for await (const chunk of stream) {
        if (chunk.usage) {
          lastUsage = chunk.usage;
          const diag = this.pipeline.calculateDiagnostics(chunk.usage);
          emit({ type: 'cache_diagnostics', diagnostics: diag });
        }

        const choice = chunk.choices?.[0];
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }

        decoder.processChunk(chunk, { onEvent: emit });

        // Yield accumulated events from this chunk
        while (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        }
      }

      // Finalize decoder
      const finalized = decoder.finalize({ onEvent: emit });
      while (eventQueue.length > 0) {
        yield eventQueue.shift()!;
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: finalized.content,
        reasoningContent: finalized.reasoningContent,
        toolCalls: finalized.toolCalls.length > 0 ? finalized.toolCalls : undefined,
      };

      activeTurnMessages.push(assistantMsg);

      // If no tool calls, the assistant finished its response
      if (finalized.toolCalls.length === 0) {
        emit({
          type: 'turn_complete',
          finishReason,
          totalUsage: lastUsage ? this.pipeline.calculateDiagnostics(lastUsage) : undefined,
        });
        while (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        }

        // Commit all turn messages to history
        this.history.push(...activeTurnMessages);
        return assistantMsg;
      }

      // 4. Execute tool calls
      for (const call of finalized.toolCalls) {
        const toolName = call.function.name;
        const toolHandler = this.tools.get(toolName);
        const parsedArgs = safeParseJson<Record<string, unknown>>(call.function.arguments, {});

        let output = '';
        let isError = false;
        let authorized = true;

        if (!toolHandler) {
          output = `Error: Tool '${toolName}' is not registered in DSH.`;
          isError = true;
        } else {
          const authorization = toolHandler.authorization ?? { effect: 'external', risk: 'high' };
          let decision: ToolAuthorizationDecision = { allow: true };

          if (authorization.effect !== 'read' || authorization.risk !== 'ordinary') {
            if (!this.config.authorizationBroker) {
              decision = { allow: false, reason: 'Tool authorization broker is unavailable.' };
            } else {
              try {
                decision = await this.config.authorizationBroker.authorize({
                  toolCallId: call.id,
                  toolName,
                  args: parsedArgs,
                  workingDirectory: this.config.workingDirectory || process.cwd(),
                  authorization,
                  signal: options?.signal,
                });
              } catch (err: any) {
                decision = { allow: false, reason: `Authorization failed: ${err.message}` };
              }
            }
          }

          authorized = decision.allow;
          if (!authorized) {
            output = `Tool authorization denied: ${decision.reason || 'Denied by policy.'}`;
            isError = true;
          }
        }

        if (toolHandler && authorized) {
          emit({
            type: 'tool_exec_start',
            toolCallId: call.id,
            name: toolName,
            args: parsedArgs,
          });
          while (eventQueue.length > 0) {
            yield eventQueue.shift()!;
          }

          try {
            const context: ToolExecutionContext = {
              toolCallId: call.id,
              workingDirectory: this.config.workingDirectory || process.cwd(),
              signal: options?.signal,
            };
            const result = await toolHandler.execute(parsedArgs, context);
            if (typeof result === 'string') {
              output = result;
            } else {
              output = result.output;
              isError = result.isError ?? false;
            }
          } catch (err: any) {
            output = `Tool execution error: ${err.message}`;
            isError = true;
          }
        }

        emit({
          type: 'tool_exec_result',
          toolCallId: call.id,
          name: toolName,
          output,
          isError,
        });
        while (eventQueue.length > 0) {
          yield eventQueue.shift()!;
        }

        const toolMsg: Message = {
          role: 'tool',
          content: output,
          toolCallId: call.id,
          name: toolName,
        };
        activeTurnMessages.push(toolMsg);
      }
    }

    throw new Error(`Turn exceeded maximum allowed steps (${maxSteps})`);
  }
}
