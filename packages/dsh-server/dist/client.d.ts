import type { Message, ToolSchema } from '@dsh/core';
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
export declare class DshClient {
    private baseUrl;
    constructor(baseUrl?: string);
    getHealth(): Promise<{
        status: string;
        model: string;
        toolsCount: number;
    }>;
    listTools(): Promise<{
        tools: ToolSchema[];
    }>;
    getHistory(): Promise<{
        messages: Message[];
    }>;
    clearHistory(): Promise<void>;
    runTurn(prompt: string, callbacks: DshClientCallbacks, signal?: AbortSignal): Promise<void>;
}
//# sourceMappingURL=client.d.ts.map