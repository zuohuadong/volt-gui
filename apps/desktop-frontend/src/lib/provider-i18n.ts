import type { ConfigurableProvider } from "./dsh-client";
import type { Locale } from "./i18n";

type ProviderCopy = {
  name: string;
  description: string;
};

const KNOWN_PROVIDER_COPY: Record<string, Record<Locale, ProviderCopy>> = {
  "deepseek-official": {
    "zh-CN": { name: "DeepSeek 官方", description: "官方模型服务，使用 DeepSeek API 凭据访问。" },
    "en-US": { name: "DeepSeek Official", description: "Official model service accessed with a DeepSeek API credential." },
  },
  "xg-gomodel": {
    "zh-CN": { name: "XG GOModel", description: "西谷模型网关，提供统一模型目录与访问入口。" },
    "en-US": { name: "XG GOModel", description: "Xigu model gateway with a shared model catalog and access point." },
  },
  openai: {
    "zh-CN": { name: "OpenAI", description: "OpenAI 模型服务，用于配置模型连接与访问凭据。" },
    "en-US": { name: "OpenAI", description: "OpenAI model service for model connections and access credentials." },
  },
};

export function providerDisplayCopy(provider: ConfigurableProvider, locale: Locale): ProviderCopy {
  const known = KNOWN_PROVIDER_COPY[provider.provider];
  if (known) return known[locale];

  const displayName = provider.displayName.trim() || provider.provider;
  return {
    name: displayName,
    description: locale === "zh-CN"
      ? `${displayName} 模型服务，用于配置模型连接与访问凭据。`
      : `${displayName} model service for model connections and access credentials.`,
  };
}
