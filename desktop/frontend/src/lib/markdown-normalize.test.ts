import { describe, expect, test } from "vitest";

import { normalizeMalformedMarkdownTables } from "./markdown-normalize";

describe("malformed Markdown table normalization", () => {
  test("splits an inline header and divider into two lines", () => {
    expect(normalizeMalformedMarkdownTables("| 项目 | 内容 | |---|---|\n| 价格 | 100 |"))
      .toBe("| 项目 | 内容 |\n|---|---|\n| 价格 | 100 |");
  });

  test("preserves valid tables, prose pipes, and fenced examples", () => {
    const value = [
      "A | B 是正文。",
      "",
      "| 项目 | 内容 |",
      "| --- | --- |",
      "| 价格 | 100 |",
      "",
      "```md",
      "| 项目 | 内容 | |---|---|",
      "```",
    ].join("\n");
    expect(normalizeMalformedMarkdownTables(value)).toBe(value);
  });
});
