import { describe, expect, it } from "vitest";
import { setLocale, t } from "./i18n";

import {
  credentialRefHint,
  credentialRefTitle,
  enrichModelGroups,
  filterUsableDiscoveredModels,
  findProviderSettings,
  mergeDiscoveredModels,
  modelCapabilityLabel,
  modelSelectionKey,
  modelSupportsImages,
  parseModelSelectionKey,
  providerCredentialRef,
  providerDefaultApi,
  providerDefaultBaseURL,
  isLocalOrIntranetBaseURL,
  isProviderCredentialOptional,
  resolveProviderSettings,
  supportedReasoningEffort,
} from "./model-catalog";

describe("model selection keys", () => {
  it("preserves model identifiers containing slashes", () => {
    const key = modelSelectionKey("openrouter", "vendor/model-v2");
    expect(parseModelSelectionKey(key)).toEqual({ provider: "openrouter", model: "vendor/model-v2" });
  });
});
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
    setLocale("zh-CN");
    expect(modelCapabilityLabel(groups[0].models[0])).toBe(t("models.capabilityImage"));
  });

  it("按官方 Provider 元数据解析根路径凭据", () => {
    const deepseek = { ...namespace, ns: "llm-deepseek", value: { apiKeyEnv: "DEEPSEEK_API_KEY", models: [{ id: "deepseek-v4-pro", inputModalities: ["text", "image"] }] } };
    const providers = [{ provider: "deepseek-official", displayName: "DeepSeek", settingsNs: "llm-deepseek", settingsPath: [], active: true }];
    expect(resolveProviderSettings([deepseek], providers, "deepseek-official")?.config.apiKeyEnv).toBe("DEEPSEEK_API_KEY");
    expect(providerCredentialRef([deepseek], providers, "deepseek-official")).toBe("DEEPSEEK_API_KEY");
    const groups = enrichModelGroups([{ id: "deepseek-official", name: "DeepSeek", models: [{ id: "deepseek-v4-pro", name: "DeepSeek-V4-Pro" }] }], [deepseek]);
    expect(groups[0].models[0].input).toEqual(["text", "image"]);
  });

  it("解析 Provider 默认 Base URL、API 类型与友好凭据描述", () => {
    const providers = [{ provider: "xg-gomodel", displayName: "XG GOModel", settingsNs: "llm-pi-ai", settingsPath: ["providers", "xg-gomodel"], active: true }];
    expect(providerDefaultBaseURL([namespace], providers, "xg-gomodel")).toBe("http://192.168.1.47:9010/v1");
    expect(providerDefaultApi([namespace], providers, "xg-gomodel")).toBe("");
    setLocale("zh-CN");
    expect(credentialRefTitle("XG_GOMODEL_API_KEY")).toBe(t("settings.credentialTitleXg"));
    expect(credentialRefTitle("DEEPSEEK_API_KEY")).toBe(t("settings.credentialTitleDeepseek"));
    expect(credentialRefTitle("CUSTOM_KEY")).toBe("CUSTOM_KEY");
    expect(credentialRefHint("XG_GOMODEL_API_KEY")).toContain("http://192.168.1.47:9010/v1");
    expect(credentialRefHint("DEEPSEEK_API_KEY")).toBe(t("settings.credentialHintDeepseek"));
    setLocale("en-US");
    expect(credentialRefTitle("XG_GOMODEL_API_KEY")).toBe(t("settings.credentialTitleXg"));
    expect(credentialRefHint("XG_GOMODEL_API_KEY")).toContain("http://192.168.1.47:9010/v1");
    expect(modelCapabilityLabel({ id: "vlm", name: "VLM", input: ["text", "image"] })).toBe(t("models.capabilityImage"));
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

  it("识别内网网关与本地 URL 无需强制要求外部云 API Key", () => {
    const providers = [{ provider: "xg-gomodel", displayName: "XG GOModel", settingsNs: "llm-pi-ai", settingsPath: ["providers", "xg-gomodel"], active: true }];
    expect(isLocalOrIntranetBaseURL("http://192.168.1.47:9010/v1")).toBe(true);
    expect(isLocalOrIntranetBaseURL("http://localhost:11434/v1")).toBe(true);
    expect(isLocalOrIntranetBaseURL("https://api.deepseek.com")).toBe(false);
    expect(isProviderCredentialOptional([namespace], providers, "xg-gomodel")).toBe(true);
  });

  it("仅对明确声明图片输入的模型开放多模态入口", () => {
    expect(modelSupportsImages({ id: "vision", name: "Vision", input: ["text", "image"] })).toBe(true);
    expect(modelSupportsImages({ id: "text", name: "Text", input: ["text"] })).toBe(false);
    expect(modelSupportsImages(undefined)).toBe(false);
  });

  it("过滤网关发现中的内部斜杠路径、图像适配器与硬件测试标签", () => {
    const rawDiscovered = [
      { id: "vlm", name: "VLM" },
      { id: "deepseek-v4-flash/GLM-5.1-478B-A42B-REAP-NVFP4", name: "Internal Route" },
      { id: "image-gpu5", name: "Image Adapter" },
      { id: "qwen-image", name: "Qwen Image" },
      { id: "qwen36-opus-prisma8-gpu4", name: "GPU Node" },
      { id: "qwen3.8-flash-next", name: "Qwen 3.8 Flash Next" },
    ];
    const filtered = filterUsableDiscoveredModels(rawDiscovered);
    expect(filtered.map((m) => m.id)).toEqual(["vlm", "qwen3.8-flash-next"]);
  });
});
