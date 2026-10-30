import { describe, expect, it } from "vitest";
import {
  historyJumpShortcut,
  isEditableShortcutTarget,
  sessionNavigationShortcut,
  sessionNavigationTarget,
} from "./session-navigation";

describe("session history keyboard navigation", () => {
  it("moves to previous and next conversations and wraps at both ends", () => {
    const ids = ["newest", "middle", "oldest"];
    expect(sessionNavigationTarget(ids, "middle", -1)).toBe("newest");
    expect(sessionNavigationTarget(ids, "middle", 1)).toBe("oldest");
    expect(sessionNavigationTarget(ids, "newest", -1)).toBe("oldest");
    expect(sessionNavigationTarget(ids, "oldest", 1)).toBe("newest");
  });

  it("opens the first or last conversation when none is selected yet", () => {
    expect(sessionNavigationTarget(["a", "b"], "", 1)).toBe("a");
    expect(sessionNavigationTarget(["a", "b"], "", -1)).toBe("b");
    expect(sessionNavigationTarget([], "", 1)).toBeUndefined();
  });

  it("accepts Codex-style bracket shortcuts and navigation-key aliases", () => {
    expect(sessionNavigationShortcut({ key: "[", ctrlKey: false, metaKey: true, shiftKey: true, altKey: false })).toBe(-1);
    expect(sessionNavigationShortcut({ key: "}", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })).toBe(1);
    expect(sessionNavigationShortcut({ key: "PageUp", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe(-1);
    expect(sessionNavigationShortcut({ key: "ArrowDown", ctrlKey: false, metaKey: false, shiftKey: false, altKey: true })).toBe(1);
    expect(sessionNavigationShortcut({ key: "]", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBeUndefined();
    expect(sessionNavigationShortcut({ key: "ArrowDown", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBeUndefined();
  });

  it("provides shortcuts to jump to the oldest or latest loaded history", () => {
    expect(historyJumpShortcut({ key: "Home", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false })).toBe("top");
    expect(historyJumpShortcut({ key: "End", ctrlKey: false, metaKey: true, shiftKey: false, altKey: false })).toBe("bottom");
    expect(historyJumpShortcut({ key: "Home", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false })).toBeUndefined();
    expect(historyJumpShortcut({ key: "End", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false })).toBeUndefined();
  });

  it("detects editor targets for the Alt+Arrow compatibility alias", () => {
    expect(isEditableShortcutTarget({ tagName: "TEXTAREA" } as unknown as EventTarget)).toBe(true);
    expect(isEditableShortcutTarget({ tagName: "div", isContentEditable: true } as unknown as EventTarget)).toBe(true);
    expect(isEditableShortcutTarget({ tagName: "BUTTON" } as unknown as EventTarget)).toBe(false);
    expect(isEditableShortcutTarget(null)).toBe(false);
  });
});