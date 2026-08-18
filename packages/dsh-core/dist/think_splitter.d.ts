/**
 * ThinkSplitter extracts inline `<think>...</think>` blocks from the content stream
 * into explicit reasoning text deltas.
 */
export declare class ThinkSplitter {
    private state;
    private buffer;
    push(chunk: string): {
        reasoning: string;
        content: string;
    };
    private scanClose;
    flush(): {
        reasoning: string;
        content: string;
    };
    private drainPassthrough;
    private markerSuffixLen;
    reset(): void;
}
//# sourceMappingURL=think_splitter.d.ts.map