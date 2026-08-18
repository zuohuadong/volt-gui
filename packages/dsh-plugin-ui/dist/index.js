/**
 * @volt/dsh-plugin-ui - Anyong Workbench UI Cordis Plugin for DeepSeek Harness (DSH)
 * Fuses Anyong Svelte Desktop Workbench capabilities with official DSH web services.
 */
export const name = 'anyong-workbench-ui';
/**
 * Cordis plugin apply method for DeepSeek Harness runtime
 */
export function apply(ctx, config = {}) {
    const mergedConfig = {
        brandName: '西谷智灯暗涌系统 (Anyong)',
        theme: 'dark',
        enableDiffView: true,
        enableThinkingAnimation: true,
        intranetMode: true,
        ...config,
    };
    // Register custom routes or API endpoints into DSH HTTP/API Gateway
    if (ctx.router) {
        ctx.router.get('/api/anyong/brand', (req, res) => {
            res.json({
                brandName: mergedConfig.brandName,
                theme: mergedConfig.theme,
                intranetMode: mergedConfig.intranetMode,
                version: '1.0.0-dsh',
            });
        });
        ctx.router.get('/api/anyong/features', (req, res) => {
            res.json({
                diffView: mergedConfig.enableDiffView,
                thinkingAnimation: mergedConfig.enableThinkingAnimation,
                mcpIntegrated: true,
                cacheAligned: true,
            });
        });
    }
    // Hook into DSH turn lifecycle events for telemetry & diff tracking
    if (ctx.on) {
        ctx.on('turn/start', (turn) => {
            // Broadcast to Anyong UI frontends
        });
        ctx.on('turn/end', (turn) => {
            // Sync completed mutations with diff viewer
        });
    }
}
export default apply;
//# sourceMappingURL=index.js.map