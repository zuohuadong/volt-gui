import { describe, expect, it } from "vitest";
import { buildQuestionAnswers, extractSources, questionsAnswered, toolPresentation } from "./ai-elements-adapter";

describe("AI Elements adapters", () => {
  it("extracts real source and citation parts without duplicates", () => {
    expect(extractSources({ content: [
      { type: "source-url", id: "docs", title: "Docs", url: "https://example.com/docs" },
      { type: "citation", title: "Docs", url: "https://example.com/docs" },
    ] })).toEqual([{ id: "docs", title: "Docs", url: "https://example.com/docs", description: undefined, quote: undefined }]);
  });

  it("maps structured tool views to tests, files, code and terminal output", () => {
    const presentation = toolPresentation({
      callId: "1",
      name: "run_tests",
      state: "success",
      view: {
        code: { code: "const ok = true", language: "ts" },
        terminal: { output: "33 passed", cwd: "D:/workspace" },
        tests: [{ name: "frontend", status: "passed", durationMs: 42 }],
        files: [{ name: "src", type: "directory", children: [{ name: "App.svelte", type: "file" }] }],
      },
    });
    expect(presentation.code).toEqual({ code: "const ok = true", language: "ts" });
    expect(presentation.terminal).toMatchObject({ output: "33 passed", cwd: "D:/workspace" });
    expect(presentation.tests[0]).toMatchObject({ name: "frontend", status: "passed" });
    expect(presentation.files[0]).toMatchObject({ name: "src", type: "directory" });
  });

  it("keeps generic tool output available to Tool instead of inventing an artifact", () => {
    expect(toolPresentation({ callId: "2", name: "read_report", state: "success", result: "report body" }).artifact).toBeUndefined();
  });

  it("renders an artifact only when DSH provides an explicit artifact view", () => {
    expect(toolPresentation({ callId: "3", name: "render_report", state: "success", result: "report body", view: {
      artifact: { title: "报告", content: "report body", kind: "text" },
    } }).artifact).toMatchObject({ title: "报告", kind: "text", content: "report body" });
  });

  it("requires every DSH question to have the matching answer kind", () => {
    const questions = [
      { id: "choice", options: [{ label: "A" }, { label: "B" }] },
      { id: "detail" },
    ];
    expect(questionsAnswered(questions, { choice: "A" })).toBe(false);
    expect(questionsAnswered(questions, { choice: "A", "detail:custom": "说明" })).toBe(true);
    expect(buildQuestionAnswers(questions, { choice: "A", "detail:custom": "说明" })).toEqual([
      { id: "choice", selected: ["A"], custom: undefined },
      { id: "detail", selected: [], custom: "说明" },
    ]);
  });
});
