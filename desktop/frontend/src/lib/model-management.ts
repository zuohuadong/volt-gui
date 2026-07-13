import type { ProviderView } from "./types";

export type ModelProviderFilter = "all" | "configured" | "missing-key";

export type ModelProviderSummary = {
  total: number;
  configured: number;
  pending: number;
  models: number;
};

export type ModelCandidate = {
  name: string;
  ref: string;
  isDefault: boolean;
};

function clean(value: string | undefined): string {
  return (value ?? "").trim();
}

function normalized(value: string | undefined): string {
  return clean(value).toLocaleLowerCase();
}

function displayModelRef(provider: string, model: string): string {
  return `${clean(provider)}/${clean(model)}`;
}

function providerIsConfigured(provider: ProviderView): boolean {
  if (typeof provider.configured === "boolean") return provider.configured;
  return provider.requiresKey ? provider.keySet : true;
}

function providerModels(provider: ProviderView): string[] {
  const models = provider.models.length ? provider.models : provider.default ? [provider.default] : [];
  const seen = new Set<string>();
  return models.flatMap((model) => {
    const name = clean(model);
    const key = normalized(name);
    if (!name || seen.has(key)) return [];
    seen.add(key);
    return [name];
  });
}

export function normalizedModelRef(provider: string, model: string): string {
  return `${normalized(provider)}/${normalized(model)}`;
}

export function modelProviderStatusLabel(provider: ProviderView): "已配置" | "免密" | "缺少 Key" {
  if (provider.requiresKey && !provider.keySet) return "缺少 Key";
  if (!providerIsConfigured(provider)) return "缺少 Key";
  if (!provider.requiresKey && !provider.keySet) return "免密";
  return "已配置";
}

export function modelProviderSummary(providers: ProviderView[]): ModelProviderSummary {
  const configured = providers.filter(providerIsConfigured).length;
  return {
    total: providers.length,
    configured,
    pending: providers.length - configured,
    models: providers.reduce((total, provider) => total + providerModels(provider).length, 0),
  };
}

export function filterModelProviders(
  providers: ProviderView[],
  query: string,
  filter: ModelProviderFilter,
): ProviderView[] {
  const keyword = normalized(query);
  return providers.filter((provider) => {
    const configured = providerIsConfigured(provider);
    if (filter === "configured" && !configured) return false;
    if (filter === "missing-key" && configured) return false;
    if (!keyword) return true;
    return [
      provider.name,
      provider.kind,
      provider.baseUrl,
      provider.apiKeyEnv,
      provider.default,
      ...providerModels(provider),
    ].some((value) => normalized(value).includes(keyword));
  });
}

export function providerModelIsDefault(
  provider: ProviderView,
  model: string,
  defaultModel: string,
  providers: ProviderView[],
): boolean {
  const defaultValue = normalized(defaultModel).replace(/^\/+|\/+$/g, "");
  if (!defaultValue) return false;

  const providerName = normalized(provider.name);
  const modelName = normalized(model);
  const candidateRef = normalizedModelRef(provider.name, model);
  if (defaultValue.includes("/")) return defaultValue === candidateRef;

  if (defaultValue === providerName) {
    const providerDefault = normalized(provider.default || providerModels(provider)[0]);
    return modelName === providerDefault;
  }

  const matches = providers.flatMap((candidateProvider) => providerModels(candidateProvider)
    .filter((candidateModel) => normalized(candidateModel) === defaultValue)
    .map((candidateModel) => normalizedModelRef(candidateProvider.name, candidateModel)));
  return matches.length === 1 && matches[0] === candidateRef;
}

export function modelCandidatesForProvider(
  provider: ProviderView,
  defaultModel: string,
  providers: ProviderView[],
): ModelCandidate[] {
  return providerModels(provider).map((model) => ({
    name: model,
    ref: displayModelRef(provider.name, model),
    isDefault: providerModelIsDefault(provider, model, defaultModel, providers),
  }));
}
