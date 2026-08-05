import { describe, expect, test } from "vitest";

import { stripInternalTranscriptBlocks, visibleTranscriptText } from "./transcript-visibility";

describe("transcript visibility", () => {
  test("removes internal capability routing blocks before rendering", () => {
    const value = `<capability-route version="1">\nroute: internal\n</capability-route>\n\n请检查这个文件。`;
    expect(stripInternalTranscriptBlocks(value)).toBe("请检查这个文件。");
  });

  test("removes repeated internal blocks while preserving user content", () => {
    const value = `<<capability-route version="1">hidden</capability-route>\n<active-goal>hidden</active-goal>\n用户问题`;
    expect(stripInternalTranscriptBlocks(value)).toBe("用户问题");
  });
});

test("collapses only adjacent long duplicate output blocks", () => {
  const repeated = "这是模型重复输出的一段完整内容，需要只展示一次。";
  expect(visibleTranscriptText(`${repeated}\n\n${repeated}\n\n后续结论`)).toBe(`${repeated}\n\n后续结论`);
  expect(visibleTranscriptText("是\n\n是")).toBe("是\n\n是");
});

test("hides provider reasoning and serialized tool-call blocks from final text", () => {
  const value = "<think>private chain of thought</think>\n<tool_call>{\"name\":\"write_file\"}</tool_call>\n最终回答";
  expect(visibleTranscriptText(value)).toBe("最终回答");
});

test("hides a strict opening planning aside before the final Markdown document", () => {
  const value = "我需要先分析供应商数据，让我先整理比较维度。\n\n# 供应商选型结论\n\n选择 A。";
  expect(visibleTranscriptText(value)).toBe("# 供应商选型结论\n\n选择 A。");
});

test("preserves ordinary first-person prose and headings", () => {
  const value = "我需要先说明本报告的适用范围。\n\n# 适用范围\n\n本报告用于内部评审。";
  expect(visibleTranscriptText(value)).toBe(value);
});

test("hides internal blocks after a visible prefix", () => {
  expect(visibleTranscriptText("先说结论。\n<analysis>private details</analysis>\n最终回答")).toBe("先说结论。\n\n最终回答");
});

test("removes separate internal blocks non-greedily", () => {
  const value = "<analysis>first secret</analysis>\n可见过渡\n<analysis>second secret</analysis>\n最终回答";
  expect(visibleTranscriptText(value)).toBe("可见过渡\n\n最终回答");
});

test("fails closed for a truncated internal block", () => {
  expect(visibleTranscriptText("可见前言\n<analysis>partial private reasoning")).toBe("可见前言\n");
});

test("collapses three adjacent repeated prose sentences but keeps short acknowledgements", () => {
  const repeated = "正在继续检查当前任务的执行状态。";
  expect(visibleTranscriptText(`${repeated}${repeated}${repeated}下一步。`)).toBe(`${repeated}下一步。`);
  expect(visibleTranscriptText("是。是。是。")).toBe("是。是。是。");
});

test("preserves paths and internal-looking tags inside legitimate final content", () => {
  expect(visibleTranscriptText("已写入 /Users/alice/workspace/demo/report.md")).toBe("已写入 /Users/alice/workspace/demo/report.md");
  expect(visibleTranscriptText("缓存位于 C:\\Users\\alice\\AppData\\Local\\Volt")).toBe("缓存位于 C:\\Users\\alice\\AppData\\Local\\Volt");
  expect(visibleTranscriptText("```xml\n<analysis>schema value</analysis>\n```")).toBe("```xml\n<analysis>schema value</analysis>\n```");
});

test("does not collapse repeated Markdown structure or tilde-fenced code", () => {
  const table = "| 名称 | 值 |\n| --- | --- |\n| 重复 | 保留 |\n| 重复 | 保留 |";
  expect(visibleTranscriptText(table)).toBe(table);
  expect(visibleTranscriptText("- 同一操作步骤需要保留\n- 同一操作步骤需要保留")).toBe("- 同一操作步骤需要保留\n- 同一操作步骤需要保留");
  expect(visibleTranscriptText("~~~text\n重复内容。重复内容。重复内容。\n~~~")).toBe("~~~text\n重复内容。重复内容。重复内容。\n~~~");
});
