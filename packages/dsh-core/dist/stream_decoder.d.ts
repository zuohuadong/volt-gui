import type { DshTurnEvent, ToolCall } from './types.js';
export interface StreamCallbacks {
    onEvent: (event: DshTurnEvent) => void;
}
export declare class StreamDecoder {
    private thinkSplitter;
    private degenGuard;
    private accumulatedReasoning;
    private accumulatedContent;
    private pendingToolCalls;
    private enableDegenerationGuard;
    constructor(enableDegenerationGuard?: boolean);
    processChunk(chunk: any, callbacks: StreamCallbacks): void;
    finalize(callbacks: StreamCallbacks): {
        reasoningContent: string;
        content: string;
        toolCalls: ToolCall[];
    };
    reset(): void;
}
//# sourceMappingURL=stream_decoder.d.ts.map