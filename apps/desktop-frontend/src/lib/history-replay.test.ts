import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { applyAssistantStreamFrame, normalizeSessionSnapshot } from "../../../desktop-electron/src/session-follow";
import type { HistoryEntry } from "./dsh-client";
import { applyTranscriptEvent, foldHistory, mergeHistoryEntries } from "./transcript";
import { taskRecoveryReason } from "./task-retry";

const require = createRequire(import.meta.url);
const dshRequire = createRequire(require.resolve("@deepseek-ai/dsh/package.json"));
const { AssistantStreamAccumulator, createToolResultMessage } = dshRequire("@deepseek-ai/dsh-llm") as {
  createToolResultMessage(input: { callId: string; content: Array<{ type: "text"; text: string }>; isError?: boolean }): unknown;
  AssistantStreamAccumulator: new () => {
    push(chunk: { time: number; chunk: Record<string, unknown> }): void;
    snapshot(): unknown[];
  };
};
const attempt = { attemptId: "a1", startedAfterSeq: 8, turn: 1, step: 1 };

function streamFixture() {
  const accumulator = new AssistantStreamAccumulator();
  accumulator.push({ time: 1, chunk: { type: "block-start", index: 0, block: { type: "text", text: "" } } });
  accumulator.push({ time: 2, chunk: { type: "text-delta", index: 0, text: "a" } });
  const snapshot = () => normalizeSessionSnapshot({
    cursor: 8, records: [],
    assistantStream: { activeAttempt: { ...attempt, stream: accumulator.snapshot() } },
  }).history.events as HistoryEntry[];
  const first = snapshot();
  accumulator.push({ time: 3, chunk: { type: "text-delta", index: 0, text: "b" } });
  return { first, grown: snapshot() };
}

describe("official packed stream replay", () => {
  it.each([false, true])("pairs official tool results and respects isError=%s", (isError) => {
    const entries: HistoryEntry[] = [
      { event: { type: "user/message", seq: 1, time: 1, data: { text: "task" } } },
      { event: { type: "tool/call", seq: 2, time: 2, data: { turn: 1, callId: "write-1", name: "pwsh", arguments: "{}" } } },
      { event: { type: "tool/result", seq: 3, time: 3, data: {
        turn: 1, message: createToolResultMessage({
          callId: "write-1", content: [{ type: "text", text: isError ? "failed" : "written" }], isError,
        }),
      } } },
      { event: { type: "turn/end", seq: 4, time: 4, data: { turn: 1, reason: { kind: "completed" } } } },
    ];
    const folded = foldHistory(entries);
    expect(folded.messages.filter((message) => message.tool)).toHaveLength(1);
    expect(folded.messages[1].tool).toMatchObject({
      callId: "write-1", name: "pwsh", state: isError ? "error" : "success", result: isError ? "failed" : "written",
    });
    expect(taskRecoveryReason(folded.messages, [], false, entries)).toBe(isError ? "error" : undefined);
  });

  it("reconciles an official late result after a turn ended", () => {
    const folded = foldHistory([
      { event: { type: "tool/call", seq: 1, time: 1, data: { callId: "late", turn: 1, name: "pwsh" } } },
      { event: { type: "turn/end", seq: 2, time: 2, data: { turn: 1 } } },
    ]);
    const updated = applyTranscriptEvent(folded, { type: "tool/result", seq: 3, data: {
      turn: 1, message: createToolResultMessage({ callId: "late", content: [{ type: "text", text: "ok" }] }),
    } });
    expect(updated.messages).toHaveLength(1);
    expect(updated.messages[0].tool?.state).toBe("success");
  });

  it("deduplicates a live frame after block-start and packed deltas", () => {
    const { grown } = streamFixture();
    const live = applyAssistantStreamFrame({
      type: "chunk", attemptId: "a1", index: 2, time: 3,
      chunk: { type: "text-delta", index: 0, text: "b" },
    }, attempt).entry as HistoryEntry;
    expect(foldHistory(mergeHistoryEntries(grown, [live])).messages[0].text).toBe("ab");
  });

  it("retains new deltas when a compact snapshot grows", () => {
    const { first, grown } = streamFixture();
    expect(foldHistory(mergeHistoryEntries(first, grown)).messages[0].text).toBe("ab");
  });

  it("only applies unseen normalized chunks when a follow reconnects", () => {
    const { first, grown } = streamFixture();
    let history = first;
    let transcript = foldHistory(first);
    for (const entry of grown) {
      const merged = mergeHistoryEntries(history, [entry]);
      if (merged.length === history.length && merged.every((item, index) => item === history[index])) continue;
      history = merged;
      transcript = applyTranscriptEvent(transcript, entry.event);
    }
    expect(transcript.messages[0].text).toBe("ab");
  });
});
