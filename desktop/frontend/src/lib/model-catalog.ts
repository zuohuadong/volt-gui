import type { ProviderView } from "./types";

export type ModelCard = {
  name: string;
  provider: string;
  role: string;
  status: string;
  ref: string;
};

function modelRef(provider: ProviderView, model: string): string {
  return `${provider.name}/${model}`;
}

function isDefaultModel(provider: ProviderView, model: string, defaultModel: string): boolean {
  return defaultModel === provider.name
    || defaultModel === model
    || defaultModel === modelRef(provider, model);
}

export function modelCardsFromConfiguredProviders(
  providers: ProviderView[],
  defaultModel: string,
): ModelCard[] {
  return providers
    .filter((provider) => provider.configured)
    .flatMap((provider) => {
      const models = provider.models.length > 0
        ? provider.models
        : provider.default
          ? [provider.default]
          : [];
      return models.map((model) => ({
        name: model,
        provider: provider.name,
        role: isDefaultModel(provider, model, defaultModel)
          ? "默认对话模型"
          : `${provider.kind || "provider"} / ${provider.baseUrl || "未配置 endpoint"}`,
        status: "已配置",
        ref: modelRef(provider, model),
      }));
    });
}
