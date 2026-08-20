import type { DshConfig, Message, ToolHandler, ToolSchema, DshTurnEvent } from './types.js';
export declare class DshEngine {
    private client;
    private config;
    private tools;
    private pipeline;
    private history;
    constructor(config: DshConfig);
    registerTool(handler: ToolHandler): void;
    registerTools(handlers: ToolHandler[]): void;
    getToolSchemas(): ToolSchema[];
    private syncToolSchemas;
    setModel(model: string): void;
    getModel(): string;
    getHistory(): Message[];
    setHistory(messages: Message[]): void;
    clearHistory(): void;
    /**
     * Execute a complete turn (may involve multiple reasoning + tool call cycles).
     */
    runTurn(userPrompt: string, options?: {
        signal?: AbortSignal;
        maxSteps?: number;
        model?: string;
    }): AsyncGenerator<DshTurnEvent, Message, void>;
}
//# sourceMappingURL=engine.d.ts.map