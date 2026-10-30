import { describe, expect, it, vi } from "vitest";
import { confirmSessionStopped } from "./session-stop";

describe("session stop confirmation", () => {
  it("waits through accepted-but-not-yet-settled cancellation", async () => {
    const read = vi.fn()
      .mockResolvedValueOnce([{ sessionId: "A", running: true }])
      .mockResolvedValueOnce([{ sessionId: "A", running: true }])
      .mockResolvedValueOnce([{ sessionId: "A", running: false }]);
    const sleep = vi.fn(async () => undefined);
    await expect(confirmSessionStopped(read, "A", { attempts: 3, delayMs: 100, sleep })).resolves.toBe("stopped");
    expect(read).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("reports a bounded running state instead of polling forever", async () => {
    const read = vi.fn(async () => [{ sessionId: "A", running: true }]);
    const sleep = vi.fn(async () => undefined);
    await expect(confirmSessionStopped(read, "A", { attempts: 2, delayMs: 0, sleep })).resolves.toBe("running");
    expect(read).toHaveBeenCalledTimes(2);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("reports a missing session so the caller can show the unavailable state", async () => {
    const read = vi.fn(async () => [{ sessionId: "B", running: false }]);
    await expect(confirmSessionStopped(read, "A", { attempts: 3, delayMs: 0 })).resolves.toBe("missing");
  });
});