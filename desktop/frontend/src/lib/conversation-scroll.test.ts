import { describe, expect, test } from "vitest";

import { isConversationNearBottom, shouldAutoScrollConversation } from "./conversation-scroll";

describe("conversation scrolling", () => {
  test("only follows streaming output while the reader remains near the bottom", () => {
    expect(isConversationNearBottom({ scrollHeight: 1000, scrollTop: 420, clientHeight: 500 })).toBe(true);
    expect(isConversationNearBottom({ scrollHeight: 1000, scrollTop: 100, clientHeight: 500 })).toBe(false);
    expect(shouldAutoScrollConversation(false)).toBe(false);
    expect(shouldAutoScrollConversation(false, true)).toBe(true);
  });
});
