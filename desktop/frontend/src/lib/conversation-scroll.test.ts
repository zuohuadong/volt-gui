import { describe, expect, test } from "vitest";

import {
  conversationPinAfterScroll,
  conversationMovedUp,
  isConversationNearBottom,
  isConversationScrollable,
  scrollConversationToTop,
  shouldAutoScrollConversation,
} from "./conversation-scroll";

describe("conversation scrolling", () => {
  test("only follows streaming output while the reader remains near the bottom", () => {
    expect(isConversationNearBottom({ scrollHeight: 1000, scrollTop: 420, clientHeight: 500 })).toBe(true);
    expect(isConversationNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 500 })).toBe(false);
    expect(shouldAutoScrollConversation(false)).toBe(false);
    expect(shouldAutoScrollConversation(false, true)).toBe(true);
    expect(shouldAutoScrollConversation(true, false, true)).toBe(false);
    expect(shouldAutoScrollConversation(false, true, true)).toBe(false);
  });

  test("ignores upward intent until the transcript can actually scroll", () => {
    expect(isConversationScrollable({ scrollHeight: 500, clientHeight: 500 })).toBe(false);
    expect(isConversationScrollable({ scrollHeight: 502, clientHeight: 500 })).toBe(true);
  });

  test("moves a conversation to the top synchronously", () => {
    const scrollContainer = { scrollTop: 812 };

    scrollConversationToTop(scrollContainer);
    expect(scrollContainer.scrollTop).toBe(0);
  });

  test("does not let a near-bottom native scroll undo an upward gesture", () => {
    const nearBottom = { scrollHeight: 1000, scrollTop: 450, clientHeight: 500 };
    expect(conversationPinAfterScroll(nearBottom, true)).toEqual({
      pinnedToBottom: false,
      manualScrollIntent: true,
    });
    expect(conversationPinAfterScroll({ ...nearBottom, scrollTop: 500 }, true)).toEqual({
      pinnedToBottom: true,
      manualScrollIntent: false,
    });
  });

  test("detects upward native scrolling independently of the bottom threshold", () => {
    expect(conversationMovedUp(undefined, 500)).toBe(false);
    expect(conversationMovedUp(500, 499.5)).toBe(false);
    expect(conversationMovedUp(500, 470)).toBe(true);
  });
});
