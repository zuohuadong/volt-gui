import { describe, expect, test } from "bun:test";

import {
  filterModelProviders,
  modelCandidatesForProvider,
  modelProviderStatusLabel,
  modelProviderSummary,
  normalizedModelRef,
  providerModelIsDefault,
} from "../src/lib/model-management";
import type { ProviderView } from "../src/lib/types";

function provider(overrides: Partial<ProviderView>): ProviderView {
  return {
    name: "provider",
    kind: "openai",
    baseUrl: "https://models.example.test/v1",
    models: ["model"],
    default: "model",
    apiKeyEnv: "MODEL_API_KEY",
    keySet: true,
    requiresKey: true,
    configured: true,
    balanceUrl: "",
    contextWindow: 128_000,
    supportedEfforts: [],
    defaultEffort: "",
    ...overrides,
  };
}

describe("model management product semantics", () => {
  const providers = [
    provider({ name: "secure", models: ["chat", "code"] }),
    provider({
      name: "local",
      kind: "openai-local",
      baseUrl: "http://127.0.0.1:11434/v1",
      models: ["local-chat"],
      apiKeyEnv: "",
      keySet: false,
      requiresKey: false,
    }),
    provider({
      name: "missing",
      models: ["missing-chat"],
      keySet: false,
      configured: false,
    }),
  ];

  test("uses configuration labels without claiming network connectivity", () => {
    expect(providers.map(modelProviderStatusLabel)).toEqual(["已配置", "免密", "缺少 Key"]);
    expect(providers.map(modelProviderStatusLabel)).not.toContain("已连接");
    expect(modelProviderStatusLabel(provider({ configured: false, requiresKey: undefined, keySet: false }))).toBe("缺少 Key");
    expect(modelProviderSummary(providers)).toEqual({
      total: 3,
      configured: 2,
      pending: 1,
      models: 4,
    });
  });

  test("filters by configuration state and searches provider or model metadata", () => {
    expect(filterModelProviders(providers, "", "configured").map((item) => item.name)).toEqual(["secure", "local"]);
    expect(filterModelProviders(providers, "", "missing-key").map((item) => item.name)).toEqual(["missing"]);
    expect(filterModelProviders(providers, "local-chat", "all").map((item) => item.name)).toEqual(["local"]);
    expect(filterModelProviders(providers, "11434", "all").map((item) => item.name)).toEqual(["local"]);
  });

  test("normalizes provider refs and never marks duplicate bare model names as default", () => {
    const duplicateProviders = [
      provider({ name: "alpha", models: ["shared", "alpha-only"], default: "shared" }),
      provider({ name: "beta", models: ["shared", "beta-only"], default: "shared" }),
    ];

    expect(normalizedModelRef(" Alpha ", " shared ")).toBe("alpha/shared");
    expect(providerModelIsDefault(duplicateProviders[0], "shared", "alpha/shared", duplicateProviders)).toBe(true);
    expect(providerModelIsDefault(duplicateProviders[1], "shared", "alpha/shared", duplicateProviders)).toBe(false);
    expect(providerModelIsDefault(duplicateProviders[0], "shared", "alpha", duplicateProviders)).toBe(true);
    expect(providerModelIsDefault(duplicateProviders[0], "alpha-only", "alpha", duplicateProviders)).toBe(false);
    expect(providerModelIsDefault(duplicateProviders[0], "shared", "shared", duplicateProviders)).toBe(false);
    expect(providerModelIsDefault(duplicateProviders[0], "alpha-only", "alpha-only", duplicateProviders)).toBe(true);
  });

  test("deduplicates candidate models and preserves the exact default ref", () => {
    const alpha = provider({
      name: " Alpha ",
      models: [" shared ", "shared", " alpha-only ", ""],
      default: "shared",
    });

    expect(modelCandidatesForProvider(alpha, "alpha/alpha-only", [alpha])).toEqual([
      { name: "shared", ref: "Alpha/shared", isDefault: false },
      { name: "alpha-only", ref: "Alpha/alpha-only", isDefault: true },
    ]);
  });
});
