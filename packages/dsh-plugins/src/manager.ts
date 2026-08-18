import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { DshEngine, ToolHandler } from '@dsh/core';
import type { DshPlugin, DshPluginConfig, PluginInitContext } from './types.js';
import { BuiltinCodingPlugin } from './builtin_coding.js';
import { McpPluginAdapter } from './mcp_adapter.js';

export class PluginManager {
  private plugins: DshPlugin[] = [];
  private workingDir: string;
  private logFn: (msg: string) => void;

  constructor(workingDir = process.cwd(), logFn = (msg: string) => {}) {
    this.workingDir = workingDir;
    this.logFn = logFn;
  }

  public registerPlugin(plugin: DshPlugin): void {
    this.plugins.push(plugin);
  }

  public async initializeAll(engine: DshEngine): Promise<void> {
    // 1. Always load builtin coding plugin
    const builtin = new BuiltinCodingPlugin();
    this.registerPlugin(builtin);

    // 2. Look for .dsh/mcp.json or dsh.plugins.json in workspace
    await this.loadWorkspaceMcpConfig();

    // 3. Initialize plugins
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

  private async loadWorkspaceMcpConfig(): Promise<void> {
    const candidatePaths = [
      path.join(this.workingDir, '.dsh', 'mcp.json'),
      path.join(this.workingDir, '.mcp.json'),
      path.join(this.workingDir, 'dsh.plugins.json'),
    ];

    for (const cfgPath of candidatePaths) {
      try {
        const raw = await fs.readFile(cfgPath, 'utf-8');
        const config: DshPluginConfig = JSON.parse(raw);

        if (config.mcpServers) {
          for (const [name, srv] of Object.entries(config.mcpServers)) {
            const adapter = new McpPluginAdapter({
              name,
              command: srv.command,
              args: srv.args,
              env: srv.env,
            });
            this.registerPlugin(adapter);
          }
        }
      } catch {
        // Config file does not exist or unreadable, continue
      }
    }
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
