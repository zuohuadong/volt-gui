import type { ConfigurableProvider, DiscoveredModel, ModelGroup, ModelInfo, SettingsNamespace } from "./dsh-client";

export type ProviderSettings = {
  namespace: SettingsNamespace;
  config: Record<string, unknown>;
};

export function findProviderSettings(namespaces: SettingsNamespace[], provider: string): ProviderSettings | undefined {
  for (const namespace of namespaces) {
    const providers = (namespace.value as { providers?: unknown } | undefined)?.providers;
    if (!providers || typeof providers !== "object" || Array.isArray(providers)) continue;
    const config = (providers as Record<string, unknown>)[provider];
    if (config && typeof config === "object" && !Array.isArray(config)) {
      return { namespace, config: config as Record<string, unknown> };
    }
  }
  return undefined;
}

export function resolveProviderSettings(
  namespaces: SettingsNamespace[],
  providers: ConfigurableProvider[],
  provider: string,
): ProviderSettings | undefined {
  const descriptor = providers.find((item) => item.provider === provider);
  if (descriptor) {
    const namespace = namespaces.find((item) => item.ns === descriptor.settingsNs);
    if (namespace) {
      const config = valueAtPath(namespace.value, descriptor.settingsPath);
      if (config && typeof config === "object" && !Array.isArray(config)) {
        return { namespace, config: config as Record<string, unknown> };
      }
    }
  }
  return findProviderSettings(namespaces, provider);
}

export function providerCredentialRef(
  namespaces: SettingsNamespace[],
  providers: ConfigurableProvider[],
  provider: string,
): string | undefined {
  const ref = resolveProviderSettings(namespaces, providers, provider)?.config.apiKeyEnv;
  return typeof ref === "string" && ref ? ref : undefined;
}

export function providerDefaultBaseURL(
  namespaces: SettingsNamespace[],
  providers: ConfigurableProvider[],
  provider: string,
): string {
  const config = resolveProviderSettings(namespaces, providers, provider)?.config;
  return typeof config?.baseURL === "string" ? config.baseURL : "";
}

export function providerDefaultApi(
  namespaces: SettingsNamespace[],
  providers: ConfigurableProvider[],
  provider: string,
): string {
  const config = resolveProviderSettings(namespaces, providers, provider)?.config;
  return typeof config?.api === "string" ? config.api : "";
}

export function credentialRefTitle(ref: string): string {
  switch (ref) {
    case "XG_GOMODEL_API_KEY":
      return "西谷内网网关 API Key (内置默认)";
    case "DEEPSEEK_API_KEY":
      return "DeepSeek 官方 API Key";
    case "OPENAI_API_KEY":
      return "OpenAI API Key";
    case "ANTHROPIC_API_KEY":
      return "Anthropic API Key";
    case "GEMINI_API_KEY":
      return "Gemini API Key";
    default:
      return ref;
  }
}

export function credentialRefHint(ref: string): string {
  if (ref === "XG_GOMODEL_API_KEY") return "内置内网网关（http://192.168.1.47:9010/v1），保存后自动同步模型列表";
  if (ref === "DEEPSEEK_API_KEY") return "用于 DeepSeek 官方模型服务";
  return "Provider 关联凭据引用";
}

function valueAtPath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function enrichModelGroups(groups: ModelGroup[], namespaces: SettingsNamespace[]): ModelGroup[] {
  return groups.map((group) => {
    const providerConfig = findProviderSettings(namespaces, group.id)?.config;
    const rootNamespace = namespaces.find((namespace) =>
      namespace.ns === group.id || namespace.ns === `llm-${group.id.replace(/-official$/, "")}`
    );
    const configured = providerConfig?.models
      ?? (rootNamespace?.value as Record<string, unknown> | undefined)?.models;
    if (!Array.isArray(configured)) return group;
    const metadata = new Map<string, Record<string, unknown>>();
    for (const raw of configured) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const id = (raw as { id?: unknown }).id;
      if (typeof id === "string") metadata.set(id, raw as Record<string, unknown>);
    }
    return {
      ...group,
      models: group.models.map((model) => {
      const configuredModel = metadata.get(model.id);
      if (!configuredModel) return model;
      const configuredInput = Array.isArray(configuredModel.input)
        ? configuredModel.input
        : configuredModel.inputModalities;
      return {
        ...model,
        input: Array.isArray(configuredInput)
          ? configuredInput.filter((item): item is string => typeof item === "string")
          : model.input,
          contextWindow: typeof configuredModel.contextWindow === "number" ? configuredModel.contextWindow : model.contextWindow,
          maxTokens: typeof configuredModel.maxTokens === "number" ? configuredModel.maxTokens : model.maxTokens,
        };
      }),
    };
  });
}

export function mergeDiscoveredModels(discovered: DiscoveredModel[], configured: unknown): { models: Record<string, unknown>[]; unknownCapabilities: Set<string> } {
  const previous = new Map<string, Record<string, unknown>>();
  if (Array.isArray(configured)) {
    for (const raw of configured) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const id = (raw as { id?: unknown }).id;
      if (typeof id === "string") previous.set(id, raw as Record<string, unknown>);
    }
  }
  const unknownCapabilities = new Set<string>();
  const models = discovered.map((model) => {
    const existing = previous.get(model.id);
    if (!existing || !Array.isArray(existing.input)) unknownCapabilities.add(model.id);
    return {
      ...(existing || {}),
      id: model.id,
      name: model.name || (typeof existing?.name === "string" ? existing.name : model.id),
      ...(model.input ? { input: model.input } : (!existing?.input ? { input: ["text"] } : {})),
      ...(model.contextWindow ? { contextWindow: model.contextWindow } : {}),
      ...(model.maxTokens ? { maxTokens: model.maxTokens } : {}),
    };
  });
  return { models, unknownCapabilities };
}

export function modelCapabilityLabel(model: ModelInfo, unknown = false): string {
  if (unknown) return "能力待确认";
  if (model.input?.includes("image")) return "支持图片";
  if (model.input?.includes("text")) return "仅文本";
  return "能力未声明";
}

export function supportedReasoningEffort(
  groups: ModelGroup[],
  provider: string,
  model: string,
  requested: string,
): string | undefined {
  if (!requested) return undefined;
  const info = groups.find((group) => group.id === provider)?.models.find((item) => item.id === model);
  return info?.reasoning?.efforts.some((effort) => effort.id === requested) ? requested : undefined;
}
