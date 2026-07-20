import { describe, expect, it } from "vitest";

import { mcpConfigurationEnabled, mcpConnectionPresentation, mcpStatusLabel, shouldShowMCPTrust } from "./mcp-detail";

describe("MCP detail presentation", () => {
  it("turns a missing bundled computer-use module into an actionable product message", () => {
    const rawError = 'plugin "computer-use": read: EOF: stderr: error: Module not found "D:\\volt-gui\\desktop\\build\\bin\\computer-use-mcp\\node_modules\\@zavora-ai\\computer-use-mcp\\dist\\server.js"';

    expect(mcpConnectionPresentation("failed", rawError)).toEqual({
      tone: "danger",
      title: "内置组件缺失",
      summary: "Computer Use 运行组件不完整。请使用完整安装包，或重新运行桌面构建后再重试。",
      actionLabel: "重试连接",
    });
  });

  it("uses concise Chinese labels for backend connection states", () => {
    expect(mcpStatusLabel("connected")).toBe("已连接");
    expect(mcpStatusLabel("deferred")).toBe("待连接");
    expect(mcpStatusLabel("initializing")).toBe("连接中");
    expect(mcpStatusLabel("disabled")).toBe("已停用");
  });

  it("keeps read-only trust out of the primary failure flow", () => {
    expect(shouldShowMCPTrust("failed", [])).toBe(false);
    expect(shouldShowMCPTrust("connected", [])).toBe(true);
    expect(shouldShowMCPTrust("failed", ["screenshot"])).toBe(true);
  });

  it("keeps configured state separate from runtime health", () => {
    expect(mcpConfigurationEnabled("failed")).toBe(true);
    expect(mcpConfigurationEnabled("connected")).toBe(true);
    expect(mcpConfigurationEnabled("disabled")).toBe(false);
  });
});
