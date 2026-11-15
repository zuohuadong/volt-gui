/**
 * 消息反馈（官方 `messageFeedback` 命名空间）的纯逻辑。
 *
 * 官方用乐观并发：写回时必须带上自己读到的 `version`，否则返回冲突。
 * 这里只做形状校验与"下一次点击该发什么请求"的判定，不缓存服务端状态。
 */

export type FeedbackRating = "positive" | "negative";

export type FeedbackItem = {
  messageId: string;
  rating: FeedbackRating;
  version: string;
  note?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isFeedbackItem(value: unknown): value is FeedbackItem {
  if (!isRecord(value)) return false;
  const { messageId, rating, version } = value;
  return typeof messageId === "string" && messageId.length > 0
    && (rating === "positive" || rating === "negative")
    && typeof version === "string" && version.length > 0;
}

/** 官方列表结果是判别联合：只有 `ok:true` 才带 items，拒绝时要如实上报。 */
export function readFeedbackList(value: unknown): { items: FeedbackItem[]; error?: string } {
  if (!isRecord(value)) return { items: [], error: "invalid" };
  if (value.ok === true && isRecord(value.value) && Array.isArray(value.value.items)) {
    return { items: value.value.items.filter(isFeedbackItem) };
  }
  if (value.ok === false) {
    const failure = isRecord(value.error) ? value.error : undefined;
    const code = typeof failure?.code === "string" ? failure.code : "unknown";
    return { items: [], error: code };
  }
  return { items: [], error: "invalid" };
}

/**
 * 点击一个评分后的动作。
 *
 * - 同一个评分再点一次 = 撤回（官方要求带版本删除）；
 * - 换成另一个评分 = 覆盖写入；
 * - 没有反馈 = 新建，`ifVersion` 必须是 `null`，表示"要求此前不存在"。
 */
export function feedbackAction(
  current: FeedbackItem | undefined,
  rating: FeedbackRating,
): { kind: "put"; ifVersion: string | null } | { kind: "delete"; ifVersion: string } {
  if (current?.rating === rating) return { kind: "delete", ifVersion: current.version };
  return { kind: "put", ifVersion: current?.version ?? null };
}

/**
 * 读一次写回结果。
 *
 * 官方把业务拒绝当成**结果**而不是异常（`dsh-message-feedback/src/types.ts`）：
 * `session-not-found` / `target-not-found` / `version-conflict` / `note-blank` /
 * `note-too-large`。其中 `version-conflict` 还带着服务端当前的 `current`，
 * 必须采纳它，否则下一次点击会继续带着旧版本冲突下去。
 */
export function readFeedbackWrite(value: unknown): { ok: true } | { ok: false; code: string; current?: FeedbackItem | null } {
  if (!isRecord(value)) return { ok: false, code: "invalid" };
  if (value.ok === true) return { ok: true };
  const failure = isRecord(value.error) ? value.error : undefined;
  const code = typeof failure?.code === "string" ? failure.code : "unknown";
  if (code === "version-conflict") {
    const current = failure?.current;
    if (current === null) return { ok: false, code, current: null };
    if (isFeedbackItem(current)) return { ok: false, code, current };
  }
  return { ok: false, code };
}

/** 只有 assistant 消息可以评分：把操作加到别的角色上是无意义的写入。 */
export function canRateMessage(role: string): boolean {
  return role === "assistant";
}