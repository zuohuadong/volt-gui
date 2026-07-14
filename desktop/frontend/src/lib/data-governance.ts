import type {
  ScopedMemoryContext,
  ScopedMemoryEntry,
  ScopedMemoryLayer,
  TrustStatus,
  TrustWarning,
} from "./types";

export const MEMORY_LAYER_ORDER = [
  "user",
  "organization",
  "workspace",
  "project",
  "thread",
] as const satisfies readonly ScopedMemoryLayer[];

export const MEMORY_LAYER_LABELS: Record<ScopedMemoryLayer, string> = {
  user: "User",
  organization: "Organization",
  workspace: "Workspace",
  project: "Project",
  thread: "Thread",
};

export interface TrustStatusPresentation {
  label: string;
  tone: TrustStatus;
  description: string;
}

const TRUST_STATUS_PRESENTATIONS: Record<TrustStatus, TrustStatusPresentation> = {
  active: { label: "已启用", tone: "active", description: "当前已启用或由当前运行配置选中，不代表此刻正在传输数据。" },
  configured: { label: "已配置", tone: "configured", description: "已有配置，但不表示已经调用或发送数据。" },
  possible: { label: "按需可能", tone: "possible", description: "具备该能力，仅在用户或任务明确触发时可能发生。" },
  disabled: { label: "已停用", tone: "disabled", description: "当前配置关闭或尚不提供该能力。" },
  unknown: { label: "待确认", tone: "unknown", description: "当前信息不足，无法确认状态。" },
};

export function trustStatusPresentation(status: TrustStatus): TrustStatusPresentation {
  return TRUST_STATUS_PRESENTATIONS[status];
}

const WARNING_PRIORITY: Record<string, number> = { high: 0, medium: 1, info: 2 };

export function sortTrustWarnings(warnings: TrustWarning[]): TrustWarning[] {
  return [...warnings].sort((left, right) =>
    (WARNING_PRIORITY[left.severity] ?? 3) - (WARNING_PRIORITY[right.severity] ?? 3)
    || left.title.localeCompare(right.title, "zh-Hans-CN"),
  );
}

export function scopeIDForMemoryLayer(context: ScopedMemoryContext, layer: ScopedMemoryLayer): string {
  if (layer === "user") return "user";
  if (layer === "organization") return context.organizationId?.trim() ?? "";
  if (layer === "workspace") return context.workspaceId?.trim() ?? "";
  if (layer === "project") return context.projectId?.trim() ?? "";
  return context.threadId?.trim() ?? "";
}

export function groupScopedMemoryEntries(entries: ScopedMemoryEntry[]) {
  return MEMORY_LAYER_ORDER.map((layer) => ({
    layer,
    label: MEMORY_LAYER_LABELS[layer],
    entries: entries
      .filter((entry) => entry.layer === layer)
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
  }));
}

export function formatGovernanceTimestamp(value?: string): string {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return value?.trim() || "未记录";
  return new Date(timestamp).toLocaleString("zh-CN", { hour12: false });
}
