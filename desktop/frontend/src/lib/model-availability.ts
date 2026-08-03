import type { ModelInfo } from "./types";
import { isModelConnectionError } from "./user-error";

export interface ModelAvailabilityIncident {
  failedAt: number;
  reason: string;
}

export type ModelAvailabilityByRef = Record<string, ModelAvailabilityIncident>;

function modelIdentity(model: ModelInfo): string {
  return model.ref || model.name || model.model || model.label || "";
}

export function recordModelConnectionFailure(
  incidents: ModelAvailabilityByRef,
  modelRef: string,
  error: unknown,
  failedAt = Date.now(),
): ModelAvailabilityByRef {
  const ref = modelRef.trim();
  if (!ref || !isModelConnectionError(error)) return incidents;
  return {
    ...incidents,
    [ref]: {
      failedAt,
      reason: "最近一次请求连接失败或超时，可重试或切换模型。",
    },
  };
}

export function clearModelConnectionFailure(
  incidents: ModelAvailabilityByRef,
  modelRef: string,
): ModelAvailabilityByRef {
  const ref = modelRef.trim();
  if (!ref || !incidents[ref]) return incidents;
  const { [ref]: _removed, ...remaining } = incidents;
  return remaining;
}

export function decorateModelAvailability(
  models: ModelInfo[],
  incidents: ModelAvailabilityByRef,
): ModelInfo[] {
  return models.map((model) => {
    const ref = modelIdentity(model);
    const incident = incidents[ref];
    return incident
      ? { ...model, availability: "unavailable", unavailableReason: incident.reason }
      : model;
  });
}

export function shouldDeferNewTaskModelSelection(
  activityMode: string,
  workLayer: string,
  activeConversationTabId: string,
): boolean {
  return activityMode === "work" && workLayer === "newTask" && activeConversationTabId.trim() === "";
}

export function pendingModelSelectionUnavailableReason(models: ModelInfo[], modelRef: string): string {
  const target = models.find((model) => modelIdentity(model) === modelRef.trim());
  if (!target) return "所选模型已从模型网关目录下线，请重新选择。";
  if (target.availability !== "unavailable") return "";
  return target.unavailableReason || "所选模型当前不可用，请重新选择。";
}
