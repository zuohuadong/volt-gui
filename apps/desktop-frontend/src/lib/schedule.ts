/**
 * 定时任务（官方 `schedule` 命名空间）的纯逻辑。
 *
 * Host 拥有任务存储与投递；这里只做形状校验与展示文案。任务“是否真的送达过”
 * 以官方 `lastDelivery` 回执为准，界面不根据时间推测。
 */

export type ScheduleStatus = "active" | "paused" | "ended";

export type ScheduleRow = {
  id: string;
  title: string;
  prompt: string;
  kind: string;
  status: ScheduleStatus;
  scheduledAt?: string;
  /** 规则的人类可读描述（由 `kind` 与规则字段拼出，不猜测时区）。 */
  rule: string;
  updatedAt?: string;
  lastDeliveredAt?: string;
  targetSessionId?: string;
};

const STATUSES: ReadonlySet<string> = new Set(["active", "paused", "ended"]);
const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];

export function isScheduleRow(value: unknown): value is ScheduleRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === "string" && record.id.length > 0
    && typeof record.title === "string"
    && typeof record.prompt === "string"
    && typeof record.kind === "string"
    && typeof record.status === "string" && STATUSES.has(record.status);
}

/**
 * 规则文案：只翻译已知 kind，未知规则原样显示，避免编造。
 *
 * 读的是 `schedule/list` 返回的 **`ScheduleCatalogEntry`**（输出记录），字段是
 * camelCase：`afterSeconds`/`everySeconds`/`scheduledAt`/`expression`/`rrule`。
 * `ScheduleTiming`（输入）里的 `after_seconds`/`at`/`every_seconds` 是另一套形状，
 * 拿它读输出会让三种规则都退化成裸 kind。
 */
export function describeRule(record: Record<string, unknown>): string {
  const kind = typeof record.kind === "string" ? record.kind : "";
  const time = typeof record.time === "string" ? record.time.slice(0, 5) : "";
  const zone = typeof record.timeZone === "string" ? record.timeZone : "";
  const suffix = zone ? `（${zone}）` : "";
  const instant = typeof record.scheduledAt === "string" ? record.scheduledAt : "";
  if (kind === "after" && typeof record.afterSeconds === "number") return `一次性 · ${Math.round(record.afterSeconds / 60)} 分钟后`;
  if (kind === "at" && instant) return `一次性 · ${instant}`;
  if (kind === "every" && typeof record.everySeconds === "number") return `每 ${Math.round(record.everySeconds / 60)} 分钟`;
  if (kind === "daily" && time) return `每天 ${time}${suffix}`;
  if (kind === "weekly" && time && Array.isArray(record.weekdays)) {
    const days = record.weekdays
      .filter((day): day is number => typeof day === "number" && day >= 1 && day <= 7)
      .map((day) => WEEKDAY_LABELS[day - 1])
      .join("、");
    return `${days || "每周"} ${time}${suffix}`;
  }
  if (kind === "cron" && typeof record.expression === "string") return `cron ${record.expression}${suffix}`;
  if (kind === "rrule" && typeof record.rrule === "string") return `RRULE ${record.rrule}`;
  return kind || "未知规则";
}

/** 把 `schedule/list` 的一页压成行；坏行丢弃，不因一条脏数据空掉整页。 */
export function normalizeSchedule(value: unknown): { rows: ScheduleRow[]; total: number } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { rows: [], total: 0 };
  const record = value as Record<string, unknown>;
  const items = Array.isArray(record.items) ? record.items : [];
  const rows: ScheduleRow[] = [];
  for (const item of items) {
    if (!isScheduleRow(item)) continue;
    const data = item as unknown as Record<string, unknown>;
    const lastDelivery = data.lastDelivery && typeof data.lastDelivery === "object" && !Array.isArray(data.lastDelivery)
      ? data.lastDelivery as Record<string, unknown>
      : undefined;
    const target = data.target && typeof data.target === "object" && !Array.isArray(data.target)
      ? data.target as Record<string, unknown>
      : undefined;
    rows.push({
      id: item.id,
      title: item.title,
      prompt: item.prompt,
      kind: item.kind,
      status: item.status,
      rule: describeRule(data),
      ...(typeof data.scheduledAt === "string" ? { scheduledAt: data.scheduledAt } : {}),
      ...(typeof data.updatedAt === "string" ? { updatedAt: data.updatedAt } : {}),
      ...(typeof lastDelivery?.deliveredAt === "string" ? { lastDeliveredAt: lastDelivery.deliveredAt } : {}),
      // `target.sessionId` 只属于 `kind: "existing"`；`new_once`/`new` 没有固定会话，
      // 这时用最近的投递回执里的 `targetSessionId`，都没有就不猜。
      ...(typeof target?.sessionId === "string"
        ? { targetSessionId: target.sessionId }
        : typeof lastDelivery?.targetSessionId === "string" ? { targetSessionId: lastDelivery.targetSessionId } : {}),
    });
  }
  const total = typeof record.total === "number" && Number.isSafeInteger(record.total) ? record.total : rows.length;
  return { rows, total };
}

/** 状态过滤：官方用 `active` 三态（true/false/缺省）。 */
export function scheduleFilter(filter: "all" | "active" | "inactive"): { active?: boolean } {
  if (filter === "active") return { active: true };
  if (filter === "inactive") return { active: false };
  return {};
}

/** 暂停/恢复用官方 `edit` 的 `patch.active`，不新建其它写路径。 */
export function scheduleToggleRequest(row: ScheduleRow): Record<string, unknown> {
  return {
    id: row.id,
    action: "update",
    patch: { active: row.status !== "active" },
    ...(row.updatedAt ? { expectedUpdatedAt: row.updatedAt } : {}),
  };
}

export function scheduleDeleteRequest(row: ScheduleRow): Record<string, unknown> {
  return {
    id: row.id,
    action: "delete",
    ...(row.updatedAt ? { expectedUpdatedAt: row.updatedAt } : {}),
  };
}

export function scheduleRunRequest(row: ScheduleRow): Record<string, unknown> {
  return { id: row.id };
}

/** 冲突/未找到是官方的非异常结果，界面必须能分辨它们和真正的失败。 */
export function scheduleOutcomeCode(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const code = (value as Record<string, unknown>).code;
  return typeof code === "string" ? code : "";
}