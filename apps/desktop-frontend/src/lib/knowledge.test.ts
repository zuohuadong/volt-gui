import { describe, expect, it } from "vitest";
import { buildKnowledgePrompt, knowledgeToolName, parseKnowledgeReport, stripKnowledgeReport } from "./knowledge";
import { setLocale, t } from "./i18n";

describe("knowledge workflow", () => {
  it("builds an official-DSH indexing prompt without a private backend", () => {
    setLocale("zh-CN");
    const prompt = buildKnowledgePrompt("build", "C:\\repo");
    expect(prompt).toContain("glob");
    expect(prompt).toContain("grep");
    expect(prompt).toContain("read");
    expect(prompt).toContain("C:\\repo");
    expect(prompt).toContain("<!-- voltui-knowledge-report");
    expect(prompt).toContain(t("knowledge.promptIndexNoVector"));

    setLocale("en-US");
    const english = buildKnowledgePrompt("query", "C:\\repo", "startup");
    expect(english).toContain("official DSH file tools glob, grep, and read");
    expect(english).toContain("startup");
    expect(english).toContain("<!-- voltui-knowledge-report");
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
