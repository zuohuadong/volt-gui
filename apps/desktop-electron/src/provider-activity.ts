type ProviderRecord = Record<string, unknown>;

function asRecord(candidate: unknown): ProviderRecord | undefined {
  return candidate && typeof candidate === "object" && !Array.isArray(candidate)
    ? candidate as ProviderRecord
    : undefined;
}

export function withProviderActivity(providerPayload: unknown, catalogPayload: unknown): ProviderRecord[] {
  if (!Array.isArray(providerPayload)) return [];
  const catalogRecord = asRecord(catalogPayload);
  const rawRoutable = catalogRecord?.routableProviders;
  const routable = Array.isArray(rawRoutable)
    ? new Set(rawRoutable.filter((provider): provider is string => typeof provider === "string"))
    : undefined;

  return providerPayload.flatMap((candidate) => {
    const provider = asRecord(candidate);
    if (!provider) return [];
    const providerId = typeof provider.provider === "string" ? provider.provider : "";
    return [{
      ...provider,
      active: routable ? routable.has(providerId) : provider.active === true,
    }];
  });
}
