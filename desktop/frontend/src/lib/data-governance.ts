import type {
  ScopedMemoryContext,
  ScopedMemoryContextLabels,
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
  user: "用户",
  organization: "组织",
  workspace: "工作区",
  project: "项目",
  thread: "对话",
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

export function scopeLabelForMemoryLayer(
  context: ScopedMemoryContext,
  labels: ScopedMemoryContextLabels | undefined,
  layer: ScopedMemoryLayer,
): string {
  if (layer === "user") return "当前用户";
  const label = labels?.[layer]?.trim();
  if (label) return label;
  const id = scopeIDForMemoryLayer(context, layer);
  if (layer === "organization" && id === "default") return "默认组织";
  if (layer === "workspace" && id === "global") return "全局工作区";
  if (layer === "project" && id === "inbox") return "收件箱";
  if (layer === "thread" && id.startsWith("thread-")) return "当前对话";
  return id || "未绑定";
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

export function formatKnowledgeTimestamp(value?: string, nowMs = Date.now()): string {
  const raw = value?.trim() || "";
  const timestamp = raw ? Date.parse(raw) : Number.NaN;
  if (!Number.isFinite(timestamp)) return raw || "未记录";

  const timeZone = "Asia/Shanghai";
  const values = dateTimeParts(timestamp, timeZone);
  const nowValues = dateParts(nowMs, timeZone);
  const formattedTime = `${values.hour}:${values.minute}`;
  const diffMs = nowMs - timestamp;
  if (diffMs >= 0 && diffMs < 60_000) return "刚刚";
  if (diffMs >= 60_000 && diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`;
  if (diffMs >= 3_600_000 && diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} 小时前`;
  if (sameDate(values, nowValues)) return `今天 ${formattedTime}`;
  if (sameDate(values, dateParts(nowMs - 86_400_000, timeZone))) return `昨天 ${formattedTime}`;
  if (diffMs >= 0 && diffMs < 7 * 86_400_000) return `${Math.floor(diffMs / 86_400_000)} 天前 ${formattedTime}`;
  return `${values.year}-${values.month}-${values.day} ${formattedTime}`;
}

function dateTimeParts(timestamp: number, timeZone: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(timestamp)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function dateParts(timestamp: number, timeZone: string): Record<string, string> {
  return Object.fromEntries(new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp)).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function sameDate(left: Record<string, string>, right: Record<string, string>): boolean {
  return left.year === right.year && left.month === right.month && left.day === right.day;
}
