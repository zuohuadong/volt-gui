export type StreamRenderFlush = () => void;

/**
 * 将高频流式 UI 提交合并到下一帧，降低 assistant/chunk 触发的同步重绘。
 * 非流式/收尾事件应调用 flush() 立刻落盘到视图状态。
 */
export function createStreamRenderScheduler(schedule: (cb: () => void) => number = defaultSchedule): {
  schedule: (flush: StreamRenderFlush) => void;
  flush: () => void;
  clear: () => void;
  pending: () => boolean;
} {
  let handle: number | null = null;
  let pendingFlush: StreamRenderFlush | null = null;

  const run = () => {
    handle = null;
    const flush = pendingFlush;
    pendingFlush = null;
    flush?.();
  };

  return {
    schedule(flush) {
      pendingFlush = flush;
      if (handle !== null) return;
      handle = schedule(run);
    },
    flush() {
      if (handle !== null) {
        cancelSchedule(handle);
        handle = null;
      }
      const flush = pendingFlush;
      pendingFlush = null;
      flush?.();
    },
    clear() {
      if (handle !== null) {
        cancelSchedule(handle);
        handle = null;
      }
      pendingFlush = null;
    },
    pending() {
      return pendingFlush !== null;
    },
  };
}

function defaultSchedule(cb: () => void): number {
  if (typeof requestAnimationFrame === "function") return requestAnimationFrame(cb);
  return setTimeout(cb, 16) as unknown as number;
}

function cancelSchedule(handle: number): void {
  if (typeof cancelAnimationFrame === "function") {
    cancelAnimationFrame(handle);
    return;
  }
  clearTimeout(handle);
}

/** 高频会话事件：可合批刷新消息视图。 */
export function isBatchableSessionEvent(type: string): boolean {
  return type === "assistant/chunk"
    || type === "chunkrow/text-chunks"
    || type === "chunkrow/reasoning-chunks";
}
