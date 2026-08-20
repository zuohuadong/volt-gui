import OpenAI from 'openai';
import { PrefixCachePipeline } from './prefix_cache.js';
import { StreamDecoder } from './stream_decoder.js';
import { safeParseJson } from './json_repair.js';
export class DshEngine {
    client;
    config;
    tools = new Map();
    pipeline;
    history = [];
    constructor(config) {
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
        this.pipeline = new PrefixCachePipeline(this.config.systemPrompt || 'You are an expert AI software engineer powered by DeepSeek Harness (DSH).', []);
    }
    registerTool(handler) {
        this.tools.set(handler.schema.name, handler);
        this.syncToolSchemas();
    }
    registerTools(handlers) {
        for (const h of handlers) {
            this.tools.set(h.schema.name, h);
        }
        this.syncToolSchemas();
    }
    getToolSchemas() {
        return Array.from(this.tools.values()).map((t) => t.schema);
    }
    syncToolSchemas() {
        this.pipeline.updateStaticRoot(this.config.systemPrompt || '', this.getToolSchemas());
    }
    setModel(model) {
        this.config.model = model;
    }
    getModel() {
        return this.config.model;
    }
    getHistory() {
        return [...this.history];
    }
    setHistory(messages) {
        this.history = [...messages];
    }
    clearHistory() {
        this.history = [];
    }
    /**
     * Execute a complete turn (may involve multiple reasoning + tool call cycles).
     */
    async *runTurn(userPrompt, options) {
        const maxSteps = options?.maxSteps ?? 25;
        const activeModel = options?.model || this.config.model;
        let stepCount = 0;
        // Append current user message
        const userMessage = { role: 'user', content: userPrompt };
        this.history.push(userMessage);
        const activeTurnMessages = [];
        while (stepCount < maxSteps) {
            stepCount++;
            const decoder = new StreamDecoder(this.config.enableDegenerationGuard);
            const eventQueue = [];
            const emit = (event) => {
                eventQueue.push(event);
            };
            // 1. Build cache-aligned context
            const formattedMessages = this.pipeline.buildContext(this.history, activeTurnMessages, this.config.compactReasoningInHistory);
            // Map to OpenAI messages format
            const openAiMessages = formattedMessages.map((m) => {
                const base = { role: m.role, content: m.content || '' };
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
                type: 'function',
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters,
                },
            }));
            // 3. Initiate Streaming Call to Model Gateway
            let stream;
            try {
                stream = await this.client.chat.completions.create({
                    model: activeModel,
                    messages: openAiMessages,
                    tools: toolsPayload.length > 0 ? toolsPayload : undefined,
                    temperature: this.config.temperature,
                    stream: true,
                    stream_options: { include_usage: true },
                }, { signal: options?.signal });
            }
            catch (err) {
                throw new Error(`API request failed for model '${activeModel}': ${err.message}`);
            }
            let finishReason = 'stop';
            let lastUsage = null;
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
                    yield eventQueue.shift();
                }
            }
            // Finalize decoder
            const finalized = decoder.finalize({ onEvent: emit });
            while (eventQueue.length > 0) {
                yield eventQueue.shift();
            }
            const assistantMsg = {
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
                    yield eventQueue.shift();
                }
                // Commit all turn messages to history
                this.history.push(...activeTurnMessages);
                return assistantMsg;
            }
            // 4. Execute tool calls
            for (const call of finalized.toolCalls) {
                const toolName = call.function.name;
                const toolHandler = this.tools.get(toolName);
                const parsedArgs = safeParseJson(call.function.arguments, {});
                emit({
                    type: 'tool_exec_start',
                    toolCallId: call.id,
                    name: toolName,
                    args: parsedArgs,
                });
                while (eventQueue.length > 0) {
                    yield eventQueue.shift();
                }
                let output = '';
                let isError = false;
                if (!toolHandler) {
                    output = `Error: Tool '${toolName}' is not registered in DSH.`;
                    isError = true;
                }
                else {
                    try {
                        const context = {
                            toolCallId: call.id,
                            workingDirectory: this.config.workingDirectory || process.cwd(),
                            signal: options?.signal,
                        };
                        const result = await toolHandler.execute(parsedArgs, context);
                        if (typeof result === 'string') {
                            output = result;
                        }
                        else {
                            output = result.output;
                            isError = result.isError ?? false;
                        }
                    }
                    catch (err) {
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
                    yield eventQueue.shift();
                }
                const toolMsg = {
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
//# sourceMappingURL=engine.js.map