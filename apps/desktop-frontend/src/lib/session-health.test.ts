import { describe, expect, it } from "vitest";
import {
  agentPresetLocked,
  clearsSessionError,
  sessionHealth,
  sessionHealthLabel,
  turnEndError,
  visibleSessions,
} from "./session-health";

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

  it("keeps failure state for error turn endings and extracts turn errors", () => {
    expect(clearsSessionError({ type: "turn/end", data: { reason: { kind: "error" } } })).toBe(false);
    expect(clearsSessionError({ type: "turn/end", data: { reason: { kind: "complete" } } })).toBe(true);

    expect(turnEndError({ type: "turn/end", data: { reason: { kind: "error", error: "Authentication Fails" } } }))
      .toBe("Authentication Fails");
    expect(turnEndError({ type: "turn/end", data: { reason: { kind: "error", error: { message: "llm-pi-ai: no credential", code: "MISSING_CREDENTIAL" } } } }))
      .toBe("llm-pi-ai: no credential");
    expect(turnEndError({ type: "turn/end", data: { reason: { kind: "error", message: "api key invalid" } } }))
      .toBe("api key invalid");
    expect(turnEndError({ type: "turn/end", data: { reason: "error" } }))
      .toBe("error");
    expect(turnEndError({ type: "turn/end", data: { reason: { kind: "complete" } } }))
      .toBeUndefined();
    expect(turnEndError({ type: "user/message", data: {} }))
      .toBeUndefined();
  });

  it("keeps the active blank session visible while hiding stale drafts and archived sessions", () => {
    const sessions = [
      { ...base, sessionId: "active-blank", blank: true },
      { ...base, sessionId: "stale-blank", blank: true },
      { ...base, sessionId: "started" },
      { ...base, sessionId: "archived" },
    ];

    expect(visibleSessions(sessions, ["archived"], "active-blank").map((session) => session.sessionId))
      .toEqual(["active-blank", "started"]);
  });
});
