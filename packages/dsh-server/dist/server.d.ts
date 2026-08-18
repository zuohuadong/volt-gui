import { DshEngine, type DshConfig } from '@dsh/core';
export interface DshServerOptions {
    port?: number;
    host?: string;
    config: DshConfig;
}
export declare class DshServer {
    private server;
    private engine;
    private pluginManager;
    private options;
    constructor(options: DshServerOptions);
    start(): Promise<string>;
    stop(): Promise<void>;
    getEngine(): DshEngine;
}
//# sourceMappingURL=server.d.ts.map