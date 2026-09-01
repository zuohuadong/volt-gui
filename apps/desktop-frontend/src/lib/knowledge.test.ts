import { describe, expect, it } from "vitest";
import { buildKnowledgePrompt, knowledgeToolName, parseKnowledgeReport, stripKnowledgeReport } from "./knowledge";

describe("knowledge workflow", () => {
  it("builds an official-DSH indexing prompt without a private backend", () => {
    const prompt = buildKnowledgePrompt("build", "C:\\repo");
    expect(prompt).toContain("官方 DSH 文件工具 glob、grep、read");
    expect(prompt).toContain("C:\\repo");
    expect(prompt).toContain("<!-- voltui-knowledge-report");
    expect(prompt).toContain("没有独立的向量数据库 RPC");
  });

  it("parses bounded machine-readable reports", () => {
    const report = parseKnowledgeReport('完成。<!-- voltui-knowledge-report {"status":"partial","files":12.8,"chunks":4,"failures":["a.md",3],"query":"x","matches":2} -->');
    expect(report).toEqual({ status: "partial", files: 12, chunks: 4, failures: ["a.md"], query: "x", matches: 2 });
  });

  it("recognizes official filesystem search tool events", () => {
    expect(knowledgeToolName("glob")).toBe(true);
    expect(knowledgeToolName("tool:grep")).toBe(true);
    expect(knowledgeToolName("bash")).toBe(false);
  });

  it("keeps the machine report out of the visible answer", () => {
    expect(stripKnowledgeReport('答案\n<!-- voltui-knowledge-report {"status":"ready"} -->')).toBe("答案");
  });
});
