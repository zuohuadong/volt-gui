#!/usr/bin/env node
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import pc from 'picocolors';
import { DshEngine } from '@dsh/core';
import { PluginManager } from '@dsh/plugins';
import { DshServer } from '@dsh/server';
function printBanner() {
    console.log(pc.cyan(`
  ╔══════════════════════════════════════════════════════════════════╗
  ║                 DSH — DeepSeek Harness Core                      ║
  ║  Fast • 64-Token Cache Aligned • Dual-Stream • MCP Plugin Native ║
  ╚══════════════════════════════════════════════════════════════════╝
`));
}
async function main() {
    const args = process.argv.slice(2);
    // Check if user requested server mode
    if (args.includes('--server') || args.includes('-s')) {
        const portIdx = args.indexOf('--port');
        const port = portIdx >= 0 ? parseInt(args[portIdx + 1], 10) : 3210;
        const server = new DshServer({
            port,
            config: {
                model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
                apiKey: process.env.DEEPSEEK_API_KEY,
                baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
            },
        });
        const url = await server.start();
        console.log(pc.green(`🚀 DSH Protocol Server listening at ${url}`));
        console.log(pc.gray(`   Desktop Svelte App and API clients can connect directly.`));
        return;
    }
    printBanner();
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) {
        console.log(pc.yellow(`⚠️  DEEPSEEK_API_KEY is not set in your environment.`));
        console.log(pc.gray(`   You can set it with: export DEEPSEEK_API_KEY="your-key"\n`));
    }
    const model = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
    const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
    console.log(pc.gray(`  • Model:       ${pc.white(model)}`));
    console.log(pc.gray(`  • Endpoint:    ${pc.white(baseURL)}`));
    console.log(pc.gray(`  • Working Dir: ${pc.white(process.cwd())}\n`));
    const engine = new DshEngine({
        model,
        baseURL,
        apiKey,
        workingDirectory: process.cwd(),
    });
    const pluginManager = new PluginManager(process.cwd(), (msg) => {
        console.log(pc.gray(`[Plugin] ${msg}`));
    });
    await pluginManager.initializeAll(engine);
    const tools = engine.getToolSchemas();
    console.log(pc.green(`✓ Registered ${tools.length} tools (Builtin + MCP plugins)\n`));
    const rl = readline.createInterface({ input, output });
    console.log(pc.dim(`Type your task or question below. Type /help for slash commands, /exit to quit.\n`));
    while (true) {
        try {
            const prompt = await rl.question(pc.cyan('dsh ❯ '));
            const trimmed = prompt.trim();
            if (!trimmed)
                continue;
            if (trimmed === '/exit' || trimmed === 'exit' || trimmed === 'quit') {
                console.log(pc.gray('Goodbye!'));
                break;
            }
            if (trimmed === '/help') {
                console.log(pc.yellow(`
Available Commands:
  /tools     - List all registered tools & schemas
  /clear     - Clear session conversation history
  /help      - Show this help message
  /exit      - Exit DSH CLI
`));
                continue;
            }
            if (trimmed === '/tools') {
                console.log(pc.yellow(`\nRegistered Tools (${tools.length}):`));
                for (const t of engine.getToolSchemas()) {
                    console.log(`  ${pc.bold(pc.white(t.name))}: ${pc.gray(t.description)}`);
                }
                console.log();
                continue;
            }
            if (trimmed === '/clear') {
                engine.clearHistory();
                console.log(pc.green('✓ Session history cleared.\n'));
                continue;
            }
            // Execute turn
            let isThinking = false;
            let startTime = Date.now();
            for await (const event of engine.runTurn(trimmed)) {
                switch (event.type) {
                    case 'reasoning_delta':
                        if (!isThinking) {
                            isThinking = true;
                            process.stdout.write(pc.dim('\n🧠 Thinking...\n'));
                        }
                        process.stdout.write(pc.dim(pc.italic(event.delta)));
                        break;
                    case 'content_delta':
                        if (isThinking) {
                            isThinking = false;
                            process.stdout.write('\n\n');
                        }
                        process.stdout.write(event.delta);
                        break;
                    case 'tool_exec_start':
                        if (isThinking) {
                            isThinking = false;
                            process.stdout.write('\n\n');
                        }
                        console.log(pc.yellow(`\n⚡ Tool [${event.name}] running with args: ${JSON.stringify(event.args)}`));
                        break;
                    case 'tool_exec_result':
                        const status = event.isError ? pc.red('FAILED') : pc.green('OK');
                        const preview = event.output.length > 200 ? event.output.slice(0, 200) + '...' : event.output;
                        console.log(pc.gray(`  └─ [${status}] ${preview}`));
                        break;
                    case 'cache_diagnostics':
                        const ratio = (event.diagnostics.cacheHitRatio * 100).toFixed(1);
                        process.stdout.write(pc.dim(` [Cache: ${ratio}% hit | ${event.diagnostics.cachedTokens} tokens]`));
                        break;
                    case 'turn_complete':
                        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
                        console.log(pc.dim(`\n\n✓ Turn completed in ${elapsed}s\n`));
                        break;
                }
            }
        }
        catch (err) {
            console.log(pc.red(`\nError: ${err.message}\n`));
        }
    }
    await pluginManager.destroy();
    rl.close();
}
main().catch((err) => {
    console.error(pc.red(`Fatal: ${err.message}`));
    process.exit(1);
});
//# sourceMappingURL=bin.js.map