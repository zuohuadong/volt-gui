import { describe, expect, test } from "vitest";

import {
  contextRemainingPercent,
  firstRunChecklistState,
  formatSessionCost,
  modelContextWindow,
  modelSwitchImpact,
} from "./thread-ux";
import type { ProviderView } from "./types";

function provider(overrides: Partial<ProviderView> = {}): ProviderView {
  return {
    name: "alpha",
    kind: "openai-compatible",
    baseUrl: "https://example.invalid",
    models: ["model-large"],
    default: "model-large",
    apiKeyEnv: "ALPHA_API_KEY",
    keySet: true,
    configured: true,
    balanceUrl: "",
    contextWindow: 100_000,
    supportedEfforts: [],
    defaultEffort: "",
    ...overrides,
  };
}

describe("contextRemainingPercent", () => {
  test("reports remaining capacity and clamps exhausted windows", () => {
    expect(contextRemainingPercent({ usedTokens: 25_000, windowTokens: 100_000 })).toBe(75);
    expect(contextRemainingPercent({ usedTokens: 120_000, windowTokens: 100_000 })).toBe(0);
  });

  test("stays honest when no context window is known", () => {
    expect(contextRemainingPercent(undefined)).toBeUndefined();
    expect(contextRemainingPercent({ usedTokens: 0, windowTokens: 0 })).toBeUndefined();
  });
});

describe("formatSessionCost", () => {
  test("does not invent billing data", () => {
    expect(formatSessionCost(undefined, undefined)).toBe("未计费");
    expect(formatSessionCost(0.12, "")).toBe("未计费");
  });

  test("formats a reported currency amount", () => {
    expect(formatSessionCost(0, "USD")).toBe("USD 0.00");
    expect(formatSessionCost(0.0042, "usd")).toBe("USD 0.0042");
    expect(formatSessionCost(12.5, "CNY")).toBe("CNY 12.50");
  });
});

describe("model switch guard", () => {
  test("resolves the provider context window from a model ref", () => {
    expect(modelContextWindow("alpha/model-large", [provider()])).toBe(100_000);
    expect(modelContextWindow("MODEL-LARGE", [provider()])).toBe(100_000);
    expect(modelContextWindow("missing/model", [provider()])).toBeUndefined();
  });

  test("warns at eighty percent and escalates after the target is exceeded", () => {
    expect(modelSwitchImpact(79_999, 100_000).level).toBe("safe");
    expect(modelSwitchImpact(80_000, 100_000)).toMatchObject({ level: "warning", requiresConfirmation: true });
    const exceeded = modelSwitchImpact(120_000, 100_000);
    expect(exceeded).toMatchObject({ level: "exceeded", requiresConfirmation: true });
    expect(exceeded.message).toContain("超过目标模型窗口");
  });

  test("does not block when the target window is unknown", () => {
    expect(modelSwitchImpact(90_000, undefined)).toMatchObject({ level: "unknown", requiresConfirmation: false });
  });

  test("requires an explicit decision when current usage cannot be read", () => {
    expect(modelSwitchImpact(undefined, 100_000)).toMatchObject({
      level: "unavailable",
      requiresConfirmation: true,
    });
  });
});

describe("firstRunChecklistState", () => {
  test("requires real provider, workspace, and ready verification evidence", () => {
    expect(firstRunChecklistState({
      providerConfigured: true,
      workspaceActive: true,
      verificationStatus: "pending",
    })).toEqual({
      modelConnected: true,
      workspaceActive: true,
      verifiedTaskComplete: false,
      completedCount: 2,
    });

    expect(firstRunChecklistState({
      providerConfigured: true,
      workspaceActive: true,
      verificationStatus: "ready",
    }).completedCount).toBe(3);
  });
});
