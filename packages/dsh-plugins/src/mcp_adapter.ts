import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolHandler, ToolSchema } from '@dsh/core';
import type { DshPlugin, McpServerConfig, PluginInitContext } from './types.js';

export class McpPluginAdapter implements DshPlugin {
  public name: string;
  public description: string;
  private client: Client | null = null;
  private transport: StdioClientTransport | null = null;
  private serverConfig: McpServerConfig;
  private tools: ToolHandler[] = [];

  constructor(serverConfig: McpServerConfig) {
    this.name = `mcp-${serverConfig.name}`;
    this.description = `MCP Server Plugin: ${serverConfig.name}`;
    this.serverConfig = serverConfig;
  }

  public async init(context: PluginInitContext): Promise<void> {
    try {
      const cleanEnv: Record<string, string> = {};
      for (const [k, v] of Object.entries(process.env)) {
        if (typeof v === 'string') cleanEnv[k] = v;
      }
      if (this.serverConfig.env) {
        Object.assign(cleanEnv, this.serverConfig.env);
      }

      this.transport = new StdioClientTransport({
        command: this.serverConfig.command,
        args: this.serverConfig.args || [],
        env: cleanEnv,
      });

      this.client = new Client(
        {
          name: `dsh-client-${this.serverConfig.name}`,
          version: '1.0.0',
        },
        {
          capabilities: {},
        }
      );

      await this.client.connect(this.transport);
      context.log(`Connected to MCP server: ${this.serverConfig.name}`);

      const mcpTools = await this.client.listTools();
      this.tools = mcpTools.tools.map((t) => this.convertMcpTool(t));
      context.log(`Discovered ${this.tools.length} tools from MCP server '${this.serverConfig.name}'`);
    } catch (err: any) {
      context.log(`Failed to connect to MCP server '${this.serverConfig.name}': ${err.message}`);
    }
  }

  private convertMcpTool(mcpTool: any): ToolHandler {
    const schema: ToolSchema = {
      name: `${this.serverConfig.name}_${mcpTool.name}`,
      description: mcpTool.description || `Tool provided by ${this.serverConfig.name}`,
      parameters: (mcpTool.inputSchema as any) || {
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

          const texts = (result.content as any[])
            ?.filter((c) => c.type === 'text')
            ?.map((c) => c.text)
            ?.join('\n');

          return {
            output: texts || JSON.stringify(result.content),
            isError: Boolean(result.isError),
          };
        } catch (err: any) {
          return { output: `MCP tool execution failed: ${err.message}`, isError: true };
        }
      },
    };
  }

  public getTools(): ToolHandler[] {
    return this.tools;
  }

  public async destroy(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
  }
}
