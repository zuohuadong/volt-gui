import { describe, expect, it } from "vitest";
import { startupState } from "./startup-state";

describe("main-process startup deadline", () => {
  const starting = { dshReady: false, startupError: "", startupDeadline: 480_000 };

  it("keeps waiting beyond 70 seconds and throughout the automatic second attempt", () => {
    expect(startupState(starting, 75_000)).toBe("waiting");
    expect(startupState(starting, 200_000)).toBe("waiting");
    expect(startupState({ ...starting, dshReady: true }, 210_000)).toBe("ready");
  });

  it("reports actual failure immediately and expires at the main-process deadline", () => {
    expect(startupState({ ...starting, startupError: "DSH exited" }, 1)).toBe("failed");
    expect(startupState(starting, 480_000)).toBe("timeout");
    expect(startupState({ ...starting, dshReady: true }, 500_000)).toBe("ready");
  });
});
