export type SessionNavigationDirection = -1 | 1;

/**
 * Return the next visible session for keyboard navigation.
 * The list is ordered as presented in the sidebar. Navigation wraps so users can
 * keep cycling without leaving the conversation view.
 */
export function sessionNavigationTarget(
  sessionIds: readonly string[],
  activeSessionId: string,
  direction: SessionNavigationDirection,
): string | undefined {
  if (sessionIds.length === 0) return undefined;
  const activeIndex = activeSessionId ? sessionIds.indexOf(activeSessionId) : -1;
  if (activeIndex < 0) return direction > 0 ? sessionIds[0] : sessionIds.at(-1);
  const nextIndex = (activeIndex + direction + sessionIds.length) % sessionIds.length;
  return sessionIds[nextIndex];
}

type ShortcutEvent = Pick<KeyboardEvent, "key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey">;

/**
 * Session switching uses the same bracket shortcut as Codex desktop, plus
 * page up/down for users who prefer navigation keys. Alt+Arrow is accepted as
 * a compatibility alias while focus is not inside an editor.
 */
export function sessionNavigationShortcut(event: ShortcutEvent): SessionNavigationDirection | undefined {
  const modifier = event.ctrlKey || event.metaKey;
  if (event.altKey && !modifier && !event.shiftKey && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
    return event.key === "ArrowUp" ? -1 : 1;
  }
  if (!modifier || event.altKey) return undefined;
  if (event.shiftKey && (event.key === "[" || event.key === "{")) return -1;
  if (event.shiftKey && (event.key === "]" || event.key === "}")) return 1;
  if (event.key === "PageUp") return -1;
  if (event.key === "PageDown") return 1;
  return undefined;
}

export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const element = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof element.tagName === "string" ? element.tagName.toLowerCase() : "";
  return tag === "input" || tag === "textarea" || tag === "select" || element.isContentEditable === true;
}
export type HistoryJumpTarget = "top" | "bottom";

/** Jump within the currently loaded conversation without changing sessions. */
export function historyJumpShortcut(event: ShortcutEvent): HistoryJumpTarget | undefined {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier || event.altKey || event.shiftKey) return undefined;
  if (event.key === "Home") return "top";
  if (event.key === "End") return "bottom";
  return undefined;
}
