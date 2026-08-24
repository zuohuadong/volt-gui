import type { DshEngine, ToolHandler } from '@dsh/core';
import type { DshPlugin, McpServerConfig, PluginInitContext } from './types.js';
import { BuiltinCodingPlugin } from './builtin_coding.js';
import { McpPluginAdapter } from './mcp_adapter.js';

export class PluginManager {
  private plugins: DshPlugin[] = [];
  private workingDir: string;
  private logFn: (msg: string) => void;
  private mcpServers: McpServerConfig[];

  constructor(
    workingDir = process.cwd(),
    logFn = (msg: string) => {},
    options: { mcpServers?: McpServerConfig[] } = {},
  ) {
    this.workingDir = workingDir;
    this.logFn = logFn;
    this.mcpServers = [...(options.mcpServers ?? [])];
  }

  public registerPlugin(plugin: DshPlugin): void {
    this.plugins.push(plugin);
  }

  public async initializeAll(engine: DshEngine): Promise<void> {
    // 1. Always load builtin coding plugin
    const builtin = new BuiltinCodingPlugin();
    this.registerPlugin(builtin);

    // MCP servers are started only from a host-supplied trusted snapshot.
    for (const server of this.mcpServers) {
      this.registerPlugin(new McpPluginAdapter(server));
    }

    // Initialize plugins
    const initContext: PluginInitContext = {
      workingDirectory: this.workingDir,
      log: this.logFn,
    };

    const allTools: ToolHandler[] = [];

    for (const plugin of this.plugins) {
      try {
        if (plugin.init) {
          await plugin.init(initContext);
        }
        const tools = await plugin.getTools();
        allTools.push(...tools);
      } catch (err: any) {
        this.logFn(`Error initializing plugin ${plugin.name}: ${err.message}`);
      }
    }

    engine.registerTools(allTools);
  }


  public async destroy(): Promise<void> {
    for (const p of this.plugins) {
      if (p.destroy) {
        try {
          await p.destroy();
        } catch {
          // Ignore
        }
      }
    }
    this.plugins = [];
  }
}
