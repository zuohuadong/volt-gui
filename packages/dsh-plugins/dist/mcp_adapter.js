import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
export class McpPluginAdapter {
    name;
    description;
    client = null;
    transport = null;
    serverConfig;
    tools = [];
    constructor(serverConfig) {
        this.name = `mcp-${serverConfig.name}`;
        this.description = `MCP Server Plugin: ${serverConfig.name}`;
        this.serverConfig = serverConfig;
    }
    async init(context) {
        try {
            const cleanEnv = {};
            for (const [k, v] of Object.entries(process.env)) {
                if (typeof v === 'string')
                    cleanEnv[k] = v;
            }
            if (this.serverConfig.env) {
                Object.assign(cleanEnv, this.serverConfig.env);
            }
            this.transport = new StdioClientTransport({
                command: this.serverConfig.command,
                args: this.serverConfig.args || [],
                env: cleanEnv,
            });
            this.client = new Client({
                name: `dsh-client-${this.serverConfig.name}`,
                version: '1.0.0',
            }, {
                capabilities: {},
            });
            await this.client.connect(this.transport);
            context.log(`Connected to MCP server: ${this.serverConfig.name}`);
            const mcpTools = await this.client.listTools();
            this.tools = mcpTools.tools.map((t) => this.convertMcpTool(t));
            context.log(`Discovered ${this.tools.length} tools from MCP server '${this.serverConfig.name}'`);
        }
        catch (err) {
            context.log(`Failed to connect to MCP server '${this.serverConfig.name}': ${err.message}`);
        }
    }
    convertMcpTool(mcpTool) {
        const schema = {
            name: `${this.serverConfig.name}_${mcpTool.name}`,
            description: mcpTool.description || `Tool provided by ${this.serverConfig.name}`,
            parameters: mcpTool.inputSchema || {
                type: 'object',
                properties: {},
            },
        };
        return {
            schema,
            execute: async (args) => {
                if (!this.client) {
                    return { output: `MCP client for ${this.serverConfig.name} is not connected`, isError: true };
                }
                try {
                    const result = await this.client.callTool({
                        name: mcpTool.name,
                        arguments: args,
                    });
                    const texts = result.content
                        ?.filter((c) => c.type === 'text')
                        ?.map((c) => c.text)
                        ?.join('\n');
                    return {
                        output: texts || JSON.stringify(result.content),
                        isError: Boolean(result.isError),
                    };
                }
                catch (err) {
                    return { output: `MCP tool execution failed: ${err.message}`, isError: true };
                }
            },
        };
    }
    getTools() {
        return this.tools;
    }
    async destroy() {
        if (this.client) {
            await this.client.close();
            this.client = null;
        }
    }
}
//# sourceMappingURL=mcp_adapter.js.map