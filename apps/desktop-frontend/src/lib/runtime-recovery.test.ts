import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { visibleSessions } from "./session-health";
import type { SessionSummary } from "./dsh-client";
import { SessionResponse } from "./session-response.svelte";

const app = readFileSync(new URL("../App.svelte", import.meta.url), "utf8");

describe("runtime recovery wiring", () => {
  it("refreshes sessions after reconnecting without replaying prompts", () => {
    const bootstrap = app.slice(app.indexOf("async function bootstrap()"), app.indexOf("async function withTimeout"));
    expect(bootstrap).toContain("await refresh(true);");
    expect(bootstrap).not.toContain("client.prompt(");
    expect(bootstrap).not.toContain("retryLastPrompt(");
  });

  it("keeps current-session restoration inside the refresh flow", () => {
    const refresh = app.slice(app.indexOf("async function refresh("), app.indexOf("async function refreshManagement"));
    expect(refresh).toContain("restoreActiveSession");
    expect(refresh).toContain("const activeSessionIdAtStart = activeSessionId;");
    expect(refresh).toMatch(/else if \(restoreActiveSession && activeSessionIdAtStart\) \{\s*await selectSession\(activeSessionIdAtStart\)/);
  });

  it("shows the workbench before hydration while protecting user interactions", () => {
    const bootstrap = app.slice(app.indexOf("async function bootstrap()"), app.indexOf("async function retryRuntime"));
    expect(bootstrap).toMatch(/initializingSession = true;\s*loading = false;\s*await refresh\(true\)/);
    expect(bootstrap).toMatch(/finally \{[^}]*initializingSession = false/);
    expect(app).toContain("inert={initializingSession} aria-busy={initializingSession}");
    expect(app).toContain("if (initializingSession) return;");
    expect(app).toContain("if (initializingSession) {");
    expect(app).toContain("refreshQueued = true;");
    expect(app).toContain("if (queuedRefresh && client && !runtimeConnectionError) void refresh();");
  });

  it("reconnects a lost subscription and discards stale refresh results", () => {
    expect(app).toContain("if (client && unsubscribeDshFrames && !runtimeConnectionError)");
    const refresh = app.slice(app.indexOf("async function refresh("), app.indexOf("async function refreshManagement"));
    expect(refresh).toContain("const refreshClient = client;");
    expect(refresh).toContain("const selectionRequest = sessionSelectionRequest;");
    expect(refresh).toContain("const activeSessionIdAtStart = activeSessionId;");
    expect(refresh).toContain("if (client !== refreshClient || selectionRequest !== sessionSelectionRequest || activeSessionId !== activeSessionIdAtStart || runtimeConnectionError) return;");
  });

  it("retains the connection recovery entry when the composer reports a failure", () => {
    expect(app).toContain('if (!runtimeConnectionError) runtimeError = "";');
    expect(app).toContain('{#if runtimeConnectionError || runtimeError === t("errors.runtimeConnection")}');
    expect(app).toContain('t("errors.runtimeCached")');
    expect(app).toContain('runtimeConnectionError ? "?" : runningTools.length');
    expect(app).toContain("if (runtimeConnectionError || client !== managementClient) return;");
  });

  it("keeps a response active until the terminal turn/end event", () => {
    const eventBlock = app.slice(app.indexOf('if (payload.event.type === "turn/end")'), app.indexOf("\n  }\n\n  async function submit", app.indexOf('if (payload.event.type === "turn/end")')));
    expect(eventBlock).toContain('if (payload.event.type === "turn/end")');
    expect(eventBlock).not.toContain('payload.event.type === "assistant/message" ||');
    expect(eventBlock).toContain("finishResponse(payload.sessionId)");
  });

  it("pauses and resumes response timeout around approval and question interactions", () => {
    expect(app).toContain("function pauseResponseForInteraction(sessionId: string): void");
    expect(app).toContain("function resumeResponseAfterInteraction(sessionId: string, revision: number): void");
    expect(app).toContain("pauseResponseForInteraction(payload.sessionId);");
    expect(app).toContain('resolveInteraction("approval", request.sessionId, request.rpcId);');
    expect(app).toContain('resolveInteraction("question", request.sessionId, request.rpcId);');
    expect(app).not.toContain("sending = outcome === \"allowed-once\"");
  });

  it("announces the actual redirected directory only for the selected new session", () => {
    expect(app).toContain("activeSessionId === created.sessionId && created.workspaceRedirected && created.cwd");
    expect(app).toContain('t("errors.workspaceRedirected", { path: created.cwd })');
    expect(app).toMatch(/role="status"[^]*?\{workspaceNotice \|\| historyNotice\}/);
  });

  it("releases session-scoped attachment references after failed sends and archive/unmount", () => {
    expect(app).toContain("const uploadedAttachmentIds: string[] = [];");
    expect(app).toContain("clearAttachmentFiles(sessionId);");
    expect(app).toContain("clearAttachmentFiles();");
    expect(app).toContain("uploadedIds.has(attachmentId)");
  });
});

// 执行组件中的原函数，避免测试复制实现后与生产逻辑脱节。
const script = ts.createSourceFile(
  "App.ts", app.slice(app.indexOf('>') + 1, app.indexOf("</script>")),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
);
const testedFunctions = ["bootstrap", "changeNetworkMode", "refresh", "requestRefresh", "clearRefreshTimer", "handleFrame", "submit", "createSession", "handleGlobalKeydown", "clearAttachmentFiles", "disconnectSession"];
const recoverySource = ts.transpileModule(
  script.statements.filter((statement) =>
    ts.isFunctionDeclaration(statement) && testedFunctions.includes(statement.name?.text ?? ""),
  ).map((statement) => statement.getText(script)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

function session(sessionId: string): SessionSummary {
  return { sessionId, cwd: `/${sessionId}`, updatedAt: 1, running: false, blank: false };
}

function recoveryHarness(activeSessionId = "A", connected = true) {
  const sessionResponse = new SessionResponse(() => {});
  sessionResponse.select(activeSessionId, false);
  sessionResponse.loading = false;
  const listing = deferred<{ items: SessionSummary[] }>();
  const listeners = new Set<(frame: unknown) => void>();
  let runtimeErrorListener: (message: string) => void = () => undefined;
  const shell = {
    setNetworkMode: vi.fn(async (networkMode: string) => ({ networkMode, dshReady: true, startupError: "" })),
    bootstrap: vi.fn(async () => ({ productName: "Test", version: "1", workspace: "/A", dshReady: true, networkMode: "intranet" })),
    onRuntimeError: vi.fn((listener: (message: string) => void) => {
      runtimeErrorListener = listener;
      return vi.fn();
    }),
  };
  const transport = {
    listWorkspaces: vi.fn(async () => ({ items: [], archivedSessionIds: [] })),
    listSessions: vi.fn(() => listing.promise),
    history: vi.fn(async (_id: string) => ({ events: [] })),
    prompt: vi.fn(),
    createSession: vi.fn(),
    subscribe: vi.fn((listener: (frame: unknown) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    }),
  };
  const state = {
    client: connected ? transport as typeof transport : undefined,
    networkMode: "intranet",
    networkModeBusy: false, runtimeRetrying: false, managementError: "", managementNotice: "", sessionLoadError: "",
    unsubscribeDshFrames: undefined as (() => void) | undefined,
    unsubscribeRuntimeError: undefined as (() => void) | undefined,
    runtimeConnectionError: "", runtimeError: "", loading: true, sessionResponse,
    get sending() { return sessionResponse.sending; },
    initializingSession: false, refreshQueued: false, refreshTimer: undefined as ReturnType<typeof setTimeout> | undefined,
    eventRefreshFlight: undefined, refreshDisposed: false, bootstrapInFlight: false, bootstrapQueued: false,
    setTimeout, clearTimeout,
    customProductName: "", appVersion: "", workspacePath: "/A", workspaceWarning: "",
    memoryStatus: "disabled",
    bootstrapWorkspace: "/A", defaultChatDirectory: "/A", readDefaultChatDirectory: () => "",
    activeSessionId, sessionSelectionRequest: 0, sessionEventRevision: 0,
    historyLoad: undefined, get activePrompt() { return sessionResponse.prompt; }, sessions: [session("A"), session("B")],
    workspaces: [], archivedSessionIds: [], allSessions: [session("A"), session("B")],
    pendingInteractionsBySession: {}, busyInteractions: {},
    sessionDrafts: {}, draftFilesBySession: {}, input: "unsent draft",
    attachmentFilesBySession: {} as Record<string, Record<string, File>>,
    window: { voltDesktop: shell, confirm: () => true },
    DshClient: class { constructor() { return transport; } },
    checkForUpdate: vi.fn(async () => undefined),
    clearStartupTimers: vi.fn(), armStartupTimers: vi.fn(), t: (key: string) => key,
    userFacingError: (error: unknown) => error instanceof Error ? error.message : String(error),
    withTimeout: <T>(promise: Promise<T>) => promise,
    startupState: () => "ready", visibleSessions, handleFrame: vi.fn(),
    selectSession: vi.fn(async (id: string) => {
      state.activeSessionId = id;
      state.sessionSelectionRequest += 1;
      if (id) await transport.history(id);
    }),
  };
  const functions = runInNewContext(`${recoverySource}\n({ ${testedFunctions.join(",")} })`, state) as {
    bootstrap(): Promise<void>;
    changeNetworkMode(mode: string): Promise<void>;
    refresh(restore?: boolean): Promise<void>;
    submit(text: string): Promise<void>;
    createSession(): Promise<void>;
    handleGlobalKeydown(event: KeyboardEvent): void;
    handleFrame(frame: unknown): void;
    clearAttachmentFiles(sessionId?: string): void;
    requestRefresh(): void;
    clearRefreshTimer(): void;
  };
  state.handleFrame = vi.fn(functions.handleFrame);
  return { state, functions, transport, shell, listing, listeners,
    disconnect: (message = "offline") => runtimeErrorListener(message) };
}

describe("runtime recovery behavior", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("ignores planned restart events and reconnects without replaying the draft", async () => {
    const h = recoveryHarness();
    h.listing.resolve({ items: [session("A")] });
    await h.functions.bootstrap();
    h.shell.bootstrap.mockResolvedValue({ productName: "Test", version: "1", workspace: "/A", dshReady: true, networkMode: "external" });
    h.shell.setNetworkMode.mockImplementation(async (networkMode) => {
      h.disconnect("old runtime exited");
      await h.functions.bootstrap();
      expect(h.state.client).toBeUndefined();
      return { networkMode, dshReady: true, startupError: "" };
    });
    await h.functions.changeNetworkMode("external");
    expect(h.state.runtimeConnectionError).toBe("");
    expect(h.state.networkModeBusy).toBe(false);
    expect(h.state.client).toBe(h.transport);
    expect(h.state.input).toBe("unsent draft");
    expect(h.transport.prompt).not.toHaveBeenCalled();
    expect(h.listeners.size).toBe(1);
  });

  it("keeps real restart failures recoverable", async () => {
    const h = recoveryHarness();
    h.shell.setNetworkMode.mockResolvedValue({ networkMode: "external", dshReady: false, startupError: "restart failed" });
    await h.functions.changeNetworkMode("external");
    expect(h.state.runtimeConnectionError).toContain("restart failed");
    expect(h.state.loading).toBe(false);
    expect(h.state.networkModeBusy).toBe(false);
    expect(h.transport.prompt).not.toHaveBeenCalled();
  });

  it("does not start a second transition during bootstrap", async () => {
    const h = recoveryHarness();
    const booting = h.functions.bootstrap();
    await h.functions.changeNetworkMode("external");
    expect(h.shell.setNetworkMode).not.toHaveBeenCalled();
    h.listing.resolve({ items: [session("A")] });
    await booting;
  });

  it("never selects the newest child as an ordinary conversation", async () => {
    const h = recoveryHarness("");
    h.listing.resolve({ items: [{ ...session("child"), origin: "subagent" }, session("parent")] });
    await h.functions.refresh();
    expect(h.state.selectSession).toHaveBeenCalledExactlyOnceWith("parent");
  });

  it("coalesces a burst of projection events into one list refresh", async () => {
    vi.useFakeTimers();
    const h = recoveryHarness();
    h.listing.resolve({ items: [session("A")] });
    for (let index = 0; index < 20; index++) h.functions.requestRefresh();
    await vi.advanceTimersByTimeAsync(99);
    expect(h.transport.listSessions).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(h.transport.listSessions).toHaveBeenCalledTimes(1);
    expect(h.transport.listWorkspaces).toHaveBeenCalledTimes(1);
    expect(h.state.selectSession).not.toHaveBeenCalled();
  });

  it("runs one trailing refresh after events arrive during a pending request", async () => {
    vi.useFakeTimers();
    const h = recoveryHarness();
    h.functions.requestRefresh();
    await vi.advanceTimersByTimeAsync(100);
    for (let index = 0; index < 20; index++) h.functions.requestRefresh();
    await vi.advanceTimersByTimeAsync(500);
    expect(h.transport.listSessions).toHaveBeenCalledTimes(1);
    h.listing.resolve({ items: [session("A")] });
    await vi.advanceTimersByTimeAsync(100);
    expect(h.transport.listSessions).toHaveBeenCalledTimes(2);
    expect(h.transport.listWorkspaces).toHaveBeenCalledTimes(2);
  });

  it.each(["disconnect", "client", "unmount", "initializing"])("does not run a scheduled event after %s", async (reason) => {
    vi.useFakeTimers();
    const h = recoveryHarness();
    h.functions.requestRefresh();
    if (reason === "disconnect") h.state.runtimeConnectionError = "offline";
    if (reason === "client") h.state.client = { ...h.transport };
    if (reason === "unmount") {
      h.state.refreshDisposed = true;
      h.functions.clearRefreshTimer();
    }
    if (reason === "initializing") h.state.initializingSession = true;
    await vi.advanceTimersByTimeAsync(100);
    expect(h.transport.listSessions).not.toHaveBeenCalled();
    expect(h.state.refreshQueued).toBe(reason === "initializing");
  });

  it("does not drop an awaited restoration while an old client's event refresh is pending", async () => {
    vi.useFakeTimers();
    const h = recoveryHarness();
    h.functions.requestRefresh();
    await vi.advanceTimersByTimeAsync(100);
    const replacement = { ...h.transport, listSessions: vi.fn(async () => ({ items: [session("A")] })) };
    h.state.client = replacement;
    await h.functions.refresh(true);
    expect(h.state.selectSession).toHaveBeenCalledExactlyOnceWith("A");
    h.listing.resolve({ items: [session("obsolete")] });
    await vi.advanceTimersByTimeAsync(100);
    expect(h.state.sessions.map((item) => item.sessionId)).toEqual(["A"]);
    expect(replacement.listSessions).toHaveBeenCalledTimes(1);
  });
  it("drops archived and removed attachment caches while retaining live sessions", async () => {
    const h = recoveryHarness();
    const file = new File(["text"], "report.txt");
    h.state.attachmentFilesBySession = { A: { a: file }, B: { b: file }, removed: { c: file } };
    h.transport.listWorkspaces.mockResolvedValue({ items: [], archivedSessionIds: ["B"] } as never);
    h.listing.resolve({ items: [session("A"), session("B")] });
    await h.functions.refresh();
    expect(Object.keys(h.state.attachmentFilesBySession)).toEqual(["A"]);
    h.functions.clearAttachmentFiles("A");
    expect(h.state.attachmentFilesBySession).toEqual({});
    h.state.attachmentFilesBySession = { A: { a: file } };
    h.functions.clearAttachmentFiles();
    expect(h.state.attachmentFilesBySession).toEqual({});
  });

  it.each([
    ["existing", "A", ["A", "B"], "A"],
    ["first", "", ["A"], "A"],
    ["invalid", "missing", ["A"], "A"],
    ["removed last", "A", [], ""],
  ])("selects exactly once for %s selection", async (_name, active, ids, expected) => {
    const h = recoveryHarness(active as string);
    h.listing.resolve({ items: (ids as string[]).map(session) });
    await h.functions.refresh(true);
    expect(h.state.selectSession).toHaveBeenCalledExactlyOnceWith(expected);
    expect(h.transport.history).toHaveBeenCalledTimes(expected ? 1 : 0);
    expect(h.transport.prompt).not.toHaveBeenCalled();
  });

  it("does not reload an existing selection for an ordinary refresh", async () => {
    const h = recoveryHarness();
    h.listing.resolve({ items: [session("A")] });
    await h.functions.refresh();
    expect(h.state.selectSession).not.toHaveBeenCalled();
  });

  it("reconciles a resumed running state with an authoritative idle snapshot", async () => {
    const h = recoveryHarness();
    h.state.sessionResponse.reconcile(true);
    h.listing.resolve({ items: [session("A")] });
    await h.functions.refresh();
    expect(h.state.sending).toBe(false);
  });

  it("does not overwrite a new event with an older running snapshot", async () => {
    const h = recoveryHarness();
    const pending = h.functions.refresh();
    h.state.sessionEventRevision += 1;
    h.state.sessionResponse.finish("A");
    h.listing.resolve({ items: [{ ...session("A"), running: true }] });
    await pending;
    expect(h.state.sending).toBe(false);
  });

  it("discards an older idle snapshot after a local submit and failed stop without new frames", async () => {
    const h = recoveryHarness();
    const previous = h.state.sessions;
    const refreshing = h.functions.refresh();
    h.state.sessionResponse.begin({ sessionId: "A", pendingId: "p1", text: "task", images: [], files: [] });
    await expect(h.state.sessionResponse.stop(async () => { throw new Error("stop failed"); })).rejects.toThrow("stop failed");
    h.listing.resolve({ items: [session("A")] });
    await refreshing;
    expect(h.state.sending).toBe(true);
    expect(h.state.sessionResponse.canSubmit).toBe(false);
    expect(h.state.sessions).toBe(previous);
  });

  it("does not select anything for an empty initial list", async () => {
    const h = recoveryHarness("");
    h.listing.resolve({ items: [] });
    await h.functions.refresh(true);
    expect(h.state.selectSession).not.toHaveBeenCalled();
  });

  it("reuses an existing blank session before creating another one", async () => {
    const h = recoveryHarness("");
    h.listing.resolve({ items: [{ ...session("blank"), blank: true }] });
    await h.functions.refresh(true);
    expect(h.state.selectSession).toHaveBeenCalledExactlyOnceWith("blank");
    expect(h.transport.createSession).not.toHaveBeenCalled();
  });

  it.each(["selection", "active id", "client", "disconnect"])("discards results after %s changes", async (change) => {
    const h = recoveryHarness();
    const previous = h.state.sessions;
    const pending = h.functions.refresh(true);
    if (change === "selection") h.state.sessionSelectionRequest += 1;
    if (change === "active id") h.state.activeSessionId = "B";
    if (change === "client") h.state.client = { ...h.transport };
    if (change === "disconnect") h.state.runtimeConnectionError = "offline";
    h.listing.resolve({ items: [session("obsolete")] });
    await pending;
    expect(h.state.selectSession).not.toHaveBeenCalled();
    expect(h.state.sessions).toBe(previous);
    expect(h.state.workspacePath).toBe("/A");
  });

  it("ignores a failed request from the previous client", async () => {
    const h = recoveryHarness();
    const pending = h.functions.refresh(true);
    h.state.client = { ...h.transport };
    h.listing.reject(new Error("obsolete failure"));
    await pending;
    expect(h.state.runtimeConnectionError).toBe("");
  });

  it("shows the shell but blocks submit, new session and keyboard actions during restoration", async () => {
    const h = recoveryHarness("A", false);
    const pending = h.functions.bootstrap();
    await vi.waitFor(() => expect(h.transport.listSessions).toHaveBeenCalled());
    expect(h.state.loading).toBe(false);
    expect(h.state.initializingSession).toBe(true);
    await expect(h.functions.submit("new prompt")).rejects.toThrow("app.connecting");
    await h.functions.createSession();
    const event = { key: "n", ctrlKey: true, preventDefault: vi.fn() } as unknown as KeyboardEvent;
    h.functions.handleGlobalKeydown(event);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(h.transport.createSession).not.toHaveBeenCalled();
    expect(h.transport.prompt).not.toHaveBeenCalled();
    expect(h.state.input).toBe("unsent draft");
    h.listing.resolve({ items: [session("A")] });
    await pending;
    expect(h.state.initializingSession).toBe(false);
  });

  it("releases the interaction lock when restoration fails", async () => {
    const h = recoveryHarness("A", false);
    const pending = h.functions.bootstrap();
    await vi.waitFor(() => expect(h.transport.listSessions).toHaveBeenCalled());
    h.listing.reject(new Error("history service unavailable"));
    await pending;
    expect(h.state.initializingSession).toBe(false);
    expect(h.state.bootstrapInFlight).toBe(false);
    expect(h.state.runtimeConnectionError).toBe("history service unavailable");
  });

  it.each(["", "missing"])("coalesces event refreshes until history is ready for selection %s", async (active) => {
    const h = recoveryHarness(active, false);
    const history = deferred<{ events: never[] }>();
    h.transport.history.mockReturnValue(history.promise);
    const pending = h.functions.bootstrap();
    await vi.waitFor(() => expect(h.transport.listSessions).toHaveBeenCalledTimes(1));
    for (const type of ["host/session-added", "session/projection", "host/session-status"]) {
      for (const listener of h.listeners) listener({ payload: { type } });
    }
    expect(h.state.refreshQueued).toBe(true);
    expect(h.transport.listSessions).toHaveBeenCalledTimes(1);
    h.listing.resolve({ items: [session("A")] });
    await vi.waitFor(() => expect(h.transport.history).toHaveBeenCalledTimes(1));
    expect(h.state.initializingSession).toBe(true);
    await expect(h.functions.submit("too early")).rejects.toThrow("app.connecting");
    history.resolve({ events: [] });
    await pending;
    await vi.waitFor(() => expect(h.transport.listSessions).toHaveBeenCalledTimes(2));
    expect(h.state.selectSession).toHaveBeenCalledExactlyOnceWith("A");
    expect(h.transport.history).toHaveBeenCalledTimes(1);
    expect(h.state.initializingSession).toBe(false);
    expect(h.state.refreshQueued).toBe(false);
  });

  it("rebinds frames and restores history once after a disconnect without replaying prompts", async () => {
    const h = recoveryHarness("A", false);
    h.listing.resolve({ items: [session("A")] });
    await h.functions.bootstrap();
    expect(h.listeners.size).toBe(1);
    h.disconnect();
    expect(h.listeners.size).toBe(0);
    expect(h.state.client).toBeDefined();
    await h.functions.bootstrap();
    expect(h.listeners.size).toBe(1);
    expect(h.transport.subscribe).toHaveBeenCalledTimes(2);
    expect(h.transport.history).toHaveBeenCalledTimes(2);
    expect(h.state.runtimeConnectionError).toBe("");
    const frame = { payload: { type: "session/event", sessionId: "A" } };
    for (const listener of h.listeners) listener(frame);
    expect(h.state.handleFrame).toHaveBeenCalledExactlyOnceWith(frame);
    await h.functions.bootstrap();
    expect(h.transport.subscribe).toHaveBeenCalledTimes(2);
    expect(h.transport.history).toHaveBeenCalledTimes(2);
    expect(h.transport.prompt).not.toHaveBeenCalled();
  });
});
