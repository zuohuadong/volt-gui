export const CONVERSATION_BOTTOM_THRESHOLD = 80;

export function isConversationNearBottom(
  element: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  threshold = CONVERSATION_BOTTOM_THRESHOLD,
): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

export function shouldAutoScrollConversation(pinnedToBottom: boolean, force = false): boolean {
  return force || pinnedToBottom;
}
