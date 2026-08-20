import { describe, expect, test } from "vitest";

import { mergeStreamingText, reconcileAssistantText } from "./assistant-stream";

describe("assistant stream reconciliation", () => {
  test("merges streaming deltas without repeating overlaps", () => {
    expect(mergeStreamingText("第一段\n\n第二", "第二段")).toBe("第一段\n\n第二段");
    expect(reconcileAssistantText("第一段", "第二段", "text")).toBe("第一段第二段");
  });

  test("treats the final message as the authoritative answer", () => {
    expect(reconcileAssistantText("流式草稿", "最终正文", "message")).toBe("最终正文");
  });

  test("does not append a rendered final answer to a markdown draft", () => {
    const streamed = "# 报告\n\n| 项目 | 结果 |\n| --- | --- |\n| 均值 | **9673.5ms** |";
    const finalMessage = "# 报告\n\n| 项目 | 结果 |\n| --- | --- |\n| 均值 | 9673.5 ms |";

    const reconciled = reconcileAssistantText(streamed, finalMessage, "message");

    expect(reconciled).toBe(finalMessage);
    expect(reconciled.match(/# 报告/g)).toHaveLength(1);
  });
});
