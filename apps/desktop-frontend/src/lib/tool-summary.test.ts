import { describe, expect, it } from "vitest";

import { redactPathForDisplay, safeToolDetail, toolBusinessLabel, toolErrorNeedsTechnicalDetail } from "./tool-summary";

describe("tool labels for the activity panel (#357)", () => {
  it("turns internal tool names into business language", () => {
    expect(toolBusinessLabel("glob")).toBe("查找文件");
    expect(toolBusinessLabel("grep")).toBe("检索内容");
    expect(toolBusinessLabel("read")).toBe("读取文档");
    expect(toolBusinessLabel("dsh-tools:view")).toBe("读取文档");
    expect(toolBusinessLabel("office-docx:write")).toBe("写入文档");
    expect(toolBusinessLabel("pwsh")).toBe("执行命令");
    expect(toolBusinessLabel("mystery-tool")).toBe("工具调用");
  });

  it("hides drive letters, user names and temp directories", () => {
    expect(redactPathForDisplay("C:\\Users\\27852\\AppData\\Roaming\\Anyong\\dsh\\sandbox-tmp\\dsh-spill-9\\out.md")).toBe("out.md");
    expect(redactPathForDisplay("/Users/demo/Anyong Workspace/交付核对.md")).toBe("交付核对.md");
    expect(redactPathForDisplay("report.docx")).toBe("report.docx");
  });

  it("keeps query words but never echoes command lines or absolute paths", () => {
    expect(safeToolDetail(JSON.stringify({ query: "撤回记录" }))).toBe("撤回记录");
    expect(safeToolDetail(JSON.stringify({ path: "C:\\Users\\demo\\Anyong Workspace\\资料.md" }))).toBe("资料.md");
    // 非 JSON 的原始参数串一律不展示，只回退到调用方给的业务名称。
    expect(safeToolDetail("$env:X=1; ls -la /tmp", undefined)).toBeUndefined();
    expect(safeToolDetail(undefined, "C:\\Users\\demo\\Anyong Workspace\\资料.md")).toBe("资料.md");
  });

  it("flags English stack traces so they stay inside technical details", () => {
    expect(toolErrorNeedsTechnicalDetail("Error: grep search failed (exit 2): rg: the literal \\n is not allowed")).toBe(true);
    expect(toolErrorNeedsTechnicalDetail("")).toBe(false);
    expect(toolErrorNeedsTechnicalDetail(undefined)).toBe(false);
  });
});
describe("condensed paths for the UI (#359)", () => {
  it("keeps only the tail of a long path", async () => {
    const { condensePath } = await import("./tool-summary");
    expect(condensePath("C:\\Users\\27852\\AppData\\Roaming\\Anyong\\browser-extension")).toBe("…/Anyong/browser-extension");
    expect(condensePath("/Users/demo/Anyong/browser-extension")).toBe("…/Anyong/browser-extension");
    expect(condensePath("browser-extension")).toBe("browser-extension");
    expect(condensePath("")).toBe("");
  });
});
