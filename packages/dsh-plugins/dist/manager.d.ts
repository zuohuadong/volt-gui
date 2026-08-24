import type { DshEngine } from '@dsh/core';
import type { DshPlugin, McpServerConfig } from './types.js';
export declare class PluginManager {
    private plugins;
    private workingDir;
    private logFn;
    private mcpServers;
    constructor(workingDir?: string, logFn?: (msg: string) => void, options?: {
        mcpServers?: McpServerConfig[];
    });
    registerPlugin(plugin: DshPlugin): void;
    initializeAll(engine: DshEngine): Promise<void>;
    destroy(): Promise<void>;
}
//# sourceMappingURL=manager.d.ts.map