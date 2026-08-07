import { describe, expect, test } from "vitest";

import { turnProgress } from "./turn-progress";

describe("turn progress", () => {
  test("reports the current activity phase", () => {
    expect(turnProgress("tool", false, 20_000).phase).toBe("正在执行工具");
    expect(turnProgress("assistant", true, 80_000).phase).toBe("正在生成回复");
    expect(turnProgress("assistant", true, 260_000).phase).toBe("正在自检收尾");
    expect(turnProgress("reasoning", false, 20_000).phase).toBe("正在分析任务");
  });

  test("warns before the desktop turn protection limit", () => {
    expect(turnProgress("assistant", true, 310_000).hint).toContain("接近 6 分钟保护上限");
  });
});
