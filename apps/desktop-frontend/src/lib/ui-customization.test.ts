import { describe, expect, it } from "vitest";
import {
  applyUiCustomization,
  buildUiCustomizationPrompt,
  DEFAULT_UI_CUSTOMIZATION,
  describeUiCustomizationPatch,
  isUiCustomizationIntent,
  parseUiCustomization,
  restoreUiCustomization,
  stripUiCustomizationPayload,
  UI_CUSTOMIZATION_SCHEMA,
} from "./ui-customization";
import { isInternalContinuationPrompt } from "./transcript";

describe("Volt UI customization protocol", () => {
  it("parses a fenced patch and ignores surrounding prose", () => {
    const result = parseUiCustomization(`方案如下：\n\n\`\`\`json\n{"schemaVersion":"${UI_CUSTOMIZATION_SCHEMA}","density":"compact","fontFamily":"inter","fontSize":"large","composerRows":4}\n\`\`\``);
    expect(result).toMatchObject({
      ok: true,
      value: { schemaVersion: UI_CUSTOMIZATION_SCHEMA, density: "compact", fontFamily: "inter", fontSize: "large", composerRows: 4 },
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
    expect(parseUiCustomization(JSON.stringify({ schemaVersion: UI_CUSTOMIZATION_SCHEMA, fontSize: "huge" })).ok).toBe(false);
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
      fontSize: "large",
      sidebar: "collapsed",
    });
    expect(current).toMatchObject({ title: "旧标题", sidebar: "expanded" });
    expect(next).toMatchObject({ title: "新标题", sidebar: "collapsed", density: "comfortable", fontSize: "large" });
  });

  it("restores stored settings while filling new defaults", () => {
    const restored = restoreUiCustomization(JSON.stringify({
      density: "compact",
      sidebar: "collapsed",
      title: "",
    }));
    expect(restored).toMatchObject({
      density: "compact",
      sidebar: "collapsed",
      fontFamily: "system",
      fontSize: "medium",
      codeFontFamily: "system-mono",
    });
  });

  it("detects customization intent and emits a constrained protocol prompt", () => {
    expect(isUiCustomizationIntent("把侧栏收起并改成紧凑布局")).toBe(true);
    expect(isUiCustomizationIntent("运行单元测试")).toBe(false);
    expect(isUiCustomizationIntent("显示测试失败日志")).toBe(false);
    const prompt = buildUiCustomizationPrompt("把输入框改成四行");
    expect(prompt).toContain("Volt UI customization protocol");
    expect(prompt).toContain(UI_CUSTOMIZATION_SCHEMA);
    expect(prompt).toContain("fontFamily(system|inter|yahei)");
    expect(prompt).toContain("不要输出 HTML、CSS、JavaScript");
  });
});

describe("UI customization presentation", () => {
  it("removes the machine payload from the conversation while keeping prose", () => {
    const payload = JSON.stringify({ schemaVersion: UI_CUSTOMIZATION_SCHEMA, composerRows: 4 });
    const text = `已为你生成方案：把输入框改为 4 行。\n\n\`\`\`json\n${payload}\n\`\`\``;
    expect(stripUiCustomizationPayload(text)).toBe("已为你生成方案：把输入框改为 4 行。");
  });

  it("keeps ordinary code blocks and text without a patch untouched", () => {
    const code = "示例：\n\n```json\n{\"name\":\"demo\"}\n```";
    expect(stripUiCustomizationPayload(code)).toBe(code);
    expect(stripUiCustomizationPayload("普通回复")).toBe("普通回复");
  });

  it("describes a patch in business language instead of schema fields", () => {
    const changes = describeUiCustomizationPatch({
      schemaVersion: UI_CUSTOMIZATION_SCHEMA,
      composerRows: 4,
      sidebar: "collapsed",
      density: "compact",
      quickActions: [{ label: "总结", prompt: "总结文档" }],
    });
    expect(changes).toEqual([
      { key: "densityCompact" },
      { key: "sidebarCollapsed" },
      { key: "composerRows", count: 4 },
      { key: "quickActions", count: 1 },
    ]);
    expect(JSON.stringify(changes)).not.toContain("schemaVersion");
  });

  it("tells the model not to claim the change already applied", () => {
    const prompt = buildUiCustomizationPrompt("把输入框改成四行");
    expect(prompt).toContain("确认之前");
    expect(prompt).toContain("确认后才会生效");
  });
});

describe("internal continuation detection", () => {
  it("recognizes the zh and en continuation instructions only", () => {
    const zhPrompt = "继续当前会话尚未完成的任务。先核对已有工具结果、待办和文件实际状态，从未完成的步骤接着执行。单轮保持短输出：每个阶段先用工具把结果写入工作区文件。";
    const enPrompt = "Continue the unfinished task in this session. Check existing tool results first. Keep each turn short: write each stage result to a workspace file.";
    expect(isInternalContinuationPrompt(zhPrompt)).toBe(true);
    expect(isInternalContinuationPrompt(enPrompt)).toBe(true);
    expect(isInternalContinuationPrompt("继续帮我看看这个文件")).toBe(false);
    expect(isInternalContinuationPrompt(undefined)).toBe(false);
    // 用户手写的短句即使同样以该前缀开头，也不会被当成内部指令隐藏。
    expect(isInternalContinuationPrompt("继续当前会话尚未完成的任务。")).toBe(false);
    expect(isInternalContinuationPrompt("继续当前会话尚未完成的任务。这是我自己的备注，请继续。")).toBe(false);
  });

  it("uses the canonical instruction for exact identity when one is supplied", () => {
    const zhPrompt = "继续当前会话尚未完成的任务。先核对已有工具结果、待办和文件实际状态，从未完成的步骤接着执行。单轮保持短输出：每个阶段先用工具把结果写入工作区文件。";
    // 逐字相等：可靠命中，与启发式无关。
    expect(isInternalContinuationPrompt(zhPrompt, zhPrompt)).toBe(true);
    // 用户在同前缀消息里写了内部措辞，但长度远小于完整指令：不能当成内部指令。
    const userNote = "继续当前会话尚未完成的任务。单轮保持短输出这条规则我记住了，现在请总结一下今天的改动。";
    expect(isInternalContinuationPrompt(userNote, zhPrompt)).toBe(false);
    // 截断的旧版本指令（长度仍过半）继续按内部指令处理，避免历史会话泄漏调度说明。
    const truncated = "继续当前会话尚未完成的任务。先核对已有工具结果、待办和文件实际状态，从未完成的步骤接着执行。单轮保持短输出：每个阶段先用工具把结果写入文件。";
    expect(isInternalContinuationPrompt(truncated, zhPrompt)).toBe(true);
  });
});
