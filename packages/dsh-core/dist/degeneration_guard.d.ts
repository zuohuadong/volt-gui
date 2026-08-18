/**
 * Degeneration Guard for DeepSeek Streaming
 * Prevents model degeneration loops (such as infinite repeating CJK characters
 * or repeating short phrase patterns).
 */
export declare class DegenerationGuard {
    private history;
    private lastChar;
    private charRun;
    private inCodeFence;
    private backtickRun;
    private observedChars;
    observe(delta: string): {
        degenerated: boolean;
        reason: string;
        count: number;
    };
    private observeFence;
    private appendChar;
    private recentlyClosedCodeFence;
    private checkRepeatedPattern;
    reset(): void;
}
//# sourceMappingURL=degeneration_guard.d.ts.map