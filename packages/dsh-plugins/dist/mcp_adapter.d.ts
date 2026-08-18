import type { ToolHandler } from '@dsh/core';
import type { DshPlugin, McpServerConfig, PluginInitContext } from './types.js';
export declare class McpPluginAdapter implements DshPlugin {
    name: string;
    description: string;
    private client;
    private transport;
    private serverConfig;
    private tools;
    constructor(serverConfig: McpServerConfig);
    init(context: PluginInitContext): Promise<void>;
    private convertMcpTool;
    getTools(): ToolHandler[];
    destroy(): Promise<void>;
}
//# sourceMappingURL=mcp_adapter.d.ts.map