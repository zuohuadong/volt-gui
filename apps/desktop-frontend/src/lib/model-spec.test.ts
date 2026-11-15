import { describe, expect, it } from "vitest";

import { describeSpecDifference, formatSpecNumber, formatTokenSpec, stripInternalAlias } from "./model-spec";

describe("model spec formatting (#361)", () => {
  it("uses one grouping separator for every number", () => {
    expect(formatSpecNumber(300000)).toBe("300,000");
    expect(formatSpecNumber(1048576)).toBe("1,048,576");
    expect(formatSpecNumber(32768)).toBe("32,768");
    // 字符串、带分隔符的值也要收敛成同一种写法。
    // 点号分组要按 30 万处理，不能读成 300。
    expect(formatSpecNumber("300.000")).toBe("300,000");
    expect(formatSpecNumber("300 000")).toBe("300,000");
    expect(formatSpecNumber("1,048,576")).toBe("1,048,576");
  });

  it("always carries the unit and never shows a placeholder", () => {
    expect(formatTokenSpec(1048576)).toBe("1,048,576 tokens");
    expect(formatTokenSpec(undefined)).toBe("");
    expect(formatTokenSpec(Number.NaN)).toBe("");
  });

  it("reports whether displayed values actually differ", () => {
    expect(describeSpecDifference([32768, 32768])).toBe(false);
    expect(describeSpecDifference([32766, 32768])).toBe(true);
    expect(describeSpecDifference([undefined, undefined])).toBe(false);
  });
});
describe("model names drop internal aliases (#361)", () => {
  it("removes trailing english aliases but keeps the real name", () => {
    expect(stripInternalAlias("VLM (Qwen Text Alias)")).toBe("VLM");
    expect(stripInternalAlias("DeepSeek V4 Flash")).toBe("DeepSeek V4 Flash");
    // 有用信息（参数量、中文说明）不能被当成内部代号删掉。
    expect(stripInternalAlias("Qwen3 (8B)")).toBe("Qwen3 (8B)");
    expect(stripInternalAlias("视觉理解模型（文字别名）")).toBe("视觉理解模型（文字别名）");
    expect(stripInternalAlias("")).toBe("");
  });
});
