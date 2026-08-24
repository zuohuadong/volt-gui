import { BuiltinCodingPlugin } from './builtin_coding.js';
import { McpPluginAdapter } from './mcp_adapter.js';
export class PluginManager {
    plugins = [];
    workingDir;
    logFn;
    mcpServers;
    constructor(workingDir = process.cwd(), logFn = (msg) => { }, options = {}) {
        this.workingDir = workingDir;
        this.logFn = logFn;
        this.mcpServers = [...(options.mcpServers ?? [])];
    }
    registerPlugin(plugin) {
        this.plugins.push(plugin);
    }
    async initializeAll(engine) {
        // 1. Always load builtin coding plugin
        const builtin = new BuiltinCodingPlugin();
        this.registerPlugin(builtin);
        // MCP servers are started only from a host-supplied trusted snapshot.
        for (const server of this.mcpServers) {
            this.registerPlugin(new McpPluginAdapter(server));
        }
        // Initialize plugins
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