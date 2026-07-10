import { describe, expect, test } from "bun:test";

import { isToolDetailsOpen, setToolOpenState } from "../src/lib/tool-open-state";

describe("tool details open state", () => {
  test("keeps an explicitly opened archived tool expanded after its result state changes", () => {
    const id = "history-tool-12-call-archive";
    const opened = setToolOpenState({}, id, true);

    expect(isToolDetailsOpen(opened, id, false)).toBe(true);
    // Archive loading changes the transcript item but not the user's explicit
    // disclosure choice, so the first click still reveals loaded evidence.
    expect(isToolDetailsOpen(opened, id, false)).toBe(true);
  });

  test("allows a user to close a completed tool card", () => {
    const id = "tool-call-1";
    const closed = setToolOpenState({ [id]: true }, id, false);

    expect(isToolDetailsOpen(closed, id, false)).toBe(false);
  });
});
