import { describe, expect, test } from "vitest";

import { toolErrorPresentation, toolOperationBadge, toolOutputDuplicatesError } from "./tool-presentation";

describe("tool presentation", () => {
  test("labels workflow bookkeeping as task state instead of read-only", () => {
    expect(toolOperationBadge("todo_write", true)).toBe("任务状态");
    expect(toolOperationBadge("complete_step", true)).toBe("任务状态");
    expect(toolOperationBadge("read_file", true)).toBe("只读");
    expect(toolOperationBadge("write_file", false)).toBe("");
  });

  test("explains recovery while keeping technical details folded", () => {
    const error = "exit status 1\nfull provider stack";
    expect(toolErrorPresentation(error, true)).toEqual({
      summary: "本次调用失败，模型正在根据错误信息继续修正。",
      detail: error,
    });
    expect(toolErrorPresentation(error, false).summary).toBe("操作失败，请稍后重试；若问题持续，请查看任务日志。");
    expect(toolOutputDuplicatesError("Error: exit status 1", "exit status 1")).toBe(true);
  });
});
