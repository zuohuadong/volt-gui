import type { ConfigurableProvider, CredentialView, DiscoveredModel, ModelGroup, ModelInfo, SettingsNamespace } from "./dsh-client";
import type { Locale } from "./i18n/types";
import { getLocale } from "./i18n";

export type ProviderSettings = {
  namespace: SettingsNamespace;
  config: Record<string, unknown>;
};

export function modelSelectionKey(provider: string, model: string): string {
  return `${provider}/${model}`;
}

const chineseModelDescriptions: Array<[RegExp, string]> = [
  [/^deepseek-v4-flash$/i, "快速、高效、经济，适用于专注型、常规或并行任务。"],
  [/^deepseek-v4-pro$/i, "更擅长智能体编码、知识问答和复杂推理，适用于复杂或质量要求较高的任务。"],
];

function normalizeModelName(name: string, locale: Locale): string {
  if (locale !== "zh-CN") return name;
  return name
    .replace(/^DeepSeek[- ](V\d+(?:\.\d+)?)[- ](Flash|Pro)$/i,
      (_, version: string, tier: string) => `DeepSeek-${version.toUpperCase()}-${tier.toLowerCase() === "flash" ? "Flash" : "Pro"}`);
}

function localizedDescription(model: ModelInfo, locale: Locale): string {
  const description = model.description?.trim() ?? "";
  if (locale !== "zh-CN") return description;
  if (/[\u3400-\u9fff]/u.test(description)) return description;
  const knownDescription = chineseModelDescriptions.find(([pattern]) => pattern.test(model.id))?.[1];
  if (knownDescription) return knownDescription;
  return description;
}

export function localizeModelInfo(model: ModelInfo, locale: Locale): ModelInfo {
  return {
    ...model,
    name: normalizeModelName(model.name, locale),
    description: localizedDescription(model, locale),
  };
}

export function parseModelSelectionKey(value: string): { provider: string; model: string } {
  const separator = value.indexOf("/");
  if (separator < 0) return { provider: value, model: "" };
  return { provider: value.slice(0, separator), model: value.slice(separator + 1) };
}

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

/**
 * Collect credential references shown in Settings → Advanced.
 *
 * Disabled providers still publish their default `apiKeyEnv` in the settings
 * namespace. Those refs are not usable by any active model route, and an
 * inherited `DEEPSEEK_API_KEY` (for example) would otherwise look configured
 * next to the intranet gateway key. Keep non-provider namespaces (knowledge,
 * integrations) and omit only namespaces whose providers are all inactive.
 */
export function collectCredentialRefs(
  namespaces: SettingsNamespace[],
  providers: ConfigurableProvider[] = [],
): string[] {
  const namespaceActive = new Map<string, boolean>();
  for (const provider of providers) {
    namespaceActive.set(
      provider.settingsNs,
      namespaceActive.get(provider.settingsNs) === true || provider.active === true,
    );
  }
  const refs: string[] = [];
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === "apiKeyEnv" && typeof child === "string" && child && !refs.includes(child)) refs.push(child);
      else visit(child);
    }
  };
  for (const namespace of namespaces) {
    if (namespaceActive.get(namespace.ns) === false) continue;
    visit(namespace.value);
  }
  return refs.sort();
}

export function providerDefaultBaseURL(
  namespaces: SettingsNamespace[],
  providers: ConfigurableProvider[],
  provider: string,
): string {
  const config = resolveProviderSettings(namespaces, providers, provider)?.config;
  return typeof config?.baseURL === "string" ? config.baseURL : "";
}

export function isLocalOrIntranetBaseURL(url: string | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    const host = parsed.hostname.toLowerCase();
    return host === "localhost" || host === "[::1]" || host.endsWith(".local")
      || /^(?:127|10)\.\d+\.\d+\.\d+$/.test(host)
      || /^192\.168\.\d+\.\d+$/.test(host)
      || /^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);
  } catch {
    return false;
  }
}

export function isProviderCredentialOptional(
  namespaces: SettingsNamespace[],
  providers: ConfigurableProvider[],
  provider: string,
): boolean {
  const config = resolveProviderSettings(namespaces, providers, provider)?.config;
  const credentialRef = config?.apiKeyEnv;
  // 显式凭据引用优先于地址类型；内网路由与是否需要 Key 是两个独立维度。
  if (typeof credentialRef === "string" && credentialRef.trim()) return false;
  const baseURL = providerDefaultBaseURL(namespaces, providers, provider);
  return isLocalOrIntranetBaseURL(baseURL);
}

export function providerDefaultApi(
  namespaces: SettingsNamespace[],
  providers: ConfigurableProvider[],
  provider: string,
): string {
  const config = resolveProviderSettings(namespaces, providers, provider)?.config;
  return typeof config?.api === "string" ? config.api : "";
}

export function configuredModelGroups(
  groups: ModelGroup[],
  namespaces: SettingsNamespace[],
  providers: ConfigurableProvider[],
  credentials: Record<string, CredentialView>,
): ModelGroup[] {
  return groups.filter((group) => {
    const descriptor = providers.find((item) => item.provider === group.id);
    if (!descriptor?.active || group.models.length === 0) return false;
    const settings = resolveProviderSettings(namespaces, providers, group.id);
    if (!settings) return false;
    const ref = providerCredentialRef(namespaces, providers, group.id);
    if (ref) return credentials[ref]?.configured === true;
    if (isProviderCredentialOptional(namespaces, providers, group.id)) return true;
    const keyPath = [...(descriptor?.settingsPath ?? ["providers", group.id]), "apiKey"];
    return settings.namespace.secrets.some((secret) =>
      secret.set && JSON.stringify(secret.path) === JSON.stringify(keyPath));
  });
}

export function credentialRefTitle(ref: string): string {
  const isZh = getLocale() === "zh-CN";
  switch (ref) {
    case "XG_GOMODEL_API_KEY":
      return isZh ? "西谷内网网关 API 密钥（内置默认）" : "Xigu Gateway API Key (Built-in)";
    case "DEEPSEEK_API_KEY":
      return isZh ? "DeepSeek 官方 API 密钥" : "DeepSeek Official API Key";
    case "OPENAI_API_KEY":
      return isZh ? "OpenAI API 密钥" : "OpenAI API Key";
    case "ANTHROPIC_API_KEY":
      return isZh ? "Anthropic API 密钥" : "Anthropic API Key";
    case "GEMINI_API_KEY":
      return isZh ? "Gemini API 密钥" : "Gemini API Key";
    case "WEKNORA_API_KEY":
      return isZh ? "外部知识库 API 密钥" : "External Knowledge API Key";
    default:
      return ref;
  }
}

export function credentialRefHint(ref: string): string {
  const isZh = getLocale() === "zh-CN";
  if (ref === "XG_GOMODEL_API_KEY") return isZh ? "内置内网网关，启动时会自动同步模型列表" : "Built-in gateway; models are synchronized at startup";
  if (ref === "DEEPSEEK_API_KEY") return isZh ? "用于 DeepSeek 官方模型服务" : "For the official DeepSeek model service";
  return isZh ? "服务访问凭据引用" : "Service credential reference";
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
        name: typeof configuredModel.name === "string" ? configuredModel.name : model.name,
        description: typeof configuredModel.description === "string" ? configuredModel.description : model.description,
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

export function filterUsableDiscoveredModels(discovered: DiscoveredModel[]): DiscoveredModel[] {
  return discovered.filter((model) => {
    const id = model.id?.trim() ?? "";
    if (!id) return false;
    if (id.includes("/")) return false;
    if (id.startsWith("image-") || id === "qwen-image") return false;
    if (/gpu\d/i.test(id)) return false;
    return true;
  });
}

export function mergeDiscoveredModels(discovered: DiscoveredModel[], configured: unknown): { models: Record<string, unknown>[]; unknownCapabilities: Set<string> } {
  const validDiscovered = filterUsableDiscoveredModels(discovered);
  const previous = new Map<string, Record<string, unknown>>();
  if (Array.isArray(configured)) {
    for (const raw of configured) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const id = (raw as { id?: unknown }).id;
      if (typeof id === "string") previous.set(id, raw as Record<string, unknown>);
    }
  }
  const unknownCapabilities = new Set<string>();
  const models = validDiscovered.map((model) => {
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

export function modelSupportsImages(model: ModelInfo | undefined): boolean {
  return model?.input?.includes("image") ?? false;
}

export function preferredImageModel(groups: ModelGroup[], selected: string): { provider: string; model: ModelInfo } | undefined {
  const { provider } = parseModelSelectionKey(selected);
  const candidates = groups.flatMap((group) =>
    group.models.filter(modelSupportsImages).map((model) => ({ provider: group.id, model })),
  );
  return candidates.find((candidate) => candidate.provider === provider) ?? candidates[0];
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
