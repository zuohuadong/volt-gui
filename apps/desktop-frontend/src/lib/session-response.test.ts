import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionResponse, type PendingPrompt } from "./session-response.svelte";

function deferred() {
  let resolve!: (running?: boolean) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<boolean>((done, fail) => { resolve = (running = false) => done(running); reject = fail; });
  return { promise, resolve, reject };
}

function response() {
  const onInactive = vi.fn();
  const run = new SessionResponse(onInactive);
  run.select("A", false);
  run.loading = false;
  const prompt: PendingPrompt = { sessionId: "A", pendingId: "p1", text: "task", images: [], files: [] };
  return { run, prompt, onInactive };
}

describe("session response lifecycle", () => {
  afterEach(() => vi.useRealTimers());

  it("blocks submission until history hydration finishes", () => {
    const { run, prompt } = response();
    run.select("A", false);
    expect(run.canSubmit).toBe(false);
    expect(() => run.begin(prompt)).toThrow("not ready");
    run.loading = false;
    run.begin(prompt);
    expect(run.sending).toBe(true);
    expect(run.canSubmit).toBe(false);
  });

  it("does not treat a silent response as finished or retryable", () => {
    vi.useFakeTimers();
    const { run, prompt, onInactive } = response();
    run.begin(prompt);
    run.submitted(prompt);
    run.activity("A", true);
    vi.advanceTimersByTime(179_999);
    expect(onInactive).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onInactive).toHaveBeenCalledExactlyOnceWith("A");
    expect(run.sending).toBe(true);
    expect(run.prompt).toBe(prompt);
    expect(run.failedPrompt).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resets the timeout on activity, not activity from another session", () => {
    vi.useFakeTimers();
    const { run, prompt, onInactive } = response();
    run.begin(prompt);
    run.submitted(prompt);
    run.activity("A", true);
    vi.advanceTimersByTime(170_000);
    run.activity("A", false);
    run.activity("B", true);
    vi.advanceTimersByTime(69_999);
    expect(onInactive).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onInactive).toHaveBeenCalledOnce();
    run.activity("A", false);
    run.finish("A");
    vi.advanceTimersByTime(180_000);
    expect(onInactive).toHaveBeenCalledOnce();
  });

  it("pauses for interaction and never resumes a completed or different turn", () => {
    vi.useFakeTimers();
    const { run, prompt, onInactive } = response();
    run.begin(prompt);
    run.submitted(prompt);
    run.waitForInteraction("A");
    const revision = run.revision;
    expect(run.sending).toBe(false);
    expect(run.canSubmit).toBe(false);
    vi.advanceTimersByTime(180_000);
    expect(onInactive).not.toHaveBeenCalled();
    run.resumeInteraction("A", revision);
    expect(run.sending).toBe(true);
    run.finish("A");
    run.resumeInteraction("A", revision);
    expect(run.sending).toBe(false);
    run.begin({ ...prompt, pendingId: "p2" });
    run.waitForInteraction("A");
    run.resumeInteraction("A", revision);
    expect(run.phase).toBe("waiting");
    run.dispose();
  });

  it("does not let list refresh override an upload or pending interaction", () => {
    const { run, prompt } = response();
    run.begin(prompt);
    run.reconcile(false);
    expect(run.phase).toBe("submitting");
    run.waitForInteraction("A");
    run.reconcile(true);
    expect(run.phase).toBe("waiting");
    run.finish("A");
    run.reconcile(true);
    expect(run.sending).toBe(true);
    run.reconcile(false);
    expect(run.canSubmit).toBe(true);
  });

  it("keeps stopping available when cancellation fails", async () => {
    const { run, prompt } = response();
    run.begin(prompt);
    const cancellation = deferred();
    const stopping = run.stop(() => cancellation.promise);
    expect(run.phase).toBe("stopping");
    expect(run.canSubmit).toBe(false);
    run.reconcile(false);
    expect(run.phase).toBe("stopping");
    cancellation.reject(new Error("offline"));
    await expect(stopping).rejects.toThrow("offline");
    expect(run.sending).toBe(true);
    expect(run.failedPrompt).toBeUndefined();
    run.reconcile(false);
    expect(run.canSubmit).toBe(true);
  });

  it("requires an idle DSH snapshot, not merely an accepted cancellation", async () => {
    const { run, prompt } = response();
    run.begin(prompt);
    await run.stop(async () => true);
    expect(run.sending).toBe(true);
    expect(run.canSubmit).toBe(false);
    await run.stop(async () => false);
    expect(run.canSubmit).toBe(true);
  });

  it.each(["resolve", "reject"] as const)("ignores late stop %s after switching away and back", async (outcome) => {
    const { run, prompt } = response();
    run.begin(prompt);
    const cancellation = deferred();
    const stopping = run.stop(() => cancellation.promise).catch(() => undefined);
    run.select("B", false);
    run.select("A", true);
    run.loading = false;
    if (outcome === "resolve") cancellation.resolve();
    else cancellation.reject(new Error("late"));
    await stopping;
    expect(run.sending).toBe(true);
  });

  it("ignores stop completion after a new prompt begins", async () => {
    const { run, prompt } = response();
    run.begin(prompt);
    const cancellation = deferred();
    const stopping = run.stop(() => cancellation.promise);
    run.finish("A");
    run.begin({ ...prompt, pendingId: "p2" });
    cancellation.resolve();
    await stopping;
    expect(run.phase).toBe("submitting");
    expect(run.prompt?.pendingId).toBe("p2");
  });

  it("invalidates uploads and timers on disconnect without automatic replay", () => {
    vi.useFakeTimers();
    const { run, prompt, onInactive } = response();
    run.begin(prompt);
    run.submitted(prompt);
    run.disconnect();
    run.submitted(prompt);
    run.reconcile(false);
    vi.advanceTimersByTime(180_000);
    expect(run.phase).toBe("disconnected");
    expect(run.canSubmit).toBe(false);
    expect(run.prompt).toBeUndefined();
    expect(run.failedPrompt).toBeUndefined();
    expect(onInactive).not.toHaveBeenCalled();
    run.select("A", true);
    run.loading = false;
    expect(run.sending).toBe(true);
  });
});
