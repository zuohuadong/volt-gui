import type { Message, ToolSchema, CacheDiagnostics } from './types.js';
export declare function shortHash(content: string): string;
/**
 * Normalizes tool schemas into a canonical, alphabetically sorted JSON structure.
 * This guarantees zero jitter in tool definitions across turns for DeepSeek's prefix cache.
 */
export declare function normalizeToolSchemas(schemas: ToolSchema[]): ToolSchema[];
export declare class PrefixCachePipeline {
    private staticRootHash;
    private normalizedTools;
    private systemPrompt;
    constructor(systemPrompt?: string, tools?: ToolSchema[]);
    updateStaticRoot(systemPrompt: string, tools: ToolSchema[]): void;
    getStaticHash(): string;
    getNormalizedTools(): ToolSchema[];
    /**
     * Builds the message array sent to DeepSeek API.
     * Compacting reasoning tokens from older turns preserves 64-token block stability
     * and prevents token explosion.
     */
    buildContext(history: Message[], activeMessages: Message[], compactHistory?: boolean): Message[];
    calculateDiagnostics(usage: {
        prompt_tokens?: number;
        completion_tokens?: number;
        prompt_cache_hit_tokens?: number;
        prompt_cache_miss_tokens?: number;
        completion_tokens_details?: {
            reasoning_tokens?: number;
        };
    }): CacheDiagnostics;
}
//# sourceMappingURL=prefix_cache.d.ts.map