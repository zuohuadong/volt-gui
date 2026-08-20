import { describe, expect, test } from "bun:test";

import { modelCardsFromConfiguredProviders } from "../src/lib/model-catalog";
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
    configured: true,
    balanceUrl: "",
    contextWindow: 128_000,
    supportedEfforts: [],
    defaultEffort: "",
    ...overrides,
  };
}

describe("configured model catalog", () => {
  test("builds selectable model cards only from configured providers", () => {
    const cards = modelCardsFromConfiguredProviders([
      provider({ name: "real", models: ["real-chat", "real-code"], default: "real-chat" }),
      provider({ name: "missing-key", models: ["mock-looking-model"], configured: false, keySet: false }),
    ], "real/real-code");

    expect(cards).toEqual([
      {
        name: "real-chat",
        provider: "real",
        role: "openai / https://models.example.test/v1",
        status: "已配置",
        ref: "real/real-chat",
      },
      {
        name: "real-code",
        provider: "real",
        role: "默认对话模型",
        status: "已配置",
        ref: "real/real-code",
      },
    ]);
  });

  test("returns no fallback models when no provider is configured", () => {
    expect(modelCardsFromConfiguredProviders([
      provider({ configured: false, keySet: false }),
    ], "")).toEqual([]);
  });
});
