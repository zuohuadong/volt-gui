import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { BuiltinCodingPlugin } from './builtin_coding.js';
import { McpPluginAdapter } from './mcp_adapter.js';
export class PluginManager {
    plugins = [];
    workingDir;
    logFn;
    constructor(workingDir = process.cwd(), logFn = (msg) => { }) {
        this.workingDir = workingDir;
        this.logFn = logFn;
    }
    registerPlugin(plugin) {
        this.plugins.push(plugin);
    }
    async initializeAll(engine) {
        // 1. Always load builtin coding plugin
        const builtin = new BuiltinCodingPlugin();
        this.registerPlugin(builtin);
        // 2. Look for .dsh/mcp.json or dsh.plugins.json in workspace
        await this.loadWorkspaceMcpConfig();
        // 3. Initialize plugins
        const initContext = {
            workingDirectory: this.workingDir,
            log: this.logFn,
        };
        const allTools = [];
        for (const plugin of this.plugins) {
            try {
                if (plugin.init) {
                    await plugin.init(initContext);
                }
                const tools = await plugin.getTools();
                allTools.push(...tools);
            }
            catch (err) {
                this.logFn(`Error initializing plugin ${plugin.name}: ${err.message}`);
            }
        }
        engine.registerTools(allTools);
    }
    async loadWorkspaceMcpConfig() {
        const candidatePaths = [
            path.join(this.workingDir, '.dsh', 'mcp.json'),
            path.join(this.workingDir, '.mcp.json'),
            path.join(this.workingDir, 'dsh.plugins.json'),
        ];
        for (const cfgPath of candidatePaths) {
            try {
                const raw = await fs.readFile(cfgPath, 'utf-8');
                const config = JSON.parse(raw);
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
            }
            catch {
                // Config file does not exist or unreadable, continue
            }
        }
    }
    async destroy() {
        for (const p of this.plugins) {
            if (p.destroy) {
                try {
                    await p.destroy();
                }
                catch {
                    // Ignore
                }
            }
        }
        this.plugins = [];
    }
}
//# sourceMappingURL=manager.js.map