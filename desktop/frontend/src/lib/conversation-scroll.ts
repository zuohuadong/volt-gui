export const CONVERSATION_BOTTOM_THRESHOLD = 80;
export const CONVERSATION_BOTTOM_REPIN_THRESHOLD = 1;

export function isConversationScrollable(
  element: Pick<HTMLElement, "scrollHeight" | "clientHeight">,
): boolean {
  return element.scrollHeight - element.clientHeight > CONVERSATION_BOTTOM_REPIN_THRESHOLD;
}

export function isConversationNearBottom(
  element: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  threshold = CONVERSATION_BOTTOM_THRESHOLD,
): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= threshold;
}

export function shouldAutoScrollConversation(
  pinnedToBottom: boolean,
  force = false,
  manualScrollIntent = false,
): boolean {
  return !manualScrollIntent && (force || pinnedToBottom);
}

export function conversationPinAfterScroll(
  element: Pick<HTMLElement, "scrollHeight" | "scrollTop" | "clientHeight">,
  manualScrollIntent: boolean,
): { pinnedToBottom: boolean; manualScrollIntent: boolean } {
  const bottomDistance = element.scrollHeight - element.scrollTop - element.clientHeight;
  if (manualScrollIntent && bottomDistance > CONVERSATION_BOTTOM_REPIN_THRESHOLD) {
    return { pinnedToBottom: false, manualScrollIntent: true };
  }
  return {
    pinnedToBottom: isConversationNearBottom(element),
    manualScrollIntent: false,
  };
}

export function conversationMovedUp(previousScrollTop: number | undefined, currentScrollTop: number): boolean {
  return previousScrollTop !== undefined && currentScrollTop < previousScrollTop - 1;
}

export function scrollConversationToTop(scrollContainer: Pick<HTMLElement, "scrollTop">): void {
  scrollContainer.scrollTop = 0;
}
