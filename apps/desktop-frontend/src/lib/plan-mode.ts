/**
 * 规划模式的纯逻辑。
 *
 * 官方把状态放在会话投影 `plan` 上（`{active, pending}`），计划正文则来自
 * `exit_plan_mode` 工具调用的 `plan` 参数。这里不保存任何计划副本：读不到就是
 * 读不到，界面不猜测。
 */

export type PlanState = { active: boolean; pending: boolean };

export const EXIT_PLAN_MODE_TOOL = "exit_plan_mode";

/** 从会话投影值里读规划状态；投影缺失等于"没有这个能力"，而不是"未开启"。 */
export function planState(values: Record<string, unknown> | undefined): PlanState | null {
  const value = values?.plan;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.active !== "boolean") return null;
  return { active: record.active, pending: record.pending === true };
}

/** `/plan` 的开关命令：官方把 `/plan off` 当作退出，其余输入都当作进入。 */
export function planToggleCommand(active: boolean): string {
  return active ? "/plan off" : "/plan";
}

/**
 * `exit_plan_mode` 的工具参数必须是 `{ plan: string }`。
 *
 * 官方 `tool/call` 事件的 `arguments` 是**模型产出的原始 JSON 字符串**
 * （`dsh-session/src/types.ts` 的 `'tool/call'`），不是已解析的对象。
 */
export function planTextFromArgs(args: unknown): string | null {
  let parsed = args;
  if (typeof args === "string") {
    try {
      parsed = JSON.parse(args);
    } catch {
      return null;
    }
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const plan = (parsed as Record<string, unknown>).plan;
  return typeof plan === "string" && plan.trim() ? plan : null;
}

/** 计划卡片标题：正文第一个 Markdown 标题；没有标题时用兜底文案。 */
export function planTitle(plan: string, fallback: string): string {
  const match = /^#{1,6}[ \t]+(.+?)[ \t]*$/mu.exec(plan);
  return match?.[1] ? match[1] : fallback;
}

/** 官方计划审批问题带 `intent.kind === "plan-review"`，界面对它做专门渲染。 */
export function isPlanReviewQuestion(intent: unknown): { approve: string } | null {
  if (!intent || typeof intent !== "object" || Array.isArray(intent)) return null;
  const record = intent as Record<string, unknown>;
  if (record.kind !== "plan-review") return null;
  const approve = typeof record.approve === "string" ? record.approve : "";
  return approve ? { approve } : null;
}

export type PlanCard = { callId: string; text: string; approved: boolean | null };

type HistoryEntry = { event: { type: string; seq?: number; data?: Record<string, unknown> } };

/**
 * 从历史事件里恢复计划卡片。
 *
 * 官方证据只有三样：
 * 1. `tool/call` 的 `name === "exit_plan_mode"`（`arguments` 是 JSON 字符串）；
 * 2. 配对的 `tool/result` 用 `data.message.toolCallId` 关联（不是 `callId`）；
 * 3. `plan/mode` 事件——批准后官方会追加 `{active:false}`。
 *
 * 因此：调用带 `error` = 用户选择继续规划；成功且之后出现 `plan/mode {active:false}`
 * = 已批准；成功但没有该事件 = 用户用自然语言回复、仍在规划。绝不从英文结果文案
 * 或编造的 `result.approved` 字段猜审批结果。
 */
export function planCardsFromHistory(entries: readonly HistoryEntry[]): PlanCard[] {
  const cards: PlanCard[] = [];
  const pending = new Map<string, { text: string; seq: number }>();
  const texts = new Map<string, string>();
  const approvedAt = new Map<string, number>();
  const planModeOff: number[] = [];
  for (const entry of entries) {
    const { type, data } = entry.event;
    if (!data) continue;
    const seq = typeof entry.event.seq === "number" ? entry.event.seq : 0;
    if (type === "plan/mode") {
      if (data.active === false) planModeOff.push(seq);
      continue;
    }
    if (type === "tool/call") {
      if (data.name !== EXIT_PLAN_MODE_TOOL) continue;
      const text = planTextFromArgs(data.arguments ?? data.args);
      const callId = typeof data.callId === "string" ? data.callId : "";
      if (!text || !callId) continue;
      pending.set(callId, { text, seq });
      texts.set(callId, text);
      continue;
    }
    if (type === "tool/result") {
      const message = data.message && typeof data.message === "object" && !Array.isArray(data.message)
        ? data.message as Record<string, unknown>
        : undefined;
      const toolCallId = typeof message?.toolCallId === "string" ? message.toolCallId : "";
      const card = toolCallId ? pending.get(toolCallId) : undefined;
      if (!card || !toolCallId) continue;
      pending.delete(toolCallId);
      if (data.error) continue;
      approvedAt.set(toolCallId, seq);
    }
  }
  for (const [callId, resultSeq] of approvedAt) {
    const text = texts.get(callId);
    if (!text) continue;
    // 批准的唯一官方证据：这次结果之后出现了 `plan/mode {active:false}`。
    cards.push({ callId, text, approved: planModeOff.some((seq) => seq > resultSeq) });
  }
  // 仍在等待审批的计划也要显示：用户需要看到自己正在审批什么。
  for (const [callId, card] of pending) cards.push({ callId, text: card.text, approved: null });
  return cards;
}
