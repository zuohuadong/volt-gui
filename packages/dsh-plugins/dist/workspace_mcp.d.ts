import type { McpServerConfig } from './types.js';
export interface DiscoveredMcpConfig {
    root: string;
    fingerprint: string;
    files: string[];
    servers: McpServerConfig[];
}
export declare function validateMcpConfig(value: unknown): Array<Omit<McpServerConfig, "workspaceRoot">>;
export declare function discoverWorkspaceMcp(root: string): Promise<DiscoveredMcpConfig>;
export declare function buildMcpEnvironment(processEnv: NodeJS.ProcessEnv, declaredEnv?: Record<string, string>): Record<string, string>;
//# sourceMappingURL=workspace_mcp.d.ts.map