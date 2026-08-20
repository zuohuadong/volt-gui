import type { ProviderView } from "./types";

type ContextWindowSnapshot = {
  usedTokens: number;
  windowTokens: number;
};

export type ModelSwitchImpact = {
  level: "unknown" | "unavailable" | "safe" | "warning" | "exceeded";
  requiresConfirmation: boolean;
  ratio?: number;
  message: string;
};

export type FirstRunChecklistState = {
  modelConnected: boolean;
  workspaceActive: boolean;
  verifiedTaskComplete: boolean;
  completedCount: number;
};

export function contextRemainingPercent(context: ContextWindowSnapshot | undefined): number | undefined {
  if (!context || !Number.isFinite(context.windowTokens) || context.windowTokens <= 0) return undefined;
  const used = Number.isFinite(context.usedTokens) ? Math.max(0, context.usedTokens) : 0;
  return Math.max(0, Math.min(100, Math.round((1 - used / context.windowTokens) * 100)));
}

export function contextRemainingTokens(context: ContextWindowSnapshot | undefined): number | undefined {
  if (!context || !Number.isFinite(context.windowTokens) || context.windowTokens <= 0) return undefined;
  const used = Number.isFinite(context.usedTokens) ? Math.max(0, context.usedTokens) : 0;
  return Math.max(0, context.windowTokens - used);
}

export function formatSessionCost(cost: number | undefined, currency: string | undefined): string {
  const normalizedCurrency = currency?.trim().toUpperCase();
  if (!normalizedCurrency || cost === undefined || !Number.isFinite(cost) || cost < 0) return "未计费";
  const decimals = cost > 0 && cost < 0.01 ? 4 : 2;
  return `${normalizedCurrency} ${cost.toFixed(decimals)}`;
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function positiveWindow(value: number): number | undefined {
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

export function modelContextWindow(modelRef: string, providers: ProviderView[]): number | undefined {
  const target = normalize(modelRef).replace(/^\/+|\/+$/g, "");
  if (!target) return undefined;

  const direct = providers.find((provider) => {
    const providerName = normalize(provider.name);
    return target === providerName || target.startsWith(`${providerName}/`);
  });
  if (direct) return positiveWindow(direct.contextWindow);

  const byModel = providers.filter((provider) => {
    const models = provider.models.length ? provider.models : provider.default ? [provider.default] : [];
    return models.some((model) => normalize(model) === target);
  });
  return byModel.length === 1 ? positiveWindow(byModel[0].contextWindow) : undefined;
}

function formatTokens(tokens: number): string {
  return Math.max(0, Math.round(tokens)).toLocaleString("en-US");
}

export function modelSwitchImpact(usedTokens: number | undefined, targetWindowTokens: number | undefined): ModelSwitchImpact {
  if (!targetWindowTokens || !Number.isFinite(targetWindowTokens) || targetWindowTokens <= 0) {
    return {
      level: "unknown",
      requiresConfirmation: false,
      message: "目标模型的上下文窗口未知，无法预估切换影响。",
    };
  }

  if (usedTokens === undefined || !Number.isFinite(usedTokens)) {
    return {
      level: "unavailable",
      requiresConfirmation: true,
      message: "无法读取当前 Thread 的上下文用量，因此不能确认切换到更小窗口是否会触发压缩或失败。仍要切换吗？",
    };
  }

  const used = Math.max(0, usedTokens);
  const ratio = used / targetWindowTokens;
  if (ratio > 1) {
    return {
      level: "exceeded",
      requiresConfirmation: true,
      ratio,
      message: `当前已使用 ${formatTokens(used)} tokens，超过目标模型窗口 ${formatTokens(targetWindowTokens)} tokens。切换后很可能立即压缩上下文或导致请求失败。仍要切换吗？`,
    };
  }
  if (ratio >= 0.8) {
    return {
      level: "warning",
      requiresConfirmation: true,
      ratio,
      message: `当前已使用 ${formatTokens(used)} tokens，占目标模型窗口 ${formatTokens(targetWindowTokens)} tokens 的 ${Math.round(ratio * 100)}%。切换后可能压缩上下文或导致请求失败。仍要切换吗？`,
    };
  }
  return { level: "safe", requiresConfirmation: false, ratio, message: "" };
}

export function firstRunChecklistState({
  providerConfigured,
  workspaceActive,
  verificationStatus,
}: {
  providerConfigured: boolean;
  workspaceActive: boolean;
  verificationStatus: string | undefined;
}): FirstRunChecklistState {
  const verifiedTaskComplete = verificationStatus === "ready";
  return {
    modelConnected: providerConfigured,
    workspaceActive,
    verifiedTaskComplete,
    completedCount: Number(providerConfigured) + Number(workspaceActive) + Number(verifiedTaskComplete),
  };
}
