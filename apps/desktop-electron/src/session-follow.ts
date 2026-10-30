import { createRequire } from "node:module";
import { resolveOfficialDshBin } from "./official-dsh-runtime.ts";

type JsonRecord = Record<string, unknown>;

export type HistoryEntry = { event: JsonRecord };
export type SessionHistory = { events: HistoryEntry[]; hasMore: boolean; cursor: number; projections?: unknown };
export type AssistantAttempt = {
  attemptId: string;
  startedAfterSeq: number;
  turn: number;
  step: number;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

export function sessionHistoryRequest(request: JsonRecord): { endpoint: string; args: JsonRecord } {
  const address = { kind: "session", sessionId: String(request.sessionId ?? "") };
  const maxMessages = Number(request.maxMessages ?? 80);
  if (request.beforeSeq === undefined) {
    return { endpoint: "session/follow", args: { request: { address, maxMessages, assistantStream: true } } };
  }
  if (!Number.isSafeInteger(request.beforeSeq) || Number(request.beforeSeq) < 0
    || !Number.isSafeInteger(request.throughSeq) || Number(request.throughSeq) < -1) {
    throw new Error("DSH 历史分页游标无效");
  }
  return {
    endpoint: "session/page",
    args: { request: { address, maxMessages, beforeSeq: request.beforeSeq, throughSeq: request.throughSeq } },
  };
}

function compactAssistantEntries(attempt: AssistantAttempt, stream: unknown, resourcesPath?: string): HistoryEntry[] {
  if (!Array.isArray(stream)) return [];
  const dshRequire = createRequire(resolveOfficialDshBin(resourcesPath));
  const { expandAssistantStream } = dshRequire("@deepseek-ai/dsh-llm") as {
    expandAssistantStream(stream: unknown[]): Array<{ time: number; chunk: unknown }>;
  };
  // packed.index 标识内容块，不是 live frame 序号；使用官方展开顺序。
  return expandAssistantStream(stream).map((item, index) => ({
    event: {
      type: "assistant/chunk",
      seq: attempt.startedAfterSeq + index + 1,
      time: item.time,
      data: { attemptId: attempt.attemptId, startedAfterSeq: attempt.startedAfterSeq, index, turn: attempt.turn, step: attempt.step, chunk: item.chunk },
    },
  }));
}

function assistantAttempt(value: unknown): AssistantAttempt | undefined {
  const item = record(value);
  if (typeof item.attemptId !== "string" || typeof item.startedAfterSeq !== "number"
    || typeof item.turn !== "number" || typeof item.step !== "number") return undefined;
  return { attemptId: item.attemptId, startedAfterSeq: item.startedAfterSeq, turn: item.turn, step: item.step };
}

export function normalizeSessionSnapshot(snapshot: unknown, resourcesPath?: string): {
  history: SessionHistory;
  cursor: number;
  activeAttempt?: AssistantAttempt;
} {
  const value = record(snapshot);
  const durable = Array.isArray(value.records)
    ? value.records.flatMap((candidate) => {
      const item = record(candidate);
      return item.type === "event" && Object.keys(record(item.event)).length > 0
        ? [{ event: record(item.event) }]
        : [];
    })
    : [];
  const baseline = record(value.assistantStream);
  const activeAttempt = assistantAttempt(baseline.activeAttempt);
  const transient = activeAttempt ? compactAssistantEntries(activeAttempt, record(baseline.activeAttempt).stream, resourcesPath) : [];
  return {
    history: {
      events: [...durable, ...transient],
      hasMore: value.hasMore === true,
      cursor: typeof value.cursor === "number" ? value.cursor : -1,
      ...(value.projections === undefined ? {} : { projections: value.projections }),
    },
    cursor: typeof value.cursor === "number" ? value.cursor : -1,
    activeAttempt,
  };
}

export function applyAssistantStreamFrame(frameValue: unknown, current?: AssistantAttempt): {
  activeAttempt?: AssistantAttempt;
  entry?: HistoryEntry;
} {
  const frame = record(frameValue);
  if (frame.type === "start") return { activeAttempt: assistantAttempt(frame) };
  if (frame.type === "end") return { activeAttempt: frame.attemptId === current?.attemptId ? undefined : current };
  if (frame.type !== "chunk" || !current || frame.attemptId !== current.attemptId || typeof frame.index !== "number") {
    return { activeAttempt: current };
  }
  return {
    activeAttempt: current,
    entry: {
      event: {
        type: "assistant/chunk",
        seq: current.startedAfterSeq + frame.index + 1,
        time: frame.time,
        data: { attemptId: current.attemptId, startedAfterSeq: current.startedAfterSeq, index: frame.index, turn: current.turn, step: current.step, chunk: frame.chunk },
      },
    },
  };
}
