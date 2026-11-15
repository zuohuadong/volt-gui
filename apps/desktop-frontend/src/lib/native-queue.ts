/**
 * DSH 原生待发送队列（session inbox）的读取与展示。
 *
 * 为什么要用原生队列而不是自己维护一份：DSH 已经把排队条目持久化在会话的
 * inbox 里（`session/state` 的 `queue`），重启、换窗口、另一台客户端都能看到同一
 * 份队列，还能原地编辑/插队/取消（`session/updateQueue`）。本地队列在应用重启后
 * 就消失，且和真实 inbox 会打架。
 *
 * 条目形状（官方 `SessionQueuedItem`）：
 * `{ id, placement: "queued" | "steering" | "context", rpcId?, content: JsonValue[] }`
 * `content` 是 `PromptContentPart[]`，文字部分可能有多段。
 */
export type NativeQueuePlacement = "queued" | "steering" | "context";

export type NativeQueueItem = {
  readonly id: string;
  readonly placement: NativeQueuePlacement;
  readonly rpcId?: string;
  readonly text: string;
  readonly attachmentCount: number;
};

/** 队列里的一行：用户能看懂的摘要。 */
export type NativeQueueRow = NativeQueueItem & {
  /** 1 起的位置，仅对 `queued` 有意义。 */
  readonly position?: number;
  readonly summary: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const placementOf = (value: unknown): NativeQueuePlacement =>
  value === "steering" || value === "context" ? value : "queued";

/**
 * 把官方条目转成界面要的形状。
 * 附件只计数不展示内容：队列里的图片可能很大，渲染摘要时不该再复制一遍。
 */
export function toNativeQueueItem(raw: unknown): NativeQueueItem | undefined {
  if (!isRecord(raw) || typeof raw.id !== "string" || !raw.id) return undefined;
  const content = Array.isArray(raw.content) ? raw.content : [];
  const texts: string[] = [];
  let attachmentCount = 0;
  for (const part of content) {
    if (!isRecord(part)) continue;
    if (part.type === "text" && typeof part.text === "string") texts.push(part.text);
    else if (typeof part.type === "string" && part.type !== "text") attachmentCount += 1;
  }
  return {
    id: raw.id,
    placement: placementOf(raw.placement),
    ...(typeof raw.rpcId === "string" && raw.rpcId ? { rpcId: raw.rpcId } : {}),
    text: texts.join("\n"),
    attachmentCount,
  };
}

export function toNativeQueueItems(raw: unknown): NativeQueueItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    const parsed = toNativeQueueItem(item);
    return parsed ? [parsed] : [];
  });
}

/**
 * 队列摘要行。`queued` 按到达顺序编号（第 1 条就是下一轮要发的那条），
 * `steering` 是"当前回合插队"的内容，不参与编号。
 */
export function nativeQueueRows(items: readonly NativeQueueItem[], maxLength = 60): NativeQueueRow[] {
  let position = 0;
  return items.map((item) => {
    const numbered = item.placement === "queued";
    if (numbered) position += 1;
    const text = item.text.trim();
    const truncated = text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
    const attachments = item.attachmentCount > 0 ? `+${item.attachmentCount} 个附件` : "";
    return {
      ...item,
      ...(numbered ? { position } : {}),
      summary: [truncated, attachments].filter(Boolean).join(" · "),
    };
  });
}

/** 只有 `queued` / `steering` 能被客户端改动（`context` 是 agent 自己塞的）。 */
export function isMutableQueueItem(item: NativeQueueItem): boolean {
  return item.placement !== "context";
}

/** 取消/编辑时把文字拿回输入框：多段文字保持原有换行顺序。 */
export function queueItemDraft(item: NativeQueueItem): string {
  return item.text;
}
/**
 * 冷会话里仍然排着的 inbox 条目数（官方 `inbox` 投影）。
 *
 * 没有活动 Agent 时 `session/state` 的 `queue` 是 `null`——那表示"读不到队列"，
 * 不表示"没有队列"。真正的待发送内容还在 `inbox` 投影的 `next-turn`/`next-step`
 * 里，所以这里只统计条数用于提示，绝不凭它伪造可操作的队列行。
 */
export function inboxPendingCount(values: Record<string, unknown> | undefined): number {
  const inbox = values?.inbox;
  if (!isRecord(inbox)) return 0;
  const count = (key: "next-turn" | "next-step"): number => {
    const list = inbox[key];
    return Array.isArray(list) ? list.length : 0;
  };
  return count("next-turn") + count("next-step");
}
