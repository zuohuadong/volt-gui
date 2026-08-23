export type DshMessageRole = "system" | "user" | "assistant" | "tool";

export interface DshToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface DshMessage {
  role: DshMessageRole;
  content: string;
  reasoningContent?: string;
  toolCalls?: DshToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface DshToolSchema {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface DshCacheDiagnostics {
  cachedTokens: number;
  promptTokens: number;
  completionTokens: number;
  reasoningTokens?: number;
  cacheHitRatio: number;
  prefixHash: string;
}

export type DshTurnEvent =
  | { type: "reasoning_delta"; delta: string }
  | { type: "content_delta"; delta: string }
  | { type: "tool_call_start"; toolCall: DshToolCall }
  | { type: "tool_call_args_delta"; toolCallId: string; delta: string }
  | { type: "tool_call_ready"; toolCall: DshToolCall; parsedArgs: Record<string, unknown> }
  | { type: "tool_exec_start"; toolCallId: string; name: string; args: Record<string, unknown> }
  | { type: "tool_exec_result"; toolCallId: string; name: string; output: string; isError?: boolean }
  | { type: "cache_diagnostics"; diagnostics: DshCacheDiagnostics }
  | { type: "degeneration_detected"; reason: string; count: number }
  | { type: "turn_complete"; finishReason: string; totalUsage?: DshCacheDiagnostics }
  | { type: "error"; message: string };

export interface DshHealth {
  status: string;
  model: string;
  toolsCount: number;
}

export interface DshConnection {
  baseUrl: string;
  accessToken: string;
}

async function responseError(response: Response): Promise<Error> {
  const body = await response.text();
  try {
    const parsed = JSON.parse(body) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.trim()) return new Error(parsed.error);
  } catch {
    // 非 JSON 错误体保留原始文本。
  }
  return new Error(body.trim() || `DSH 请求失败（HTTP ${response.status}）`);
}

function requestHeaders(connection: DshConnection, json = false): HeadersInit {
  return {
    Authorization: `Bearer ${connection.accessToken}`,
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

async function getJson<T>(connection: DshConnection, path: string): Promise<T> {
  const response = await fetch(`${normalizeDshBaseUrl(connection.baseUrl)}${path}`, {
    headers: requestHeaders(connection),
  });
  if (!response.ok) throw await responseError(response);
  return response.json() as Promise<T>;
}

export function normalizeDshBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export async function getDshHealth(connection: DshConnection): Promise<DshHealth> {
  return getJson<DshHealth>(connection, "/api/health");
}

export async function getDshHistory(connection: DshConnection): Promise<DshMessage[]> {
  const result = await getJson<{ messages: DshMessage[] }>(connection, "/api/history");
  return Array.isArray(result.messages) ? result.messages : [];
}

export async function getDshTools(connection: DshConnection): Promise<DshToolSchema[]> {
  const result = await getJson<{ tools: DshToolSchema[] }>(connection, "/api/tools");
  return Array.isArray(result.tools) ? result.tools : [];
}

export async function clearDshHistory(connection: DshConnection): Promise<void> {
  const response = await fetch(`${normalizeDshBaseUrl(connection.baseUrl)}/api/history`, {
    method: "DELETE",
    headers: requestHeaders(connection),
  });
  if (!response.ok) throw await responseError(response);
}

function parseSseLine(line: string): DshTurnEvent | "done" | undefined {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return undefined;
  const payload = trimmed.slice(5).trim();
  if (!payload) return undefined;
  if (payload === "[DONE]") return "done";
  return JSON.parse(payload) as DshTurnEvent;
}

export async function streamDshTurn(
  connection: DshConnection,
  prompt: string,
  model: string,
  onEvent: (event: DshTurnEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${normalizeDshBaseUrl(connection.baseUrl)}/api/turn`, {
    method: "POST",
    headers: requestHeaders(connection, true),
    body: JSON.stringify({ prompt, model }),
    signal,
  });
  if (!response.ok) throw await responseError(response);

  const reader = response.body?.getReader();
  if (!reader) throw new Error("DSH 流式响应不可读取。");

  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const event = parseSseLine(line);
      if (event === "done") return;
      if (event) onEvent(event);
    }

    if (done) break;
  }

  const finalEvent = parseSseLine(buffer);
  if (finalEvent && finalEvent !== "done") onEvent(finalEvent);
}
