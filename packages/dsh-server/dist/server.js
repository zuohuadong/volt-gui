import { timingSafeEqual } from 'node:crypto';
import * as http from 'node:http';
import { DshEngine } from '@dsh/core';
import { PluginManager } from '@dsh/plugins';
const DEFAULT_MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const SERVER_CLOSE_GRACE_MS = 1000;
class HttpRequestError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}
function writeJson(res, statusCode, payload) {
    if (res.writableEnded)
        return;
    res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
}
function bearerTokenMatches(header, authToken) {
    const actual = Array.isArray(header) ? header[0] ?? '' : header ?? '';
    const actualBytes = Buffer.from(actual);
    const expectedBytes = Buffer.from(`Bearer ${authToken}`);
    return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}
async function readJsonObject(req, maxBytes) {
    const chunks = [];
    let receivedBytes = 0;
    for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        receivedBytes += bytes.length;
        if (receivedBytes > maxBytes) {
            throw new HttpRequestError(413, `Request body exceeds ${maxBytes} bytes`);
        }
        chunks.push(bytes);
    }
    let parsed;
    try {
        parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
    }
    catch {
        throw new HttpRequestError(400, 'Request body must be valid JSON');
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new HttpRequestError(400, 'Request body must be a JSON object');
    }
    return parsed;
}
async function closeHttpServer(server) {
    if (!server.listening)
        return;
    await new Promise((resolve, reject) => {
        const forceClose = setTimeout(() => server.closeAllConnections(), SERVER_CLOSE_GRACE_MS);
        server.close((error) => {
            clearTimeout(forceClose);
            if (error)
                reject(error);
            else
                resolve();
        });
        server.closeIdleConnections();
    });
}
export class DshServer {
    server = null;
    engine;
    pluginManager;
    options;
    activeTurn = false;
    acceptingTurns = true;
    constructor(options) {
        this.options = {
            port: 3210,
            host: '127.0.0.1',
            maxRequestBodyBytes: DEFAULT_MAX_REQUEST_BODY_BYTES,
            ...options,
            allowedOrigins: [...(options.allowedOrigins ?? [])],
        };
        this.engine = new DshEngine({
            ...this.options.config,
            authorizationBroker: this.options.authorizationBroker,
        });
        this.engine.setHistory(this.options.initialHistory ?? []);
        this.pluginManager = new PluginManager(this.options.config.workingDirectory || process.cwd(), (message) => console.log(`[DSH Server] ${message}`), { mcpServers: this.options.mcpServers });
    }
    async start() {
        await this.pluginManager.initializeAll(this.engine);
        this.server = http.createServer((req, res) => {
            void this.handleRequest(req, res).catch((error) => this.writeRequestError(res, error));
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
    async handleRequest(req, res) {
        if (!this.applyOriginPolicy(req, res))
            return;
        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }
        if (!this.isAuthorized(req)) {
            writeJson(res, 401, { error: 'Unauthorized' });
            return;
        }
        const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
        if (url.pathname === '/api/health' && req.method === 'GET') {
            writeJson(res, 200, {
                status: 'ok',
                model: this.engine.getModel(),
                toolsCount: this.engine.getToolSchemas().length,
            });
            return;
        }
        if (url.pathname === '/api/model' && req.method === 'GET') {
            writeJson(res, 200, { model: this.engine.getModel() });
            return;
        }
        if (url.pathname === '/api/model' && req.method === 'POST') {
            await this.updateModel(req, res);
            return;
        }
        if (url.pathname === '/api/tools' && req.method === 'GET') {
            writeJson(res, 200, { tools: this.engine.getToolSchemas() });
            return;
        }
        if (url.pathname === '/api/history' && req.method === 'GET') {
            writeJson(res, 200, { messages: this.engine.getHistory() });
            return;
        }
        if (url.pathname === '/api/history' && req.method === 'DELETE') {
            await this.clearHistory(res);
            return;
        }
        if (url.pathname === '/api/turn' && req.method === 'POST') {
            await this.runTurn(req, res);
            return;
        }
        writeJson(res, 404, { error: 'Not Found' });
    }
    applyOriginPolicy(req, res) {
        const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
        if (!origin)
            return true;
        if (!this.options.allowedOrigins?.includes(origin)) {
            writeJson(res, 403, { error: 'Origin is not allowed' });
            return false;
        }
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, DELETE');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
        res.setHeader('Vary', 'Origin');
        return true;
    }
    isAuthorized(req) {
        return !this.options.authToken || bearerTokenMatches(req.headers.authorization, this.options.authToken);
    }
    async updateModel(req, res) {
        const body = await readJsonObject(req, this.options.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES);
        if (typeof body.model !== 'string' || !body.model.trim()) {
            throw new HttpRequestError(400, 'Model name is required');
        }
        this.engine.setModel(body.model.trim());
        writeJson(res, 200, { success: true, model: this.engine.getModel() });
    }
    async clearHistory(res) {
        if (this.activeTurn)
            throw new HttpRequestError(409, 'A turn is currently active');
        const snapshot = this.engine.getHistory();
        this.engine.clearHistory();
        try {
            await this.options.persistHistory?.([]);
            writeJson(res, 200, { success: true });
        }
        catch (error) {
            this.engine.setHistory(snapshot);
            throw error;
        }
    }
    async runTurn(req, res) {
        if (!this.acceptingTurns)
            throw new HttpRequestError(409, 'The runtime is changing configuration');
        if (this.activeTurn)
            throw new HttpRequestError(409, 'A turn is already active');
        this.activeTurn = true;
        const modelSnapshot = this.engine.getModel();
        let modelChanged = false;
        let turnSucceeded = false;
        try {
            const body = await readJsonObject(req, this.options.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES);
            const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
            if (!prompt)
                throw new HttpRequestError(400, 'Prompt is required');
            const model = typeof body.model === 'string' && body.model.trim() ? body.model.trim() : undefined;
            if (model && model !== modelSnapshot) {
                this.engine.setModel(model);
                modelChanged = true;
            }
            const historySnapshot = this.engine.getHistory();
            res.writeHead(200, {
                'Content-Type': 'text/event-stream; charset=utf-8',
                'Cache-Control': 'no-cache',
                Connection: 'keep-alive',
            });
            const sendEvent = (event) => res.write(`data: ${JSON.stringify(event)}\n\n`);
            const abortController = new AbortController();
            res.on('close', () => {
                if (!res.writableEnded)
                    abortController.abort();
            });
            try {
                for await (const event of this.engine.runTurn(prompt, { signal: abortController.signal, model })) {
                    sendEvent(event);
                }
                await this.options.persistHistory?.(this.engine.getHistory());
                turnSucceeded = true;
                res.write('data: [DONE]\n\n');
            }
            catch (error) {
                this.engine.setHistory(historySnapshot);
                const message = error instanceof Error ? error.message : String(error);
                sendEvent({ type: 'error', message });
            }
            res.end();
        }
        finally {
            if (modelChanged && !turnSucceeded)
                this.engine.setModel(modelSnapshot);
            this.activeTurn = false;
        }
    }
    writeRequestError(res, error) {
        if (res.headersSent) {
            if (!res.writableEnded)
                res.end();
            return;
        }
        const statusCode = error instanceof HttpRequestError ? error.statusCode : 500;
        const message = error instanceof HttpRequestError ? error.message : 'Internal Server Error';
        writeJson(res, statusCode, { error: message });
    }
    async stop() {
        const server = this.server;
        this.server = null;
        try {
            if (server)
                await closeHttpServer(server);
        }
        finally {
            await this.pluginManager.destroy();
        }
    }
    hasActiveTurn() {
        return this.activeTurn;
    }
    suspendNewTurns() {
        if (this.activeTurn)
            return false;
        this.acceptingTurns = false;
        return true;
    }
    resumeNewTurns() {
        this.acceptingTurns = true;
    }
    getEngine() {
        return this.engine;
    }
}
//# sourceMappingURL=server.js.map