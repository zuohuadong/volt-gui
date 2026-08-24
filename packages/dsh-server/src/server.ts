import { timingSafeEqual } from 'node:crypto';
import * as http from 'node:http';
import { DshEngine, type DshConfig, type Message, type ToolAuthorizationBroker } from '@dsh/core';
import { PluginManager, type McpServerConfig } from '@dsh/plugins';

const DEFAULT_MAX_REQUEST_BODY_BYTES = 1024 * 1024;
const SERVER_CLOSE_GRACE_MS = 1000;

export interface DshServerOptions {
  port?: number;
  host?: string;
  config: DshConfig;
  authToken?: string;
  authorizationBroker?: ToolAuthorizationBroker;
  mcpServers?: McpServerConfig[];
  initialHistory?: Message[];
  persistHistory?: (messages: Message[]) => Promise<void>;
  allowedOrigins?: string[];
  maxRequestBodyBytes?: number;
}

class HttpRequestError extends Error {
  constructor(public readonly statusCode: number, message: string) {
    super(message);
  }
}

function writeJson(res: http.ServerResponse, statusCode: number, payload: unknown): void {
  if (res.writableEnded) return;
  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function bearerTokenMatches(header: string | string[] | undefined, authToken: string): boolean {
  const actual = Array.isArray(header) ? header[0] ?? '' : header ?? '';
  const actualBytes = Buffer.from(actual);
  const expectedBytes = Buffer.from(`Bearer ${authToken}`);
  return actualBytes.length === expectedBytes.length && timingSafeEqual(actualBytes, expectedBytes);
}

async function readJsonObject(req: http.IncomingMessage, maxBytes: number): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let receivedBytes = 0;

  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += bytes.length;
    if (receivedBytes > maxBytes) {
      throw new HttpRequestError(413, `Request body exceeds ${maxBytes} bytes`);
    }
    chunks.push(bytes);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpRequestError(400, 'Request body must be valid JSON');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpRequestError(400, 'Request body must be a JSON object');
  }
  return parsed as Record<string, unknown>;
}

async function closeHttpServer(server: http.Server): Promise<void> {
  if (!server.listening) return;

  await new Promise<void>((resolve, reject) => {
    const forceClose = setTimeout(() => server.closeAllConnections(), SERVER_CLOSE_GRACE_MS);
    server.close((error) => {
      clearTimeout(forceClose);
      if (error) reject(error);
      else resolve();
    });
    server.closeIdleConnections();
  });
}

export class DshServer {
  private server: http.Server | null = null;
  private engine: DshEngine;
  private pluginManager: PluginManager;
  private options: DshServerOptions;
  private activeTurn = false;
  private acceptingTurns = true;

  constructor(options: DshServerOptions) {
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
    this.pluginManager = new PluginManager(
      this.options.config.workingDirectory || process.cwd(),
      (message) => console.log(`[DSH Server] ${message}`),
      { mcpServers: this.options.mcpServers },
    );
  }

  public async start(): Promise<string> {
    await this.pluginManager.initializeAll(this.engine);
    this.server = http.createServer((req, res) => {
      void this.handleRequest(req, res).catch((error: unknown) => this.writeRequestError(res, error));
    });

    const port = this.options.port ?? 3210;
    const host = this.options.host || '127.0.0.1';
    return new Promise((resolve, reject) => {
      const server = this.server!;
      const onError = (error: Error) => {
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

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.applyOriginPolicy(req, res)) return;
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

  private applyOriginPolicy(req: http.IncomingMessage, res: http.ServerResponse): boolean {
    const origin = typeof req.headers.origin === 'string' ? req.headers.origin : '';
    if (!origin) return true;
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

  private isAuthorized(req: http.IncomingMessage): boolean {
    return !this.options.authToken || bearerTokenMatches(req.headers.authorization, this.options.authToken);
  }

  private async updateModel(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await readJsonObject(req, this.options.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES);
    if (typeof body.model !== 'string' || !body.model.trim()) {
      throw new HttpRequestError(400, 'Model name is required');
    }
    this.engine.setModel(body.model.trim());
    writeJson(res, 200, { success: true, model: this.engine.getModel() });
  }

  private async clearHistory(res: http.ServerResponse): Promise<void> {
    if (this.activeTurn) throw new HttpRequestError(409, 'A turn is currently active');
    const snapshot = this.engine.getHistory();
    this.engine.clearHistory();
    try {
      await this.options.persistHistory?.([]);
      writeJson(res, 200, { success: true });
    } catch (error) {
      this.engine.setHistory(snapshot);
      throw error;
    }
  }

  private async runTurn(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    if (!this.acceptingTurns) throw new HttpRequestError(409, 'The runtime is changing configuration');
    if (this.activeTurn) throw new HttpRequestError(409, 'A turn is already active');
    this.activeTurn = true;
    const modelSnapshot = this.engine.getModel();
    let modelChanged = false;
    let turnSucceeded = false;

    try {
      const body = await readJsonObject(req, this.options.maxRequestBodyBytes ?? DEFAULT_MAX_REQUEST_BODY_BYTES);
      const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
      if (!prompt) throw new HttpRequestError(400, 'Prompt is required');

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
      const sendEvent = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`);
      const abortController = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) abortController.abort();
      });

      try {
        for await (const event of this.engine.runTurn(prompt, { signal: abortController.signal, model })) {
          sendEvent(event);
        }
        await this.options.persistHistory?.(this.engine.getHistory());
        turnSucceeded = true;
        res.write('data: [DONE]\n\n');
      } catch (error: unknown) {
        this.engine.setHistory(historySnapshot);
        const message = error instanceof Error ? error.message : String(error);
        sendEvent({ type: 'error', message });
      }
      res.end();
    } finally {
      if (modelChanged && !turnSucceeded) this.engine.setModel(modelSnapshot);
      this.activeTurn = false;
    }
  }

  private writeRequestError(res: http.ServerResponse, error: unknown): void {
    if (res.headersSent) {
      if (!res.writableEnded) res.end();
      return;
    }
    const statusCode = error instanceof HttpRequestError ? error.statusCode : 500;
    const message = error instanceof HttpRequestError ? error.message : 'Internal Server Error';
    writeJson(res, statusCode, { error: message });
  }

  public async stop(): Promise<void> {
    const server = this.server;
    this.server = null;
    try {
      if (server) await closeHttpServer(server);
    } finally {
      await this.pluginManager.destroy();
    }
  }

  public hasActiveTurn(): boolean {
    return this.activeTurn;
  }

  public suspendNewTurns(): boolean {
    if (this.activeTurn) return false;
    this.acceptingTurns = false;
    return true;
  }

  public resumeNewTurns(): void {
    this.acceptingTurns = true;
  }

  public getEngine(): DshEngine {
    return this.engine;
  }
}
