import { DshEngine, type DshConfig } from '@dsh/core';
export interface DshServerOptions {
    port?: number;
    host?: string;
    config: DshConfig;
    authToken?: string;
    allowedOrigins?: string[];
    maxRequestBodyBytes?: number;
}
export declare class DshServer {
    private server;
    private engine;
    private pluginManager;
    private options;
    constructor(options: DshServerOptions);
    start(): Promise<string>;
    private handleRequest;
    private applyOriginPolicy;
    private isAuthorized;
    private updateModel;
    private runTurn;
    private writeRequestError;
    stop(): Promise<void>;
    getEngine(): DshEngine;
}
//# sourceMappingURL=server.d.ts.map