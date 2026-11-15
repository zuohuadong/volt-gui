import { describe, expect, it, vi } from "vitest";
import { createStreamRenderScheduler, isBatchableSessionEvent } from "./stream-render-scheduler";

describe("createStreamRenderScheduler", () => {
  it("coalesces multiple schedules into one frame flush", () => {
    const frames: Array<() => void> = [];
    const scheduler = createStreamRenderScheduler((cb) => {
      frames.push(cb);
      return frames.length;
    });
    const first = vi.fn();
    const second = vi.fn();
    scheduler.schedule(first);
    scheduler.schedule(second);
    expect(frames).toHaveLength(1);
    frames[0]();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(scheduler.pending()).toBe(false);
  });

  it("flush runs pending work immediately and clears the frame", () => {
    const frames: Array<() => void> = [];
    const cancel = vi.fn();
    const originalCancel = globalThis.cancelAnimationFrame;
    (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame = cancel as typeof cancelAnimationFrame;
    try {
      const scheduler = createStreamRenderScheduler((cb) => {
        frames.push(cb);
        return 7;
      });
      const flush = vi.fn();
      scheduler.schedule(flush);
      scheduler.flush();
      expect(cancel).toHaveBeenCalledWith(7);
      expect(flush).toHaveBeenCalledOnce();
      expect(scheduler.pending()).toBe(false);
      expect(frames).toHaveLength(1);
      frames[0]();
      expect(flush).toHaveBeenCalledOnce();
    } finally {
      (globalThis as { cancelAnimationFrame?: typeof cancelAnimationFrame }).cancelAnimationFrame = originalCancel;
    }
  });

  it("clear drops pending work without running it", () => {
    const scheduler = createStreamRenderScheduler((cb) => {
      void cb;
      return 1;
    });
    const flush = vi.fn();
    scheduler.schedule(flush);
    scheduler.clear();
    expect(flush).not.toHaveBeenCalled();
    expect(scheduler.pending()).toBe(false);
  });
});

describe("isBatchableSessionEvent", () => {
  it("only batches high-frequency assistant chunk events", () => {
    expect(isBatchableSessionEvent("assistant/chunk")).toBe(true);
    expect(isBatchableSessionEvent("chunkrow/text-chunks")).toBe(true);
    expect(isBatchableSessionEvent("chunkrow/reasoning-chunks")).toBe(true);
    expect(isBatchableSessionEvent("assistant/message")).toBe(false);
    expect(isBatchableSessionEvent("turn/end")).toBe(false);
    expect(isBatchableSessionEvent("tool/call")).toBe(false);
  });
});
