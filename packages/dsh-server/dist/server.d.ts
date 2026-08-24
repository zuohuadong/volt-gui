import { DshEngine, type DshConfig, type Message, type ToolAuthorizationBroker } from '@dsh/core';
import { type McpServerConfig } from '@dsh/plugins';
export interface DshServerOptions {
    port?: number;
    host?: string;
    config: DshConfig;
    authToken?: string;
    authorizationBroker?: ToolAuthorizationBroker;
    mcpServers?: McpServerConfig[];
    initialHistory?: Message[];
    persistHistory?: (messages: Message[]) => Promise<void>;
    allowedOrigins?: string[];
    maxRequestBodyBytes?: number;
}
export declare class DshServer {
    private server;
    private engine;
    private pluginManager;
    private options;
    private activeTurn;
    constructor(options: DshServerOptions);
    start(): Promise<string>;
    private handleRequest;
    private applyOriginPolicy;
    private isAuthorized;
    private updateModel;
    private clearHistory;
    private runTurn;
    private writeRequestError;
    stop(): Promise<void>;
    hasActiveTurn(): boolean;
    getEngine(): DshEngine;
}
//# sourceMappingURL=server.d.ts.map