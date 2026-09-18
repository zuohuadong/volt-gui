type JsonRecord = Record<string, unknown>;

export type HistoryEntry = { event: JsonRecord };
export type SessionHistory = { events: HistoryEntry[]; hasMore: boolean };
export type AssistantAttempt = {
  attemptId: string;
  startedAfterSeq: number;
  turn: number;
  step: number;
};

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function compactAssistantEntries(attempt: AssistantAttempt, stream: unknown): HistoryEntry[] {
  if (!Array.isArray(stream)) return [];
  return stream.flatMap((candidate, ordinal): HistoryEntry[] => {
    const item = record(candidate);
    const seq = attempt.startedAfterSeq + ordinal + 1;
    if (item.type === "text-chunks" || item.type === "reasoning-chunks") {
      return [{
        event: {
          type: `chunkrow/${item.type}`,
          seq,
          time: item.time0,
          data: { turn: attempt.turn, step: attempt.step, index: item.index, dt: item.dt, texts: item.texts },
        },
      }];
    }
    if (item.type === "chunk") {
      return [{ event: { type: "assistant/chunk", seq, time: item.time, data: { turn: attempt.turn, step: attempt.step, chunk: item.chunk } } }];
    }
    return [];
  });
}

function assistantAttempt(value: unknown): AssistantAttempt | undefined {
  const item = record(value);
  if (typeof item.attemptId !== "string" || typeof item.startedAfterSeq !== "number"
    || typeof item.turn !== "number" || typeof item.step !== "number") return undefined;
  return { attemptId: item.attemptId, startedAfterSeq: item.startedAfterSeq, turn: item.turn, step: item.step };
}

export function normalizeSessionSnapshot(snapshot: unknown): {
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
  const transient = activeAttempt ? compactAssistantEntries(activeAttempt, record(baseline.activeAttempt).stream) : [];
  return {
    history: { events: [...durable, ...transient], hasMore: value.hasMore === true },
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
        data: { turn: current.turn, step: current.step, chunk: frame.chunk },
      },
    },
  };
}
