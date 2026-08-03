import type { ModelInfo } from "./types";

const MODEL_CONNECTION_PATTERN = /connection refused|connection reset|connect timeout|timed out|timeout|\b502\b|\b503\b|\b504\b|连接失败|响应超时|网络错误/i;

export interface ModelAvailabilityIncident {
  failedAt: number;
  reason: string;
}

export type ModelAvailabilityByRef = Record<string, ModelAvailabilityIncident>;

function modelIdentity(model: ModelInfo): string {
  return model.ref || model.name || model.model || model.label || "";
}

function modelErrorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

export function isModelConnectionError(error: unknown): boolean {
  return MODEL_CONNECTION_PATTERN.test(modelErrorText(error));
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
    [ref]: { failedAt, reason: "The latest request failed to connect or timed out; retry or switch models." },
  };
}

export function clearModelConnectionFailure(incidents: ModelAvailabilityByRef, modelRef: string): ModelAvailabilityByRef {
  const ref = modelRef.trim();
  if (!ref || !incidents[ref]) return incidents;
  const { [ref]: _removed, ...remaining } = incidents;
  return remaining;
}

export function decorateModelAvailability(models: ModelInfo[], incidents: ModelAvailabilityByRef): ModelInfo[] {
  return models.map((model) => {
    const incident = incidents[modelIdentity(model)];
    return incident ? { ...model, availability: "unavailable", unavailableReason: incident.reason } : model;
  });
}

export function shouldDeferNewTaskModelSelection(activityMode: string, workLayer: string, activeConversationTabId: string): boolean {
  return activityMode === "work" && workLayer === "newTask" && activeConversationTabId.trim() === "";
}

export function pendingModelSelectionUnavailableReason(models: ModelInfo[], modelRef: string): string {
  const target = models.find((model) => modelIdentity(model) === modelRef.trim());
  if (!target) return "The selected model is no longer published by the model gateway.";
  if (target.availability !== "unavailable") return "";
  return target.unavailableReason || "The selected model is currently unavailable.";
}
