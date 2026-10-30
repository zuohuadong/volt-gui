import { describe, expect, it } from "vitest";

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
  localizeModelInfo,
  resolveProviderSettings,
  supportedReasoningEffort,
  configuredModelGroups,
  preferredImageModel,
  collectCredentialRefs,
} from "./model-catalog";

describe("model selection keys", () => {
  it("recommends an explicitly image-capable model from the same provider first", () => {
    const groups = [
      { id: "other", name: "Other", models: [{ id: "vision", name: "Vision", input: ["image"] }] },
      { id: "local", name: "Local", models: [{ id: "text", name: "Text" }, { id: "vlm", name: "VLM", input: ["text", "image"] }] },
    ];
    expect(preferredImageModel(groups, "local/text")?.model.id).toBe("vlm");
    expect(preferredImageModel(groups, "missing/text")?.provider).toBe("other");
    expect(preferredImageModel([{ ...groups[1], models: [groups[1].models[0]] }], "local/text")).toBeUndefined();
  });
  it("preserves model identifiers containing slashes", () => {
    const key = modelSelectionKey("openrouter", "vendor/model-v2");
    expect(parseModelSelectionKey(key)).toEqual({ provider: "openrouter", model: "vendor/model-v2" });
  });
});

describe("模型展示本地化", () => {
  it("为中文界面规范化 DeepSeek 名称并翻译官方描述", () => {
    const localized = localizeModelInfo({
      id: "deepseek-v4-pro",
      name: "DeepSeek V4 Pro",
      description: "Stronger agentic coding, knowledge, and difficult reasoning; suited to complex or quality-critical tasks at...",
    }, "zh-CN");
    expect(localized.name).toBe("DeepSeek-V4-Pro");
    expect(localized.description).toContain("智能体编码");
    expect(localized.description).not.toContain("at...");
  });

  it("英文界面保留官方名称及描述文本", () => {
    const model = { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash", description: "Fast, efficient" };
    expect(localizeModelInfo(model, "en-US")).toEqual(model);
  });

  it("未知模型保留原始说明，不虚构能力或版本", () => {
    expect(localizeModelInfo({
      id: "custom-model",
      name: "Custom model",
      description: "A custom model",
    }, "zh-CN").description).toBe("A custom model");
    for (const version of ["V41", "V4.1"]) {
      const model = { id: `deepseek-${version}-flash`, name: `DeepSeek ${version} Flash`, description: "Custom description" };
      expect(localizeModelInfo(model, "zh-CN")).toEqual({
        ...model, name: `DeepSeek-${version}-Flash`,
      });
    }
    expect(localizeModelInfo({ id: "deepseek-v4-pro", name: "Pro", description: "自定义中文说明" }, "zh-CN").description).toBe("自定义中文说明");
  });

  it("保留配置目录中的友好名称和描述", () => {
    const groups = enrichModelGroups(
      [{ id: "deepseek-official", name: "DeepSeek", models: [{ id: "deepseek-v4-pro", name: "raw" }] }],
      [{
        ns: "llm-deepseek",
        schema: {},
        value: { models: [{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro", description: "Stronger agentic coding" }] },
        applies: "live",
        secrets: [],
        revision: 1,
      }],
    );
    expect(groups[0].models[0]).toMatchObject({ name: "DeepSeek V4 Pro", description: "Stronger agentic coding" });
  });
});
import type { CredentialView, SettingsNamespace } from "./dsh-client";

const namespace: SettingsNamespace = {
  ns: "llm-pi-ai",
  schema: {},
  value: { providers: { "xg-gomodel": { baseURL: "http://127.0.0.1:9010/v1", models: [{ id: "vlm", input: ["text", "image"], contextWindow: 65536 }] } } },
  applies: "live",
  secrets: [],
  revision: 2,
};

describe("DeepSeek 官方模型可见性", () => {
  const groups = [
    { id: "deepseek-official", name: "DeepSeek", models: [{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }] },
    { id: "xg-gomodel", name: "XG", models: [{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }] },
  ];
  const providers = [
    { provider: "deepseek-official", displayName: "DeepSeek", settingsNs: "llm-deepseek", settingsPath: [], active: true },
    { provider: "xg-gomodel", displayName: "XG", settingsNs: "llm-pi-ai", settingsPath: ["providers", "xg-gomodel"], active: true },
  ];
  const settings: SettingsNamespace[] = [
    { ...namespace, ns: "llm-deepseek", value: { apiKeyEnv: "DEEPSEEK_API_KEY" }, secrets: [] },
    namespace,
  ];

  const unconfiguredCases: Array<{ label: string; credentials: Record<string, CredentialView> }> = [
    { label: "凭据尚未加载", credentials: {} },
    { label: "凭据未配置", credentials: { DEEPSEEK_API_KEY: { configured: false, writable: true } } },
    { label: "只配置了其他服务", credentials: { OTHER_API_KEY: { configured: true, writable: true } } },
  ];
  it.each(unconfiguredCases)("$label 时不显示官方模型，保留内网同名模型", ({ credentials }) => {
    expect(configuredModelGroups(groups, settings, providers, credentials)).toEqual([groups[1]]);
  });

  it("官方配置缺失时不显示线上模型", () => {
    expect(configuredModelGroups(groups, [namespace], providers, {})).toEqual([groups[1]]);
  });

  it("保存凭据后显示，删除凭据后再次隐藏", () => {
    const credentials: Record<string, CredentialView> = {};
    expect(configuredModelGroups(groups, settings, providers, credentials)).toEqual([groups[1]]);
    credentials.DEEPSEEK_API_KEY = { configured: true, writable: true };
    expect(configuredModelGroups(groups, settings, providers, credentials)).toEqual(groups);
    credentials.DEEPSEEK_API_KEY = { configured: false, writable: true };
    expect(configuredModelGroups(groups, settings, providers, credentials)).toEqual([groups[1]]);
  });
});


describe("高级设置凭据引用", () => {
  const settings: SettingsNamespace[] = [
    { ...namespace, ns: "llm-deepseek", value: { apiKeyEnv: "DEEPSEEK_API_KEY" }, secrets: [] },
    { ...namespace, ns: "llm-pi-ai", value: { apiKeyEnv: "XG_GOMODEL_API_KEY" }, secrets: [] },
    { ...namespace, ns: "weknora", value: { apiKeyEnv: "WEKNORA_API_KEY" }, secrets: [] },
  ];
  const providers = [
    { provider: "deepseek-official", displayName: "DeepSeek", settingsNs: "llm-deepseek", settingsPath: [], active: false },
    { provider: "xg-gomodel", displayName: "XG", settingsNs: "llm-pi-ai", settingsPath: ["providers", "xg-gomodel"], active: true },
  ];

  it("隐藏已停用 Provider 的凭据，只保留可用服务和非 Provider 命名空间", () => {
    expect(collectCredentialRefs(settings, providers)).toEqual(["WEKNORA_API_KEY", "XG_GOMODEL_API_KEY"]);
  });

  it("Provider 列表不可用时保留全部引用，避免误判为未配置", () => {
    expect(collectCredentialRefs(settings)).toEqual(["DEEPSEEK_API_KEY", "WEKNORA_API_KEY", "XG_GOMODEL_API_KEY"]);
  });

  it("同一命名空间至少有一个 Provider 启用时保留引用", () => {
    const enabled = providers.map((provider) => provider.provider === "deepseek-official" ? { ...provider, active: true } : provider);
    expect(collectCredentialRefs(settings, enabled)).toContain("DEEPSEEK_API_KEY");
  });
});

describe("XG 网关模型目录", () => {
  it("从官方设置命名空间定位 Provider 并补全能力", () => {
    expect(findProviderSettings([namespace], "xg-gomodel")?.namespace.ns).toBe("llm-pi-ai");
    const groups = enrichModelGroups([{ id: "xg-gomodel", name: "XG GOModel", models: [{ id: "vlm", name: "VLM" }] }], [namespace]);
    expect(groups[0].models[0]).toMatchObject({ input: ["text", "image"], contextWindow: 65536 });
    expect(modelCapabilityLabel(groups[0].models[0])).toBe("支持图片");
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
    expect(providerDefaultBaseURL([namespace], providers, "xg-gomodel")).toBe("http://127.0.0.1:9010/v1");
    expect(providerDefaultApi([namespace], providers, "xg-gomodel")).toBe("");
      expect(credentialRefTitle("XG_GOMODEL_API_KEY")).toBe("西谷内网网关 API 密钥（内置默认）");
      expect(credentialRefTitle("DEEPSEEK_API_KEY")).toBe("DeepSeek 官方 API 密钥");
    expect(credentialRefTitle("CUSTOM_KEY")).toBe("CUSTOM_KEY");
      expect(credentialRefHint("XG_GOMODEL_API_KEY")).toContain("内置内网网关");
    expect(credentialRefHint("DEEPSEEK_API_KEY")).toContain("DeepSeek 官方");
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
    expect(isLocalOrIntranetBaseURL("http://192.168.0.1:9010/v1")).toBe(true);
    expect(isLocalOrIntranetBaseURL("http://localhost:11434/v1")).toBe(true);
    expect(isLocalOrIntranetBaseURL("https://api.deepseek.com")).toBe(false);
    expect(isLocalOrIntranetBaseURL("https://api.example.com/v1/10.0.0.1")).toBe(false);
    expect(isLocalOrIntranetBaseURL("https://localhost.example.com")).toBe(false);
    expect(isLocalOrIntranetBaseURL("http://gateway.local/v1")).toBe(true);
    expect(isProviderCredentialOptional([namespace], providers, "xg-gomodel")).toBe(true);
  });

  it("内网 Provider 显式声明 apiKeyEnv 时仍要求凭据", () => {
    const securedNamespace: SettingsNamespace = {
      ...namespace,
      value: {
        providers: {
          "xg-gomodel": {
            baseURL: "http://127.0.0.1:9010/v1",
            apiKeyEnv: "XG_GOMODEL_API_KEY",
            models: [{ id: "vlm" }],
          },
        },
      },
    };
    const providers = [{ provider: "xg-gomodel", displayName: "XG GOModel", settingsNs: "llm-pi-ai", settingsPath: ["providers", "xg-gomodel"], active: true }];
    expect(isProviderCredentialOptional([securedNamespace], providers, "xg-gomodel")).toBe(false);
    expect(providerCredentialRef([securedNamespace], providers, "xg-gomodel")).toBe("XG_GOMODEL_API_KEY");
  });

  it("仅对明确声明图片输入的模型开放多模态入口", () => {
    expect(modelSupportsImages({ id: "vision", name: "Vision", input: ["text", "image"] })).toBe(true);
    expect(modelSupportsImages({ id: "text", name: "Text", input: ["text"] })).toBe(false);
    expect(modelSupportsImages(undefined)).toBe(false);
  });

  it("未配置凭据时隐藏需要外部凭据的模型 Provider", () => {
    const groups = [
      { id: "deepseek-official", name: "DeepSeek", models: [{ id: "v4", name: "V4" }] },
      { id: "xg-gomodel", name: "XG", models: [{ id: "vlm", name: "VLM" }] },
    ];
    const providers = [
      { provider: "deepseek-official", displayName: "DeepSeek", settingsNs: "llm-deepseek", settingsPath: [], active: true },
      { provider: "xg-gomodel", displayName: "XG", settingsNs: "llm-pi-ai", settingsPath: ["providers", "xg-gomodel"], active: true },
    ];
    expect(configuredModelGroups(groups, [
      { ...namespace, ns: "llm-deepseek", value: { apiKeyEnv: "DEEPSEEK_API_KEY" }, secrets: [{ path: ["apiKey"], set: false }] },
      namespace,
    ], providers, { DEEPSEEK_API_KEY: { configured: false, writable: true } }).map((group) => group.id))
      .toEqual(["xg-gomodel"]);
    const settings = [{ ...namespace, ns: "llm-deepseek", value: { apiKeyEnv: "DEEPSEEK_API_KEY" } }, namespace];
    expect(configuredModelGroups(groups, settings, providers, {
      DEEPSEEK_API_KEY: { configured: true, writable: false, source: "env" },
    }).map((group) => group.id)).toEqual(["deepseek-official", "xg-gomodel"]);
    expect(configuredModelGroups(groups, [], providers, {})).toEqual([]);
    expect(configuredModelGroups(groups, settings, providers.map((provider) => ({ ...provider, active: false })), {
      DEEPSEEK_API_KEY: { configured: true, writable: true },
    })).toEqual([]);
    expect(configuredModelGroups(groups, [
      { ...namespace, ns: "llm-deepseek", value: {}, secrets: [{ path: ["apiKey"], set: true }] },
    ], providers, {}).map((group) => group.id)).toEqual(["deepseek-official"]);
  });

  it("关闭官方 Provider 时不按模型名称隐藏 XG 内部 DeepSeek 路由", () => {
    const groups = [
      { id: "deepseek-official", name: "DeepSeek", models: [{ id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" }] },
      { id: "xg-gomodel", name: "XG", models: [{ id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" }] },
    ];
    const providers = [
      { provider: "deepseek-official", displayName: "DeepSeek", settingsNs: "llm-deepseek", settingsPath: [], active: false },
      { provider: "xg-gomodel", displayName: "XG", settingsNs: "llm-pi-ai", settingsPath: ["providers", "xg-gomodel"], active: true },
    ];
    const settings = [{
      ...namespace,
      value: {
        providers: {
          "xg-gomodel": {
            baseURL: "http://127.0.0.1:9010/v1",
            models: [{ id: "deepseek-v4-flash" }],
          },
        },
      },
    }];

    expect(configuredModelGroups(groups, settings, providers, {}).map((group) => group.id))
      .toEqual(["xg-gomodel"]);
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
