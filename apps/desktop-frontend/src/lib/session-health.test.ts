import { describe, expect, it } from "vitest";
import { agentPresetLocked, clearsSessionError, sessionHealth, sessionHealthLabel } from "./session-health";

const base = { sessionId: "s1", updatedAt: 0, running: false, blank: false };

describe("sessionHealth", () => {
  it("prioritizes running state and detects projection failures", () => {
    expect(sessionHealth({ ...base, running: true })).toBe("running");
    expect(sessionHealth(base, true)).toBe("error");
    expect(sessionHealth({ ...base, projections: { values: { lastError: "missing key" } } })).toBe("error");
    expect(sessionHealth(base)).toBe("ok");
    expect(sessionHealthLabel("error")).toBe("运行异常");
  });

  it("locks Agent presets after the session has started", () => {
    expect(agentPresetLocked({ ...base, blank: true }, 0)).toBe(false);
    expect(agentPresetLocked({ ...base, blank: false }, 0)).toBe(true);
    expect(agentPresetLocked({ ...base, blank: true }, 1)).toBe(true);
  });

  it("keeps failure state for error turn endings", () => {
    expect(clearsSessionError({ type: "turn/end", data: { reason: { kind: "error" } } })).toBe(false);
    expect(clearsSessionError({ type: "turn/end", data: { reason: { kind: "complete" } } })).toBe(true);
  });
});
