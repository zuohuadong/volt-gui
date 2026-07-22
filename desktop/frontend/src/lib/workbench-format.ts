export function compactIdentifier(value: string | undefined, visibleLength = 8): string {
  const normalized = value?.trim() ?? "";
  if (!normalized || normalized.length <= visibleLength) return normalized;
  return `${normalized.slice(0, visibleLength)}…`;
}

export function formatWorkbenchDateTime(value: string | number | undefined): string {
  if (value === undefined || value === null) return "未记录";
  const raw = String(value).trim();
  if (!raw) return "未记录";
  const timestamp = typeof value === "number" ? value : Date.parse(raw);
  if (!Number.isFinite(timestamp)) return raw;
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp)).replaceAll("/", "-");
}
