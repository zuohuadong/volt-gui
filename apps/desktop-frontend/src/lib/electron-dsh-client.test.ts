import { afterEach, describe, expect, it, vi } from "vitest";

import { getDshHealth, streamDshTurn } from "./electron-dsh-client";
import type { DshTurnEvent } from "./electron-dsh-client";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Electron DSH client", () => {
  it("loads backend health from the active local port", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: "ok",
      model: "deepseek-chat",
      toolsCount: 8,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getDshHealth({ baseUrl: "http://127.0.0.1:3211/", accessToken: "test-token" })).resolves.toEqual({
      status: "ok",
      model: "deepseek-chat",
      toolsCount: 8,
    });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3211/api/health", {
      headers: { Authorization: "Bearer test-token" },
    });
  });

  it("decodes fragmented SSE events without losing streamed text", async () => {
    const chunks = [
      'data: {"type":"reasoning_delta","delta":"先检查"}\n\n' +
        'data: {"type":"content_delta","delta":"已定位',
      '问题"}\n\ndata: {"type":"turn_complete","finishReason":"stop"}\n\n',
      "data: [DONE]\n\n",
    ];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(stream, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    })));
    const events: DshTurnEvent[] = [];

    await streamDshTurn(
      { baseUrl: "http://127.0.0.1:3211", accessToken: "test-token" },
      "检查项目",
      "deepseek-chat",
      (event) => events.push(event),
    );

    expect(events).toEqual([
      { type: "reasoning_delta", delta: "先检查" },
      { type: "content_delta", delta: "已定位问题" },
      { type: "turn_complete", finishReason: "stop" },
    ]);
  });
});
