import * as http from 'node:http';
import { DshEngine } from '@dsh/core';
import { PluginManager } from '@dsh/plugins';
export class DshServer {
    server = null;
    engine;
    pluginManager;
    options;
    constructor(options) {
        this.options = {
            port: 3210,
            host: '127.0.0.1',
            ...options,
        };
        this.engine = new DshEngine(this.options.config);
        this.pluginManager = new PluginManager(this.options.config.workingDirectory || process.cwd(), (msg) => console.log(`[DSH Server] ${msg}`));
    }
    async start() {
        await this.pluginManager.initializeAll(this.engine);
        this.server = http.createServer(async (req, res) => {
            // Enable CORS for Desktop App / Webview
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
            res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }
            const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
            // 1. Health Check
            if (url.pathname === '/api/health' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    status: 'ok',
                    model: this.engine.getModel(),
                    toolsCount: this.engine.getToolSchemas().length
                }));
                return;
            }
            // 2. Active Model Management
            if (url.pathname === '/api/model' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ model: this.engine.getModel() }));
                return;
            }
            if (url.pathname === '/api/model' && req.method === 'POST') {
                let body = '';
                req.on('data', (chunk) => { body += chunk; });
                req.on('end', () => {
                    try {
                        const data = JSON.parse(body || '{}');
                        if (data.model) {
                            this.engine.setModel(String(data.model));
                            res.writeHead(200, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: true, model: this.engine.getModel() }));
                        }
                        else {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Model name is required' }));
                        }
                    }
                    catch (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
                return;
            }
            // 3. List Tools
            if (url.pathname === '/api/tools' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ tools: this.engine.getToolSchemas() }));
                return;
            }
            // 4. Get History
            if (url.pathname === '/api/history' && req.method === 'GET') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ messages: this.engine.getHistory() }));
                return;
            }
            // 5. Reset Session
            if (url.pathname === '/api/history' && req.method === 'DELETE') {
                this.engine.clearHistory();
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
                return;
            }
            // 6. Run Turn (SSE Stream)
            if (url.pathname === '/api/turn' && req.method === 'POST') {
                let body = '';
                req.on('data', (chunk) => {
                    body += chunk;
                });
                req.on('end', async () => {
                    try {
                        const data = JSON.parse(body || '{}');
                        const prompt = String(data.prompt || '').trim();
                        if (!prompt) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Prompt is required' }));
                            return;
                        }
                        if (data.model) {
                            this.engine.setModel(String(data.model));
                        }
                        res.writeHead(200, {
                            'Content-Type': 'text/event-stream; charset=utf-8',
                            'Cache-Control': 'no-cache',
                            Connection: 'keep-alive',
                        });
                        const sendEvent = (event) => {
                            res.write(`data: ${JSON.stringify(event)}\n\n`);
                        };
                        const abortController = new AbortController();
                        res.on('close', () => {
                            if (!res.writableEnded) {
                                abortController.abort();
                            }
                        });
                        try {
                            for await (const event of this.engine.runTurn(prompt, {
                                signal: abortController.signal,
                                model: data.model ? String(data.model) : undefined
                            })) {
                                sendEvent(event);
                            }
                            res.write('data: [DONE]\n\n');
                            res.end();
                        }
                        catch (err) {
                            sendEvent({ type: 'error', message: err.message });
                            res.end();
                        }
                    }
                    catch (err) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ error: err.message }));
                    }
                });
                return;
            }
            // 404 Not Found
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Not Found' }));
        });
        const port = this.options.port ?? 3210;
        const host = this.options.host || '127.0.0.1';
        return new Promise((resolve, reject) => {
            const server = this.server;
            const onError = (error) => {
                server.off('listening', onListening);
                reject(error);
            };
            const onListening = () => {
                server.off('error', onError);
                const address = server.address();
                const activePort = typeof address === 'object' && address ? address.port : port;
                resolve(`http://${host}:${activePort}`);
            };
            server.once('error', onError);
            server.once('listening', onListening);
            server.listen(port, host);
        });
    }
    async stop() {
        await this.pluginManager.destroy();
        if (this.server) {
            await new Promise((resolve) => {
                this.server.close(() => resolve());
                if (!this.server.listening)
                    resolve();
            });
            this.server = null;
        }
    }
    getEngine() {
        return this.engine;
    }
}
//# sourceMappingURL=server.js.map