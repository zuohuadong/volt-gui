import type { DesktopBootstrap } from "../electron";

export function startupState(info: Pick<DesktopBootstrap, "dshReady" | "startupError" | "startupDeadline">, now: number): "ready" | "failed" | "waiting" | "timeout" {
  if (info.startupError) return "failed";
  if (info.dshReady) return "ready";
  return now >= info.startupDeadline ? "timeout" : "waiting";
}
