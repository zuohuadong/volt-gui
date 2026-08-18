import type { ToolHandler } from '@dsh/core';
export interface PluginInitContext {
    workingDirectory: string;
    config?: Record<string, unknown>;
    log: (msg: string) => void;
}
export interface DshPlugin {
    name: string;
    version?: string;
    description?: string;
    init?: (context: PluginInitContext) => Promise<void> | void;
    getTools: () => ToolHandler[] | Promise<ToolHandler[]>;
    onPreToolExecute?: (name: string, args: Record<string, unknown>) => Promise<{
        allow: boolean;
        reason?: string;
    } | void>;
    onPostToolExecute?: (name: string, args: Record<string, unknown>, result: {
        output: string;
        isError?: boolean;
    }) => Promise<void>;
    destroy?: () => Promise<void> | void;
}
export interface McpServerConfig {
    name: string;
    command: string;
    args?: string[];
    env?: Record<string, string>;
}
export interface DshPluginConfig {
    plugins?: string[];
    mcpServers?: Record<string, McpServerConfig>;
}
//# sourceMappingURL=types.d.ts.map