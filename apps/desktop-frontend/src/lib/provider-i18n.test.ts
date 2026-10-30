import { providerDisplayCopy } from "./provider-i18n";
import { describe, expect, it } from "vitest";

describe("providerDisplayCopy", () => {
  it("uses Chinese names and descriptions for known providers", () => {
    expect(providerDisplayCopy({
      provider: "deepseek-official",
      displayName: "DeepSeek",
      settingsNs: "llm-deepseek",
      settingsPath: [],
      active: true,
    }, "zh-CN")).toEqual({
      name: "DeepSeek 官方",
      description: "官方模型服务，使用 DeepSeek API 凭据访问。",
    });
  });

  it("keeps an unknown provider name and adds a Chinese description", () => {
    expect(providerDisplayCopy({
      provider: "anthropic",
      displayName: "Anthropic",
      settingsNs: "llm-anthropic",
      settingsPath: ["providers", "anthropic"],
      active: true,
    }, "zh-CN")).toEqual({
      name: "Anthropic",
      description: "Anthropic 模型服务，用于配置模型连接与访问凭据。",
    });
  });

  it("uses English copy outside the Chinese interface", () => {
    expect(providerDisplayCopy({
      provider: "xg-gomodel",
      displayName: "XG GOModel",
      settingsNs: "llm-pi-ai",
      settingsPath: ["providers", "xg-gomodel"],
      active: true,
    }, "en-US").name).toBe("XG GOModel");
  });
});
