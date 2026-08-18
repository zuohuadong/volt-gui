/**
 * Anyong UI Client Runtime Bridge
 * Connects frontend UI components to DSH backend services and official DSH slots.
 */
export interface DshUiState {
    sessionId: string;
    activeTurnId: string | null;
    isStreaming: boolean;
    thinking: string;
    content: string;
    toolsExecuting: string[];
    diffs: Array<{
        file: string;
        patch: string;
    }>;
    tokenUsage: {
        prompt: number;
        completion: number;
        cacheHitRatio: number;
    };
}
export declare class AnyongDshClient {
    private endpoint;
    constructor(endpoint?: string);
    getBrandInfo(): Promise<any>;
    getSessionOverview(sessionId: string): Promise<any>;
}
//# sourceMappingURL=client.d.ts.map