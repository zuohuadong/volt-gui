import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, rename, rm } from "node:fs/promises";
import WebSocket, { type RawData } from "ws";
import { DesktopErrorCode, desktopError } from "./desktop-error.ts";

type RpcSuccess = { ok: true; value?: unknown };
type RpcFailure = { ok: false; error: { code: string; message: string; details: Record<string, unknown> } };
type RpcResult = RpcSuccess | RpcFailure;
const AUTHENTICATION_RETRY_COUNT = 8;
const AUTHENTICATION_RETRY_DELAY_MS = 250;
const MCP_APPS_PATHS = new Set([
  "/api/mcp-apps/catalog",
  "/api/mcp-apps/view",
  "/api/mcp-apps/tool",
  "/api/mcp-apps/model-context",
  "/api/mcp-apps/resource",
]);
const MAX_MULTIPART_RESPONSE_BYTES = 64 * 1024 * 1024;
const MAX_MULTIPART_ATTACHMENT_BYTES = 32 * 1024 * 1024;
const MAX_MULTIPART_ATTACHMENTS = 32;
const MAX_MULTIPART_PATH_DEPTH = 32;

export type DshRemoteEvent =
  | { type: "ready"; clientId: string; host: { home: string } }
  | { type: "emit"; event: string; args: unknown[] }
  | { type: "waterfall"; event: string; eventId: string; agentId: string; request: Record<string, unknown> }
  | { type: "cancel"; eventId: string };

export type DshRemoteStream = AsyncIterable<unknown>;

export type DshTransportKind = "loopback";

export interface DshCarrier {
  readonly transport: DshTransportKind;
  readonly cleanOrigin: string | undefined;
  readonly currentEventClientId: string;
  readonly currentEventGeneration: number;
  readonly currentHostHome: string;
  authenticate(signal?: AbortSignal): Promise<void>;
  call(endpoint: string, args?: Record<string, unknown>, signal?: AbortSignal): Promise<unknown>;
  mcpAppsRequest(path: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<unknown>;
  exportSession(sessionId: string, selectedPath: string): Promise<void>;
  openStream(endpoint: string, args: Record<string, unknown>, signal?: AbortSignal): DshRemoteStream;
  readFirstStreamItem(endpoint: string, args?: Record<string, unknown>): Promise<unknown>;
  runEvents(onEvent: (event: DshRemoteEvent) => void, signal: AbortSignal): Promise<void>;
  respondEvent(eventId: string, outcome: unknown, clientId?: string): Promise<unknown>;
}

export class DshConnectionError extends Error {
  constructor() {
    super("[DSH_CONNECTION_LOST] 无法连接到桌面运行服务，请重试连接；任务未自动重发。");
    this.name = "DshConnectionError";
  }
}

export class DshStartupConnectionError extends Error {
  constructor(cause: unknown) {
    super("官方 DSH 启动连接失败，自动恢复已耗尽，请查看启动诊断后重试。", { cause });
    this.name = "DshStartupConnectionError";
  }
}

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(message);
  return value as Record<string, unknown>;
}

type ParsedRpcResponse = { rpcId: string; result: RpcResult };

export function parseRpcResponse(value: unknown, expectedRpcId?: string): ParsedRpcResponse {
  const message = asRecord(value, "DSH 响应格式无效");
  if (message.type !== "server-response" || typeof message.rpcId !== "string" || !message.rpcId) {
    throw new Error("DSH 响应关联信息无效");
  }
  if (expectedRpcId !== undefined && message.rpcId !== expectedRpcId) throw new Error("DSH 响应关联信息无效");
  const result = asRecord(message.result, "DSH 业务响应格式无效");
  if (result.ok === true) return { rpcId: message.rpcId, result: { ok: true, value: result.value } };
  if (result.ok !== false) throw new Error("DSH 业务响应格式无效");
  const error = asRecord(result.error, "DSH 业务错误格式无效");
  if (typeof error.code !== "string" || typeof error.message !== "string" || !asRecord(error.details, "DSH 业务错误详情无效")) {
    throw new Error("DSH 业务错误格式无效");
  }
  return {
    rpcId: message.rpcId,
    result: {
      ok: false,
      error: { code: error.code, message: error.message, details: error.details as Record<string, unknown> },
    },
  };
}

export async function readMultipartFields(response: Response): Promise<Map<string, FormDataEntryValue>> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/u.test(contentLength) && Number(contentLength) > MAX_MULTIPART_RESPONSE_BYTES) {
    throw new Error("DSH 二进制响应超过大小限制");
  }
  const form = await response.formData();
  const fields = new Map<string, FormDataEntryValue>();
  let totalBytes = 0;
  for (const [name, value] of form.entries()) {
    if (fields.has(name)) throw new Error("DSH 二进制响应包含重复字段");
    const size = value instanceof Blob ? value.size : Buffer.byteLength(value, "utf8");
    if (size > MAX_MULTIPART_ATTACHMENT_BYTES) throw new Error("DSH 二进制响应附件超过大小限制");
    totalBytes += size;
    if (totalBytes > MAX_MULTIPART_RESPONSE_BYTES) throw new Error("DSH 二进制响应超过大小限制");
    fields.set(name, value);
  }
  return fields;
}

export async function parseMultipartResponse(
  fields: Map<string, FormDataEntryValue>,
  expectedRpcId?: string,
): Promise<ParsedRpcResponse> {
  const metadata = fields.get("metadata");
  fields.delete("metadata");
  if (typeof metadata !== "string") throw new Error("DSH 二进制响应缺少 metadata");
  const parsed = parseRpcResponse(JSON.parse(metadata), expectedRpcId);
  if (!parsed.result.ok || fields.size === 0) throw new Error("DSH 二进制响应结果无效");
  const envelope = JSON.parse(metadata) as Record<string, unknown>;
  if (!Array.isArray(envelope.attachments) || envelope.attachments.length === 0) {
    throw new Error("DSH 二进制响应缺少附件表");
  }
  if (envelope.attachments.length > MAX_MULTIPART_ATTACHMENTS) {
    throw new Error("DSH 二进制响应附件数量超过限制");
  }
  const root: { value: unknown } = { value: parsed.result.value };
  for (const candidate of envelope.attachments) {
    const attachment = asRecord(candidate, "DSH 二进制响应附件无效");
    if (attachment.codec !== "bytes" || typeof attachment.part !== "string" || !attachment.part
      || !Array.isArray(attachment.path) || attachment.path.length === 0) {
      throw new Error("DSH 二进制响应附件无效");
    }
    if (attachment.path.length > MAX_MULTIPART_PATH_DEPTH) {
      throw new Error("DSH 二进制响应附件路径过深");
    }
    const data = fields.get(attachment.part);
    fields.delete(attachment.part);
    if (!(data instanceof Blob)) throw new Error("DSH 二进制响应附件缺失");
    let parent: Record<string, unknown> | unknown[] = root;
    let key: string | number = "value";
    for (const segment of attachment.path) {
      const value = parent[key as keyof typeof parent];
      if (!value || typeof value !== "object") throw new Error("DSH 二进制响应路径无效");
      if (Array.isArray(value)) {
        if (typeof segment !== "number" || !Number.isSafeInteger(segment) || segment < 0 || segment >= value.length) {
          throw new Error("DSH 二进制响应路径无效");
        }
      } else if (typeof segment !== "string") {
        throw new Error("DSH 二进制响应路径无效");
      }
      if (!Object.hasOwn(value, segment)) throw new Error("DSH 二进制响应路径无效");
      parent = value as Record<string, unknown> | unknown[];
      key = segment;
    }
    if (parent[key as keyof typeof parent] !== null) throw new Error("DSH 二进制响应缺少 null 占位符");
    parent[key as keyof typeof parent] = new Uint8Array(await data.arrayBuffer()) as never;
  }
  if (fields.size !== 0) throw new Error("DSH 二进制响应包含未声明字段");
  return { rpcId: parsed.rpcId, result: { ok: true, value: root.value } };
}

function isTransportFailure(error: unknown): boolean {
  return error instanceof TypeError
    || error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
}

function assertExactKeys(value: Record<string, unknown>, keys: readonly string[], message: string): void {
  if (Object.keys(value).some((key) => !keys.includes(key))) throw new Error(message);
}

function parseRemoteStreamServerMessage(value: unknown): {
  type: "item";
  streamId: string;
  value?: unknown;
} | {
  type: "error";
  streamId: string;
  error: { code: string; message: string; details: Record<string, unknown> };
} | {
  type: "end";
  streamId: string;
} {
  const frame = asRecord(value, "DSH Remote stream 帧无效");
  if (typeof frame.type !== "string" || typeof frame.streamId !== "string" || !frame.streamId) {
    throw new Error("DSH Remote stream 帧无效");
  }
  if (frame.type === "item") {
    assertExactKeys(frame, ["type", "streamId", "value"], "DSH Remote stream item 帧包含未知字段");
    return frame as { type: "item"; streamId: string; value?: unknown };
  }
  if (frame.type === "end") {
    assertExactKeys(frame, ["type", "streamId"], "DSH Remote stream end 帧包含未知字段");
    return { type: "end", streamId: frame.streamId };
  }
  if (frame.type === "error") {
    assertExactKeys(frame, ["type", "streamId", "error"], "DSH Remote stream error 帧包含未知字段");
    const error = asRecord(frame.error, "DSH Remote stream 错误无效");
    const details = asRecord(error.details, "DSH Remote stream 错误详情无效");
    if (typeof error.code !== "string" || !error.code || typeof error.message !== "string") {
      throw new Error("DSH Remote stream 错误无效");
    }
    return { type: "error", streamId: frame.streamId, error: { code: error.code, message: error.message, details } };
  }
  throw new Error("DSH Remote stream 类型无效");
}

function parseDshRemoteEvent(value: unknown): DshRemoteEvent {
  const frame = asRecord(value, "DSH 事件帧无效");
  if (typeof frame.type !== "string") throw new Error("DSH 事件帧类型无效");
  if (frame.type === "ready") {
    assertExactKeys(frame, ["type", "clientId", "host"], "DSH ready 事件帧包含未知字段");
    const host = asRecord(frame.host, "DSH Host 信息无效");
    assertExactKeys(host, ["home"], "DSH Host 信息包含未知字段");
    if (typeof frame.clientId !== "string" || !frame.clientId || typeof host.home !== "string") {
      throw new Error("DSH ready 事件帧无效");
    }
    return { type: "ready", clientId: frame.clientId, host: { home: host.home } };
  }
  if (frame.type === "emit") {
    assertExactKeys(frame, ["type", "event", "args"], "DSH emit 事件帧包含未知字段");
    if (typeof frame.event !== "string" || !Array.isArray(frame.args)) throw new Error("DSH emit 事件帧无效");
    return { type: "emit", event: frame.event, args: frame.args };
  }
  if (frame.type === "waterfall") {
    assertExactKeys(frame, ["type", "event", "eventId", "agentId", "request"], "DSH waterfall 事件帧包含未知字段");
    const request = asRecord(frame.request, "DSH waterfall 请求无效");
    if (typeof frame.event !== "string" || typeof frame.eventId !== "string" || !frame.eventId
      || typeof frame.agentId !== "string" || !frame.agentId) {
      throw new Error("DSH waterfall 事件帧无效");
    }
    return { type: "waterfall", event: frame.event, eventId: frame.eventId, agentId: frame.agentId, request };
  }
  if (frame.type === "cancel") {
    assertExactKeys(frame, ["type", "eventId"], "DSH cancel 事件帧包含未知字段");
    if (typeof frame.eventId !== "string" || !frame.eventId) throw new Error("DSH cancel 事件帧无效");
    return { type: "cancel", eventId: frame.eventId };
  }
  throw new Error("DSH 事件帧类型无效");
}

function getSetCookies(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(headers);
  const value = headers.get("set-cookie");
  return value ? value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/u) : [];
}

function isRetryableAuthenticationError(error: unknown): boolean {
  return error instanceof TypeError
    || error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
}

async function waitForAuthenticationRetry(attempt: number): Promise<void> {
  const delay = Math.min(AUTHENTICATION_RETRY_DELAY_MS * (attempt + 1), 1_000);
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

class StreamQueue<T> {
  private readonly values: T[] = [];
  private readonly waiters: Array<{ resolve: (result: IteratorResult<T>) => void; reject: (error: Error) => void }> = [];
  private ended = false;
  private failure: Error | undefined;

  push(value: T): void {
    const waiter = this.waiters.shift();
    if (waiter) waiter.resolve({ done: false, value });
    else this.values.push(value);
  }

  end(error?: Error): void {
    this.failure = error;
    this.ended = true;
    const waiters = this.waiters.splice(0);
    for (const waiter of waiters) {
      if (error) waiter.reject(error);
      else waiter.resolve({ done: true, value: undefined as never });
    }
  }

  async next(): Promise<IteratorResult<T>> {
    if (this.values.length > 0) return { done: false, value: this.values.shift() as T };
    if (this.failure) throw this.failure;
    if (this.ended) return { done: true, value: undefined as never };
    return new Promise((resolve, reject) => this.waiters.push({ resolve, reject }));
  }
}

export class DshRemoteClient implements DshCarrier {
  readonly transport = "loopback" as const;
  private readonly startupUrl: URL;
  private origin = "";
  private cookie = "";
  private eventClientId = "";
  private eventGeneration = 0;
  private hostHome = "";
  private readonly onConnectionError?: () => void;

  constructor(startupUrl: string, onConnectionError?: () => void) {
    this.onConnectionError = onConnectionError;
    const parsed = new URL(startupUrl);
    if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !/^\d+$/u.test(parsed.port)
      || parsed.pathname !== "/" || parsed.username || parsed.password || parsed.hash) {
      throw new Error("官方 DSH 启动地址必须是 IPv4 loopback HTTP 地址");
    }
    const tokens = parsed.searchParams.getAll("token");
    if (tokens.length !== 1 || !/^[A-Za-z0-9_-]{43}$/u.test(tokens[0] ?? "")) {
      throw new Error("官方 DSH 启动地址缺少唯一有效 token");
    }
    if ([...parsed.searchParams.keys()].some((key) => key !== "token")) throw new Error("官方 DSH 启动地址包含未知查询参数");
    this.startupUrl = parsed;
  }

  get cleanOrigin(): string {
    if (!this.origin) throw new Error("官方 DSH 尚未完成认证");
    return this.origin;
  }

  get currentEventClientId(): string {
    return this.eventClientId;
  }

  get currentEventGeneration(): number {
    return this.eventGeneration;
  }

  get currentHostHome(): string {
    return this.hostHome;
  }

  async authenticate(signal?: AbortSignal): Promise<void> {
    for (let attempt = 0; attempt <= AUTHENTICATION_RETRY_COUNT; attempt += 1) {
      signal?.throwIfAborted();
      try {
        const response = await fetch(this.startupUrl, {
          redirect: "manual",
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
        });
        if (response.status !== 303) throw new Error(`官方 DSH 认证失败（HTTP ${response.status}）`);
        const location = response.headers.get("location");
        if (location !== "/" && location !== "./") throw new Error("官方 DSH 认证重定向目标无效");
        const cookies = getSetCookies(response.headers)
          .map((item) => item.split(";", 1)[0]?.trim())
          .filter((item): item is string => Boolean(item && /^dsh-auth-[^=]+=.+$/u.test(item)));
        if (cookies.length === 0) throw new Error("官方 DSH 认证未返回 Cookie");
        this.cookie = cookies.join("; ");
        this.origin = this.startupUrl.origin;
        return;
      } catch (error) {
        signal?.throwIfAborted();
        if (!isRetryableAuthenticationError(error)) throw error;
        if (attempt === AUTHENTICATION_RETRY_COUNT) {
          throw new DshStartupConnectionError(error);
        }
        await waitForAuthenticationRetry(attempt);
      }
    }
  }

  async call(endpoint: string, args: Record<string, unknown> = {}, signal?: AbortSignal): Promise<unknown> {
    const rpcId = randomUUID();
    const body = JSON.stringify({ type: "client-request", rpcId, method: endpoint, payload: { args } });
    let parsedResponse: ParsedRpcResponse;
    try {
      const response = await this.authenticatedFetch(`/api/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal,
      });
      if (!response.ok) throw new Error(`DSH 请求失败（HTTP ${response.status}）`);
      const contentType = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (contentType === "multipart/form-data") {
        parsedResponse = await parseMultipartResponse(await readMultipartFields(response));
      } else {
        // 响应头到达后仍可能断流；只报告连接故障，不重放结果未知的写请求。
        parsedResponse = parseRpcResponse(await response.json(), rpcId);
      }
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof DshConnectionError) throw error;
      if (!isTransportFailure(error)) throw error;
      this.onConnectionError?.();
      throw new DshConnectionError();
    }
    if (parsedResponse.rpcId !== rpcId) throw new Error("DSH 响应关联信息无效");
    if (parsedResponse.result.ok !== true) throw new Error(parsedResponse.result.error.message);
    return parsedResponse.result.value;
  }

  async mcpAppsRequest(path: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<unknown> {
    if (!MCP_APPS_PATHS.has(path)) throw new Error("MCP Apps 路径不受支持");
    if (method === "GET" && body !== undefined) throw new Error("MCP Apps GET 请求不能包含请求体");
    const response = await this.authenticatedFetch(path, {
      method,
      headers: {
        Accept: "application/json",
        ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    if (!response.ok) throw new Error(`MCP Apps 请求失败（HTTP ${response.status}）`);
    try {
      return await response.json();
    } catch (error) {
      if (!isTransportFailure(error)) throw error;
      this.onConnectionError?.();
      throw new DshConnectionError();
    }
  }

  async exportSession(sessionId: string, selectedPath: string): Promise<void> {
    const url = new URL("/api/session.export", this.cleanOrigin);
    url.searchParams.set("sessionId", sessionId);
    url.searchParams.set("includeDescendants", "true");
    const response = await this.authenticatedFetch(`${url.pathname}${url.search}`, { timeoutMs: 60_000 });
    if (!response.ok || !response.body) throw new Error(`官方 DSH 导出失败（HTTP ${response.status}）`);
    const { pipeline } = await import("node:stream/promises");
    const temporaryPath = `${selectedPath}.${process.pid}.${randomUUID()}.tmp`;
    try {
      const existing = await lstat(selectedPath).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
      if (existing && !existing.isFile()) throw desktopError(DesktopErrorCode.DSH_EXPORT_FAILED, "导出目标必须是普通文件");
      await pipeline(
        (await import("node:stream")).Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
        createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }),
      );
      await rename(temporaryPath, selectedPath);
    } catch (error) {
      await response.body.cancel().catch(() => {});
      throw desktopError(DesktopErrorCode.DSH_EXPORT_FAILED, "官方 DSH 导出写入失败", { cause: error });
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  private async authenticatedFetch(path: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
    if (!this.origin || !this.cookie) throw new Error("官方 DSH 尚未完成认证");
    const { timeoutMs = 30_000, ...requestInit } = init;
    const headers = Object.fromEntries(new Headers(requestInit.headers).entries());
    headers.Cookie = this.cookie;
    try {
      return await fetch(new URL(path, this.origin), {
        ...requestInit,
        headers,
        redirect: "error",
        signal: requestInit.signal ? AbortSignal.any([requestInit.signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      requestInit.signal?.throwIfAborted();
      if (!(error instanceof TypeError) && !(error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name))) throw error;
      this.onConnectionError?.();
      throw new DshConnectionError();
    }
  }

  async *openStream(endpoint: string, args: Record<string, unknown>, signal?: AbortSignal): DshRemoteStream {
    if (!this.origin || !this.cookie) throw new Error("官方 DSH 尚未完成认证");
    if (signal?.aborted) return;
    const queue = new StreamQueue<unknown>();
    const streamId = randomUUID();
    const url = new URL("/api/remote.mux", this.origin);
    url.protocol = "ws:";
    const socket = new WebSocket(url, { headers: { Cookie: this.cookie }, origin: this.origin });
    let closed = false;
    const close = (error?: Error) => {
      if (closed) return;
      closed = true;
      queue.end(error);
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
    };
    const abort = () => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "cancel", streamId }));
      close(new Error("DSH Remote stream cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    socket.once("error", (error) => close(error instanceof Error ? error : new Error(String(error))));
    let endedByFrame = false;
    socket.once("close", () => close(endedByFrame ? undefined : new Error("DSH Remote stream closed unexpectedly")));
    socket.on("message", (raw: RawData, isBinary: boolean) => {
      try {
        if (isBinary) throw new Error("DSH Remote stream 不支持二进制帧");
        const message = parseRemoteStreamServerMessage(JSON.parse(raw.toString()));
        if (message.streamId !== streamId) return;
        if (message.type === "item") queue.push(message.value);
        else if (message.type === "end") {
          endedByFrame = true;
          close();
        } else {
          close(new Error(message.error.message));
        }
      } catch (error) {
        close(error instanceof Error ? error : new Error(String(error)));
      }
    });
    try {
      await new Promise<void>((resolve, reject) => {
        if (socket.readyState === WebSocket.OPEN) return resolve();
        const cleanup = () => {
          socket.off("open", onOpen);
          socket.off("error", onError);
          socket.off("close", onClose);
        };
        const onOpen = () => { cleanup(); resolve(); };
        const onError = (error: Error) => { cleanup(); reject(error); };
        const onClose = () => { cleanup(); reject(new Error("DSH Remote stream closed before opening")); };
        socket.once("open", onOpen);
        socket.once("error", onError);
        socket.once("close", onClose);
      });
      if (signal?.aborted) return;
      socket.send(JSON.stringify({ type: "open", streamId, endpoint, payload: { args } }));
      while (true) {
        const next = await queue.next();
        if (next.done) return;
        yield next.value;
      }
    } finally {
      signal?.removeEventListener("abort", abort);
      if (!closed) abort();
    }
  }

  async readFirstStreamItem(endpoint: string, args: Record<string, unknown> = {}): Promise<unknown> {
    for await (const item of this.openStream(endpoint, args)) return item;
    throw new Error(`DSH Remote stream ${endpoint} 未返回首帧`);
  }

  async runEvents(onEvent: (event: DshRemoteEvent) => void, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const generation = ++this.eventGeneration;
      let readySeen = false;
      this.eventClientId = "";
      this.hostHome = "";
      try {
        for await (const item of this.openStream("$events", {} , signal)) {
          if (generation !== this.eventGeneration) return;
          const frame = parseDshRemoteEvent(item);
          if (!readySeen && frame.type !== "ready") throw new Error("DSH 事件流首帧必须是 ready");
          if (frame.type === "ready") {
            if (readySeen) throw new Error("DSH 事件流包含重复 ready");
            readySeen = true;
            this.eventClientId = frame.clientId;
            this.hostHome = frame.host.home;
          }
          onEvent(frame);
        }
        if (!readySeen) throw new Error("DSH 事件流在 ready 前结束");
      } catch (error) {
        if (signal.aborted) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        if (error instanceof Error && /401|403/u.test(error.message)) throw error;
      }
    }
  }

  async respondEvent(eventId: string, outcome: unknown, clientId = this.eventClientId): Promise<unknown> {
    if (!clientId || clientId !== this.eventClientId) throw new Error("DSH 事件流代际已失效");
    return this.call("$events/result", { clientId, eventId, outcome });
  }
}
