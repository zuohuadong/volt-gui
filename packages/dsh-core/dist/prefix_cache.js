import { createHash } from 'node:crypto';
export function shortHash(content) {
    return createHash('sha256').update(content).digest('hex').slice(0, 12);
}
/**
 * Normalizes tool schemas into a canonical, alphabetically sorted JSON structure.
 * This guarantees zero jitter in tool definitions across turns for DeepSeek's prefix cache.
 */
export function normalizeToolSchemas(schemas) {
    const cloned = JSON.parse(JSON.stringify(schemas));
    // Sort tools by name
    cloned.sort((a, b) => a.name.localeCompare(b.name));
    // Sort properties inside parameters
    for (const tool of cloned) {
        if (tool.parameters && tool.parameters.properties) {
            const sortedProps = {};
            const propKeys = Object.keys(tool.parameters.properties).sort();
            for (const key of propKeys) {
                sortedProps[key] = tool.parameters.properties[key];
            }
            tool.parameters.properties = sortedProps;
        }
        if (tool.parameters && tool.parameters.required) {
            tool.parameters.required.sort();
        }
    }
    return cloned;
}
export class PrefixCachePipeline {
    staticRootHash = '';
    normalizedTools = [];
    systemPrompt = '';
    constructor(systemPrompt = '', tools = []) {
        this.updateStaticRoot(systemPrompt, tools);
    }
    updateStaticRoot(systemPrompt, tools) {
        this.systemPrompt = systemPrompt.trim();
        this.normalizedTools = normalizeToolSchemas(tools);
        const rootPayload = JSON.stringify({
            system: this.systemPrompt,
            tools: this.normalizedTools,
        });
        this.staticRootHash = shortHash(rootPayload);
    }
    getStaticHash() {
        return this.staticRootHash;
    }
    getNormalizedTools() {
        return this.normalizedTools;
    }
    /**
     * Builds the message array sent to DeepSeek API.
     * Compacting reasoning tokens from older turns preserves 64-token block stability
     * and prevents token explosion.
     */
    buildContext(history, activeMessages, compactHistory = true) {
        const output = [];
        // 1. System Prompt (Static Prefix)
        if (this.systemPrompt) {
            output.push({
                role: 'system',
                content: this.systemPrompt,
            });
        }
        // 2. Historical Turns
        for (const msg of history) {
            if (compactHistory && msg.role === 'assistant' && msg.reasoningContent) {
                // DeepSeek best practice: Strip or compact past thinking in multi-turn history
                output.push({
                    role: 'assistant',
                    content: msg.content,
                    toolCalls: msg.toolCalls,
                });
            }
            else {
                output.push({ ...msg });
            }
        }
        // 3. Active Turn Messages (e.g. Current User prompt or newly executed tool results)
        for (const msg of activeMessages) {
            output.push({ ...msg });
        }
        return output;
    }
    calculateDiagnostics(usage) {
        const promptTokens = usage.prompt_tokens ?? 0;
        const completionTokens = usage.completion_tokens ?? 0;
        const cachedTokens = usage.prompt_cache_hit_tokens ?? 0;
        const reasoningTokens = usage.completion_tokens_details?.reasoning_tokens ?? 0;
        const cacheHitRatio = promptTokens > 0 ? cachedTokens / promptTokens : 0;
        return {
            cachedTokens,
            promptTokens,
            completionTokens,
            reasoningTokens,
            cacheHitRatio,
            prefixHash: this.staticRootHash,
        };
    }
}
//# sourceMappingURL=prefix_cache.js.map