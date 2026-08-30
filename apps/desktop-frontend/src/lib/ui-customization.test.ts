import { describe, expect, it } from "vitest";
import {
  applyUiCustomization,
  buildUiCustomizationPrompt,
  DEFAULT_UI_CUSTOMIZATION,
  isUiCustomizationIntent,
  parseUiCustomization,
  UI_CUSTOMIZATION_SCHEMA,
} from "./ui-customization";

describe("Volt UI customization protocol", () => {
  it("parses a fenced patch and ignores surrounding prose", () => {
    const result = parseUiCustomization(`方案如下：\n\n\`\`\`json\n{"schemaVersion":"${UI_CUSTOMIZATION_SCHEMA}","density":"compact","composerRows":4}\n\`\`\``);
    expect(result).toMatchObject({
      ok: true,
      value: { schemaVersion: UI_CUSTOMIZATION_SCHEMA, density: "compact", composerRows: 4 },
    });
  });

  it("parses an unfenced patch with whitespace before the schema key", () => {
    const result = parseUiCustomization(`建议应用 { "schemaVersion": "${UI_CUSTOMIZATION_SCHEMA}", "activity": "hidden" }`);
    expect(result).toMatchObject({ ok: true, value: { activity: "hidden" } });
  });

  it("fails closed for unknown fields, unsafe text, and invalid enum values", () => {
    expect(parseUiCustomization(JSON.stringify({ schemaVersion: UI_CUSTOMIZATION_SCHEMA, html: "<script>" })).ok).toBe(false);
    expect(parseUiCustomization(JSON.stringify({ schemaVersion: UI_CUSTOMIZATION_SCHEMA, title: "https://example.com" })).ok).toBe(false);
    expect(parseUiCustomization(JSON.stringify({ schemaVersion: UI_CUSTOMIZATION_SCHEMA, density: "spacious" })).ok).toBe(false);
  });

  it("limits quick actions and preserves only valid patch fields", () => {
    const result = parseUiCustomization(JSON.stringify({
      schemaVersion: UI_CUSTOMIZATION_SCHEMA,
      quickActions: [
        { label: "检查", prompt: "检查项目" },
        { label: "测试", prompt: "运行测试" },
        { label: "总结", prompt: "总结变更" },
        { label: "额外", prompt: "不应被接受" },
      ],
    }));
    expect(result.ok).toBe(false);
  });

  it("applies a patch without mutating the current state", () => {
    const current = { ...DEFAULT_UI_CUSTOMIZATION, title: "旧标题" };
    const next = applyUiCustomization(current, {
      schemaVersion: UI_CUSTOMIZATION_SCHEMA,
      title: "新标题",
      sidebar: "collapsed",
    });
    expect(current).toMatchObject({ title: "旧标题", sidebar: "expanded" });
    expect(next).toMatchObject({ title: "新标题", sidebar: "collapsed", density: "comfortable" });
  });

  it("detects customization intent and emits a constrained protocol prompt", () => {
    expect(isUiCustomizationIntent("把侧栏收起并改成紧凑布局")).toBe(true);
    expect(isUiCustomizationIntent("运行单元测试")).toBe(false);
    expect(isUiCustomizationIntent("显示测试失败日志")).toBe(false);
    const prompt = buildUiCustomizationPrompt("把输入框改成四行");
    expect(prompt).toContain("Volt UI customization protocol");
    expect(prompt).toContain(UI_CUSTOMIZATION_SCHEMA);
    expect(prompt).toContain("不要输出 HTML、CSS、JavaScript");
  });
});
