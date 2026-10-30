import { describe, expect, it } from "vitest";
import { buildKnowledgePrompt, knowledgeToolName, parseKnowledgeReport, stripKnowledgeReport } from "./knowledge";

describe("knowledge workflow", () => {
  it("defaults to local retrieval and keeps indexing local regardless of scope", () => {
    expect(buildKnowledgePrompt("query", "C:\\repo", "question")).toContain("本次只查询本地");
    expect(buildKnowledgePrompt("build", "C:\\repo", "", "all")).toContain("不要访问网络");
  });

  it("requests external read-only retrieval with explicit partial failure and citations", () => {
    const external = buildKnowledgePrompt("query", "C:\\repo", "question", "external");
    expect(external).toContain("本次只查询已配置");
    expect(external).toContain("禁止上传本地文件");
    expect(external).toContain("status=failed");
    const combined = buildKnowledgePrompt("query", "C:\\repo", "question", "all");
    expect(combined).toContain("本次同时查询");
    expect(combined).toContain("status=partial");
    expect(combined).toContain("文档 ID 或页码");
  });
  it("builds a local workspace indexing prompt without a private backend", () => {
    const prompt = buildKnowledgePrompt("build", "C:\\repo");
    expect(prompt).toContain("本地工作区索引任务");
    expect(prompt).toContain("文件工具 glob、grep、read");
    expect(prompt).toContain("C:\\repo");
    expect(prompt).toContain("<!-- voltui-knowledge-report");
    expect(prompt).toContain("不要访问网络");
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
