import { describe, expect, test } from "vitest";

import { checkpointRestoreMessage } from "./checkpoint-feedback";

describe("checkpoint restore feedback", () => {
  const copy = {
    initial: "已成功恢复至初始状态。",
    checkpoint: "已成功恢复至第 {turn} 轮检查点。",
  };

  test("hides internal scope and presents the initial state naturally", () => {
    expect(checkpointRestoreMessage(0, copy)).toBe("已成功恢复至初始状态。");
    expect(checkpointRestoreMessage(-1, copy)).toBe("已成功恢复至初始状态。");
  });

  test("uses a human-readable checkpoint number", () => {
    expect(checkpointRestoreMessage(3.8, copy)).toBe("已成功恢复至第 3 轮检查点。");
  });
});
