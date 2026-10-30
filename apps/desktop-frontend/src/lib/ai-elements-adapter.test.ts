import { describe, expect, it } from "vitest";
import { buildQuestionAnswers, extractSources, questionsAnswered, toolDisplay, toolErrorSummary, toolErrorTrace, toolPresentation, toolResultSummary } from "./ai-elements-adapter";

describe("AI Elements adapters", () => {
  it("accepts only the bounded read-only DSH native UI protocol", () => {
    const presentation = toolPresentation({
      callId: "native-1",
      name: "show_status",
      state: "success",
      view: {
        kind: "dsh/native-ui",
        version: 1,
        title: "构建状态",
        nodes: [
          { type: "metric", label: "通过测试", value: "42" },
          { type: "text", text: "所有检查已完成", tone: "success" },
        ],
      },
    });
    expect(presentation.nativeUi).toMatchObject({ title: "构建状态", nodes: [{ type: "metric" }, { type: "text" }] });
  });

  it("rejects native UI nodes with executable or unbounded fields", () => {
    const presentation = toolPresentation({
      callId: "native-2",
      name: "unsafe_status",
      state: "success",
      view: {
        kind: "dsh/native-ui",
        version: 1,
        nodes: [{ type: "html", html: "<script>alert(1)</script>" }],
      },
    });
    expect(presentation.nativeUi).toBeUndefined();
  });

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

  it("renders official DSH web result cards and source links", () => {
    const presentation = toolPresentation({
      callId: "web-1",
      name: "web_search",
      state: "success",
      view: { for: "result", view: {
        card: "web",
        kind: "search",
        title: "Node.js 26",
        answer: "Current release line",
        sources: [{ id: "node", title: "Node.js", url: "https://nodejs.org/", snippet: "Docs" }],
      } },
    });
    expect(presentation.web).toMatchObject({ kind: "search", title: "Node.js 26", answer: "Current release line" });
    expect(presentation.web?.sources).toEqual([{ id: "node", title: "Node.js", url: "https://nodejs.org/", description: undefined, quote: "Docs" }]);
  });

  it("accepts only validated MCP Apps descriptors from tool presentation metadata", () => {
    const presentation = toolPresentation({
      callId: "mcp-1",
      name: "mcp__counter__show",
      state: "success",
      result: "0",
      view: {
        kind: "dsh/mcp-app",
        version: 1,
        viewId: "view-1",
        resourceUri: "ui://counter/app",
        connectionGeneration: "generation-1",
        sandboxOrigin: "http://127.0.0.1:43124",
        sessionId: "session-1",
      },
    });
    expect(presentation.mcpApp).toMatchObject({
      viewId: "view-1",
      resourceUri: "ui://counter/app",
      connectionGeneration: "generation-1",
      sandboxOrigin: "http://127.0.0.1:43124",
      sessionId: "session-1",
    });
  });

  it("rejects unsafe or incomplete MCP Apps descriptors", () => {
    const presentation = toolPresentation({
      callId: "mcp-2",
      name: "mcp__counter__show",
      state: "success",
      view: {
        kind: "dsh/mcp-app",
        version: 1,
        viewId: "view-2",
        resourceUri: "https://example.invalid/app",
        connectionGeneration: "generation-2",
        sandboxOrigin: "https://example.invalid",
      },
    });
    expect(presentation.mcpApp).toBeUndefined();
  });

  it("normalizes computer-use screenshots into safe image sources", () => {
    const presentation = toolPresentation({
      callId: "computer-1",
      name: "computer",
      state: "success",
      view: { card: "computer", kind: "computer", screenshot: { type: "image", mediaType: "image/png", data: "AA==", alt: "页面截图" } },
    });
    expect(presentation.web?.kind).toBe("computer");
    expect(presentation.images[0]).toMatchObject({ src: "data:image/png;base64,AA==", alt: "页面截图" });
  });

  it("turns tool arguments into concise user-facing activity labels", () => {
    expect(toolDisplay({ name: "browser_session", args: JSON.stringify({ action: "start", url: "https://example.com" }) })).toEqual({
      label: "浏览器操作",
      detail: "打开页面 · https://example.com",
    });
    expect(toolDisplay({ name: "powershell", args: JSON.stringify({ command: "pnpm test" }) })).toEqual({
      label: "执行命令",
      detail: "pnpm test",
    });
    expect(toolDisplay({ name: "skill", args: JSON.stringify({ name: "browser-skill" }) })).toEqual({
      label: "加载能力",
      detail: "加载 browser-skill",
    });
    expect(toolDisplay({ name: "browser_session", args: "{action:start,url: https://example.com\\\"}" })).toEqual({
      label: "浏览器操作",
      detail: "打开页面 · https://example.com",
    });
  });

  it("uses StackTrace only for real structured or stack-shaped DSH errors", () => {
    expect(toolErrorTrace({ callId: "4", name: "exec", state: "error", result: "Error: boom\n    at run (D:/workspace/app.ts:12:4)" })).toContain("app.ts:12:4");
    expect(toolErrorTrace({ callId: "5", name: "exec", state: "error", result: JSON.stringify({ error: { stack: "Error: bad\n at main (index.ts:1:2)" } }) })).toContain("index.ts:1:2");
    expect(toolErrorTrace({ callId: "6", name: "exec", state: "error", result: "命令执行失败" })).toBeUndefined();
  });

  it("recognizes DSH pwsh calls and preserves unknown tool names in summaries", () => {
    expect(toolDisplay({ name: "pwsh", args: '{"command":"Get-ChildItem"}' })).toEqual({ label: "执行命令", detail: "Get-ChildItem" });
    expect(toolDisplay({ name: "custom_lookup" })).toEqual({ label: "工具调用", detail: "custom_lookup" });
    expect(toolDisplay({ name: "pwsh", view: { for: "call", view: { command: "Get-Date" } } })).toEqual({ label: "执行命令", detail: "Get-Date" });
  });

  it("keeps tool summaries concise and classifies common execution failures", () => {
    expect(toolResultSummary("\nfirst line\nsecond line")).toBe("first line");
    expect(toolErrorSummary("permission denied by policy")).toBe("操作需要授权后才能继续。");
    expect(toolErrorSummary("request timed out")).toBe("操作超时，请重试。");
    expect(toolErrorSummary(JSON.stringify({ error: { code: "approval-denied", message: "permission denied by policy" } }))).toBe("操作需要授权后才能继续。");
    expect(toolErrorSummary(JSON.stringify({ message: "process exited with code 1" }))).toBe("process exited with code 1");
    expect(toolErrorSummary("ENOENT: no such file or directory, realpath 'D:\\27852\\Anyong Workspace\\FA-26-00491 委托单.pdf'"))
      .toContain("FA-26-00491 委托单.pdf");
    expect(toolErrorSummary("Error: WEKNORA_DISABLED")).toContain("知识库检索服务未启用");
    expect(toolErrorSummary('Error: bsk: session start failed: no browser is currently connected (hint: open the browser, install extension in your browser and wait for the popup to show "connected")'))
      .toContain("浏览器扩展未连接");
    expect(toolErrorSummary('Error: bsk: session start failed: browser launch failed')).toContain("浏览器会话启动失败");
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
