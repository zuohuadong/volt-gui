/**
 * @volt/dsh-plugin-ui - Anyong Workbench UI Cordis Plugin for DeepSeek Harness (DSH)
 * Fuses Anyong Svelte Desktop Workbench capabilities with official DSH web services.
 */
export interface AnyongUiConfig {
    brandName?: string;
    theme?: 'dark' | 'light' | 'system';
    enableDiffView?: boolean;
    enableThinkingAnimation?: boolean;
    intranetMode?: boolean;
}
export declare const name = "anyong-workbench-ui";
/**
 * Cordis plugin apply method for DeepSeek Harness runtime
 */
export declare function apply(ctx: any, config?: AnyongUiConfig): void;
export default apply;
//# sourceMappingURL=index.d.ts.map