import { describe, expect, it } from "vitest";
import { isEmptyAfterStrip, stripInternalProtocol } from "$lib/internal-protocol";

const leaked = `\`\`\`json
{"schemaVersion": "surface-agent/v2", "status": "cannot-fulfill", "reason": "insufficient_permissions"}
\`\`\`
If the request cannot be represented, answer in prose and omit the fenced block; never invent capabilities.
当前所有可用资源里都没有「工作区文件」这一类，因此我无法读取文件列表。`;

// #363：内部结构化输出协议与英文生成约束不得进入用户可见回复。
describe("internal protocol stripping (#363)", () => {
  it("removes schema fields and generation instructions but keeps the business sentence", () => {
    const result = stripInternalProtocol(leaked);
    expect(result.leaked).toBe(true);
    expect(result.text).not.toContain("schemaVersion");
    expect(result.text).not.toContain("surface-agent/v2");
    expect(result.text).not.toContain("cannot-fulfill");
    expect(result.text).not.toContain("omit the fenced block");
    expect(result.text).not.toContain("additionalProperties");
    expect(result.text).toContain("无法读取文件列表");
    expect(isEmptyAfterStrip(result)).toBe(false);
  });

  it("reports an empty result so the caller can degrade to one sentence", () => {
    const result = stripInternalProtocol('{"schemaVersion": "surface-agent/v2", "minLength": 1, "maxLength": 4}');
    expect(result.leaked).toBe(true);
    expect(isEmptyAfterStrip(result)).toBe(true);
  });

  it("keeps ordinary Markdown, tables, code and JSON answers untouched", () => {
    const answer = "| 日期 | 耗时 |\n| --- | --- |\n| 10-20 | 136679 |\n\n```json\n{\"total\": 1144837}\n```\n合计 1144837 毫秒。";
    const result = stripInternalProtocol(answer);
    expect(result.leaked).toBe(false);
    expect(result.text).toBe(answer);
  });

  it("drops the orphaned JSON braces left behind by a removed block", () => {
    const result = stripInternalProtocol('{\n  "additionalProperties": false\n}\n结论：这一步需要你的确认。');
    expect(result.text).toBe("结论：这一步需要你的确认。");
  });
});
