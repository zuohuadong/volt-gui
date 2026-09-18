import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, rename, rm } from "node:fs/promises";
import WebSocket, { type RawData } from "ws";

import { DesktopErrorCode, desktopError } from "./desktop-error.ts";

type RpcSuccess = { ok: true; value?: unknown };
type RpcFailure = { ok: false; error?: { code?: string; message?: string; details?: unknown } };
type RpcResult = RpcSuccess | RpcFailure;

export type DshRemoteEvent =
  | { type: "ready"; clientId: string; host?: { home?: string } }
  | { type: "emit"; event: string; args: unknown[] }
  | { type: "waterfall"; event: string; eventId: string; agentId: string; request: Record<string, unknown> }
  | { type: "cancel"; eventId: string };

export type DshRemoteStream = AsyncIterable<unknown>;

function asRecord(value: unknown, message: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw desktopError(DesktopErrorCode.DSH_RESPONSE_INVALID, message);
  }
  return value as Record<string, unknown>;
}

function failureFromRpcResult(result: RpcResult): Error {
  const message = result.ok === true ? "" : String(result.error?.message ?? "").trim();
  return message ? new Error(message) : desktopError(DesktopErrorCode.DSH_REQUEST_FAILED, "DSH 业务响应失败");
}

function getSetCookies(headers: Headers): string[] {
  const getSetCookie = (headers as Headers & { getSetCookie?: () => string[] }).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(headers);
  const value = headers.get("set-cookie");
  return value ? value.split(/,(?=\s*[^;,=\s]+=[^;,]+)/u) : [];
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
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

export class DshRemoteClient {
  private readonly startupUrl: URL;
  private origin = "";
  private cookie = "";
  private eventClientId = "";
  private eventGeneration = 0;
  private hostHome = "";

  constructor(startupUrl: string) {
    const parsed = new URL(startupUrl);
    if (parsed.protocol !== "http:" || parsed.hostname !== "127.0.0.1" || !/^\d+$/u.test(parsed.port)
      || parsed.pathname !== "/" || parsed.username || parsed.password || parsed.hash) {
      throw desktopError(DesktopErrorCode.DSH_START_URL_INVALID, "官方 DSH 启动地址必须是 IPv4 loopback HTTP 地址");
    }
    const tokens = parsed.searchParams.getAll("token");
    if (tokens.length !== 1 || !/^[A-Za-z0-9_-]{43}$/u.test(tokens[0] ?? "")) {
      throw desktopError(DesktopErrorCode.DSH_START_URL_INVALID, "官方 DSH 启动地址缺少唯一有效 token");
    }
    if ([...parsed.searchParams.keys()].some((key) => key !== "token")) throw desktopError(DesktopErrorCode.DSH_START_URL_INVALID, "官方 DSH 启动地址包含未知查询参数");
    this.startupUrl = parsed;
  }

  get cleanOrigin(): string {
    if (!this.origin) throw desktopError(DesktopErrorCode.DSH_NOT_AUTHENTICATED, "官方 DSH 尚未完成认证");
    return this.origin;
  }

  get currentEventClientId(): string {
    return this.eventClientId;
  }

  get currentHostHome(): string {
    return this.hostHome;
  }

  async authenticate(signal?: AbortSignal): Promise<void> {
    const response = await fetch(this.startupUrl, { redirect: "manual", signal: requestSignal(signal, 10_000) });
    if (response.status !== 303) throw desktopError(DesktopErrorCode.DSH_AUTH_FAILED, `官方 DSH 认证失败（HTTP ${response.status}）`);
    if (response.headers.get("location") !== "/") throw desktopError(DesktopErrorCode.DSH_AUTH_FAILED, "官方 DSH 认证重定向目标无效");
    const cookies = getSetCookies(response.headers)
      .map((item) => item.split(";", 1)[0]?.trim())
      .filter((item): item is string => Boolean(item && /^dsh-auth-[^=]+=.+$/u.test(item)));
    if (cookies.length === 0) throw desktopError(DesktopErrorCode.DSH_AUTH_FAILED, "官方 DSH 认证未返回 Cookie");
    this.cookie = cookies.join("; ");
    this.origin = this.startupUrl.origin;
  }

  async call(endpoint: string, args: Record<string, unknown> = {}, signal?: AbortSignal): Promise<unknown> {
    if (!this.origin || !this.cookie) throw desktopError(DesktopErrorCode.DSH_NOT_AUTHENTICATED, "官方 DSH 尚未完成认证");
    const rpcId = randomUUID();
    const response = await fetch(`${this.origin}/api/${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: this.cookie },
      body: JSON.stringify({ type: "client-request", rpcId, method: endpoint, payload: { args } }),
      signal: requestSignal(signal, 30_000),
    });
    if (!response.ok) throw desktopError(DesktopErrorCode.DSH_REQUEST_FAILED, `DSH 请求失败（HTTP ${response.status}）`);
    const message = asRecord(await response.json(), "DSH 响应格式无效");
    if (message.type !== "server-response" || message.rpcId !== rpcId) throw desktopError(DesktopErrorCode.DSH_RESPONSE_INVALID, "DSH 响应关联信息无效");
    const result = asRecord(message.result, "DSH 业务响应格式无效") as RpcResult;
    if (result.ok !== true) throw failureFromRpcResult(result);
    return result.value;
  }

  async exportSession(sessionId: string, selectedPath: string): Promise<void> {
    const url = new URL("/api/session.export", this.cleanOrigin);
    url.searchParams.set("sessionId", sessionId);
    url.searchParams.set("includeDescendants", "true");
    const response = await fetch(url, { headers: { Cookie: this.cookie }, signal: AbortSignal.timeout(60_000) });
    if (!response.ok || !response.body) throw desktopError(DesktopErrorCode.DSH_EXPORT_FAILED, `官方 DSH 导出失败（HTTP ${response.status}）`);
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
      // 保存对话框已确认覆盖；完整写入后才原子替换，失败不破坏旧文件。
      await rename(temporaryPath, selectedPath);
    } catch (error) {
      await response.body.cancel().catch(() => {});
      throw desktopError(DesktopErrorCode.DSH_EXPORT_FAILED, "官方 DSH 导出写入失败", { cause: error });
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }

  async *openStream(endpoint: string, args: Record<string, unknown>, signal?: AbortSignal): DshRemoteStream {
    if (!this.origin || !this.cookie) throw desktopError(DesktopErrorCode.DSH_NOT_AUTHENTICATED, "官方 DSH 尚未完成认证");
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
      close(desktopError(DesktopErrorCode.DSH_REQUEST_FAILED, "DSH Remote stream cancelled"));
    };
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    socket.once("error", (error) => close(error instanceof Error ? error : new Error(String(error))));
    socket.once("close", () => close());
    socket.on("message", (raw: RawData) => {
      try {
        const message = asRecord(JSON.parse(raw.toString()), "DSH Remote stream frame 无效");
        if (message.streamId !== streamId) return;
        if (message.type === "item") queue.push(message.value);
        else if (message.type === "end") close();
        else if (message.type === "error") {
          const error = asRecord(message.error, "DSH Remote stream 错误无效");
          close(typeof error.message === "string" ? new Error(error.message) : desktopError(DesktopErrorCode.DSH_REQUEST_FAILED, "DSH Remote stream failed"));
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
        const onClose = () => { cleanup(); reject(desktopError(DesktopErrorCode.DSH_REQUEST_FAILED, "DSH Remote stream closed before opening")); };
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
    throw desktopError(DesktopErrorCode.DSH_STREAM_EMPTY, `DSH Remote stream ${endpoint} 未返回首帧`);
  }

  async runEvents(onEvent: (event: DshRemoteEvent) => void, signal: AbortSignal): Promise<void> {
    while (!signal.aborted) {
      const generation = ++this.eventGeneration;
      try {
        for await (const item of this.openStream("$events", {} , signal)) {
          if (generation !== this.eventGeneration) return;
          const frame = asRecord(item, "DSH 事件帧无效");
          if (frame.type === "ready" && typeof frame.clientId === "string") {
            this.eventClientId = frame.clientId;
            const host = asRecord(frame.host, "DSH Host 信息无效");
            this.hostHome = typeof host.home === "string" ? host.home : "";
          }
          if (frame.type === "emit" || frame.type === "waterfall" || frame.type === "cancel" || frame.type === "ready") onEvent(frame as unknown as DshRemoteEvent);
        }
      } catch (error) {
        if (signal.aborted) return;
        await new Promise<void>((resolve) => setTimeout(resolve, 500));
        if (error instanceof Error && /401|403/u.test(error.message)) throw error;
      }
    }
  }

  async respondEvent(eventId: string, outcome: unknown, clientId = this.eventClientId): Promise<unknown> {
    if (!clientId) throw desktopError(DesktopErrorCode.DSH_STREAM_NOT_READY, "DSH 事件流尚未就绪");
    return this.call("$events/result", { clientId, eventId, outcome });
  }
}
