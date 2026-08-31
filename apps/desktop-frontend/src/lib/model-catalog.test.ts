import { describe, expect, it } from "vitest";

import { enrichModelGroups, findProviderSettings, mergeDiscoveredModels, modelCapabilityLabel, providerCredentialRef, resolveProviderSettings, supportedReasoningEffort } from "./model-catalog";
import type { SettingsNamespace } from "./dsh-client";

const namespace: SettingsNamespace = {
  ns: "llm-pi-ai",
  schema: {},
  value: { providers: { "xg-gomodel": { baseURL: "http://192.168.1.47:9010/v1", models: [{ id: "vlm", input: ["text", "image"], contextWindow: 65536 }] } } },
  applies: "live",
  secrets: [],
  revision: 2,
};

describe("XG 网关模型目录", () => {
  it("从官方设置命名空间定位 Provider 并补全能力", () => {
    expect(findProviderSettings([namespace], "xg-gomodel")?.namespace.ns).toBe("llm-pi-ai");
    const groups = enrichModelGroups([{ id: "xg-gomodel", name: "XG GOModel", models: [{ id: "vlm", name: "VLM" }] }], [namespace]);
    expect(groups[0].models[0]).toMatchObject({ input: ["text", "image"], contextWindow: 65536 });
    expect(modelCapabilityLabel(groups[0].models[0])).toBe("支持图片");
  });

  it("按官方 Provider 元数据解析根路径凭据", () => {
    const deepseek = { ...namespace, ns: "llm-deepseek", value: { apiKeyEnv: "DEEPSEEK_API_KEY", models: [{ id: "deepseek-v4-pro" }] } };
    const providers = [{ provider: "deepseek-official", displayName: "DeepSeek", settingsNs: "llm-deepseek", settingsPath: [], active: true }];
    expect(resolveProviderSettings([deepseek], providers, "deepseek-official")?.config.apiKeyEnv).toBe("DEEPSEEK_API_KEY");
    expect(providerCredentialRef([deepseek], providers, "deepseek-official")).toBe("DEEPSEEK_API_KEY");
  });

  it("刷新时保留已声明能力，并保守标记新模型", () => {
    const result = mergeDiscoveredModels(
      [{ id: "vlm", name: "VLM", maxTokens: 8192 }, { id: "new-model", name: "New Model" }],
      [{ id: "vlm", name: "旧名称", input: ["text", "image"], contextWindow: 4096 }],
    );
    expect(result.models[0]).toMatchObject({ id: "vlm", input: ["text", "image"], contextWindow: 4096, maxTokens: 8192 });
    expect(result.models[1]).toMatchObject({ id: "new-model", input: ["text"] });
    expect(result.unknownCapabilities.has("vlm")).toBe(false);
    expect(result.unknownCapabilities.has("new-model")).toBe(true);
  });

  it("只向支持的模型传递推理强度", () => {
    const groups = [{ id: "xg-gomodel", name: "XG", models: [
      { id: "vlm", name: "VLM" },
      { id: "reasoner", name: "Reasoner", reasoning: { efforts: [{ id: "high", name: "高" }] } },
    ] }];
    expect(supportedReasoningEffort(groups, "xg-gomodel", "vlm", "high")).toBeUndefined();
    expect(supportedReasoningEffort(groups, "xg-gomodel", "reasoner", "high")).toBe("high");
  });
});
