import type { DshEngine } from '@dsh/core';
import type { DshPlugin } from './types.js';
export declare class PluginManager {
    private plugins;
    private workingDir;
    private logFn;
    constructor(workingDir?: string, logFn?: (msg: string) => void);
    registerPlugin(plugin: DshPlugin): void;
    initializeAll(engine: DshEngine): Promise<void>;
    private loadWorkspaceMcpConfig;
    destroy(): Promise<void>;
}
//# sourceMappingURL=manager.d.ts.map