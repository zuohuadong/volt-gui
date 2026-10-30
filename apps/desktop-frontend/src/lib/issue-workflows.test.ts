import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildQuestionAnswers, questionsAnswered, toolDisplay } from "./ai-elements-adapter";
import { clearPendingApproval, clearPendingQuestion, clearPendingSession, setQuestionAnswer, type PendingInteractionsBySession } from "./pending-interactions";
import { SessionResponse, type PendingPrompt } from "./session-response.svelte";
import { foldHistory, hasMessageContent, interruptRunningTools, mergeHistoryEntries, type TranscriptMessage } from "./transcript";
import type { SessionHistory } from "./dsh-client";
import type { SessionOperation } from "./session-activity";
import { historyJumpShortcut, isEditableShortcutTarget, sessionNavigationShortcut, sessionNavigationTarget } from "./session-navigation";
import { confirmSessionStopped } from "./session-stop";

const responses: SessionResponse[] = [];
afterEach(() => {
  for (const response of responses.splice(0)) response.dispose();
  vi.useRealTimers();
});

function sessionResponse(onInactive = (_sessionId: string) => {}): SessionResponse {
  const response = new SessionResponse(onInactive);
  response.select("A", false);
  response.loading = false;
  responses.push(response);
  return response;
}

const component = (name: string) => readFileSync(new URL(`../components/${name}.svelte`, import.meta.url), "utf8");
const app = readFileSync(new URL("../App.svelte", import.meta.url), "utf8");
const script = ts.createSourceFile("App.ts", app.slice(app.indexOf(">") + 1, app.indexOf("</script>")), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const submissionSource = ts.transpileModule(
  script.statements.filter((statement) => ts.isFunctionDeclaration(statement)
    && ["submit", "clearAttachmentFiles"].includes(statement.name?.text ?? ""))
    .map((statement) => statement.getText(script)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function submissionHarness() {
  const response = sessionResponse();
  const client = {
    listSessions: vi.fn(async () => ({ items: [{ sessionId: "A", running: false }] })),
    uploadFile: vi.fn(async () => ({ receiptId: "receipt", file: { attachmentId: "new", name: "report.txt", bytes: 1 } })),
    prompt: vi.fn(async () => undefined),
  };
  const state = {
    client, initializingSession: false, activeSessionId: "A", sessionResponse: response,
    get sending() { return response.sending; },
    workspaceWarning: "", selectedModel: "provider/model", input: "draft", sessionLoadError: "",
    sessionDrafts: {} as Record<string, string>, draftFilesBySession: {} as Record<string, File[]>,
    get activePrompt() { return response.prompt; }, messages: [] as TranscriptMessage[], view: "conversation",
    cancelledPromptIds: new Set<string>(),
    get lastFailedPrompt() { return response.failedPrompt; }, runtimeConnectionError: "", runtimeError: "",
    attachmentFilesBySession: {} as Record<string, Record<string, File>>,
    selectedProviderCredentialRef: () => "",
    parseModelSelectionKey: () => ({ provider: "provider" }),
    isSurfaceGenerationIntent: () => false, isUiCustomizationIntent: () => false,
    setSessionRuntimeError: vi.fn((_sessionId: string, error: unknown) => String(error)),
    withTimeout: (promise: Promise<unknown>) => promise,
    confirmSessionStopped,
    pendingInteractionsBySession: {} as Record<string, unknown>,
    busyInteractions: {} as Record<string, boolean>,
    autoContinueAttempts: {} as Record<string, number>,
    t: (key: string) => key,
  };
  const submit = runInNewContext(`${submissionSource}\nsubmit`, state) as
    (text: string, images: never[], files: File[]) => Promise<void>;
  return { state, client, submit };
}

function componentFunctions(source: string, names: string[]): string {
  const sourceFile = ts.createSourceFile("Component.ts", source.slice(source.indexOf(">") + 1, source.indexOf("</script>")), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  return ts.transpileModule(
    sourceFile.statements.filter((statement) => ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text ?? ""))
      .map((statement) => statement.getText(sourceFile)).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;
}

describe("delete confirmation", () => {
  it("ignores late close events from an unmounted confirmation", () => {
    const dialog = component("DeleteSessionDialog");
    const state = { mounted: true, onCancel: vi.fn() };
    const close = runInNewContext(`${componentFunctions(dialog, ["cancelMountedDialog"])}\ncancelMountedDialog`, state);
    close();
    expect(state.onCancel).toHaveBeenCalledTimes(1);
    state.mounted = false;
    close();
    expect(state.onCancel).toHaveBeenCalledTimes(1);
    expect(dialog).toMatch(/mounted = false;\s*dialog.close\(\)/);
  });
  function deleteHarness() {
    const state = {
      client: { archiveSession: vi.fn(async (): Promise<void> => undefined) },
      sessions: [{ sessionId: "A", running: false }],
      confirmingSessionId: "", managementBusy: "", activeSessionId: "B",
      pendingInteractionsBySession: {}, sessionDrafts: { A: "draft" },
      draftFilesBySession: { A: [] }, managementNotice: "",
      sessionOperations: [] as SessionOperation[], archivedSessionIds: [] as string[], allSessions: [], crypto,
      sessionTitle: () => "Delete target",
      managementError: "", managementTab: "sessions", view: "conversation", runtimeError: "",
      clearPendingSession: vi.fn(() => ({})), clearAttachmentFiles: vi.fn(),
      refresh: vi.fn(async () => undefined), t: (key: string) => key,
      userFacingError: String,
    };
    const remove = runInNewContext(`${componentFunctions(app, ["deleteManagedSession", "recordSessionOperation", "performManagementAction"])}\ndeleteManagedSession`, state);
    return { state, remove };
  }

  it("does not delete or discard drafts until the matching session is confirmed", async () => {
    const { state, remove } = deleteHarness();
    await remove("A");
    expect(state.client.archiveSession).not.toHaveBeenCalled();
    expect(state.sessionDrafts.A).toBe("draft");
    expect(state.sessionOperations).toEqual([]);
    state.confirmingSessionId = "other";
    await remove("A");
    expect(state.client.archiveSession).not.toHaveBeenCalled();
    state.confirmingSessionId = "A";
    await remove("A");
    expect(state.client.archiveSession).toHaveBeenCalledExactlyOnceWith("A");
    expect(state.confirmingSessionId).toBe("");
    expect(state.sessionDrafts.A).toBeUndefined();
    expect(state.sessionOperations).toEqual([expect.objectContaining({ kind: "deleted", sessionId: "A", title: "Delete target" })]);
    expect(state.sessions).toEqual([]);
    expect(state.archivedSessionIds).toEqual(["A"]);
  });

  it("rejects a confirmed session that started running or disappeared", async () => {
    const { state, remove } = deleteHarness();
    state.confirmingSessionId = "A";
    state.sessions[0].running = true;
    await remove("A");
    state.sessions = [];
    await remove("A");
    expect(state.client.archiveSession).not.toHaveBeenCalled();
    expect(state.sessionDrafts.A).toBe("draft");
    expect(state.sessionOperations).toEqual([]);
  });

  it("does not record a delete failure or discard its draft", async () => {
    const { state, remove } = deleteHarness();
    state.confirmingSessionId = "A";
    state.client.archiveSession.mockRejectedValueOnce(new Error("archive rejected"));
    await remove("A");
    expect(state.sessionOperations).toEqual([]);
    expect(state.managementNotice).toBe("");
    expect(state.runtimeError).toContain("archive rejected");
    expect(state.sessionDrafts.A).toBe("draft");
    expect(state.sessions).toHaveLength(1);
  });

  it("records acknowledged archive before refresh and retains it when refresh fails", async () => {
    const { state, remove } = deleteHarness();
    state.confirmingSessionId = "A";
    state.refresh.mockImplementationOnce(async () => {
      expect(state.sessionOperations).toHaveLength(1);
      expect(state.managementNotice).not.toBe("");
      throw new Error("refresh failed");
    });
    await remove("A");
    expect(state.sessionOperations).toHaveLength(1);
    expect(state.sessions).toEqual([]);
    expect(state.runtimeError).toContain("refresh failed");
  });

  it("waits for acknowledgement and rejects repeat confirmation while busy", async () => {
    const { state, remove } = deleteHarness();
    let finishArchive!: () => void;
    state.client.archiveSession.mockImplementationOnce(() => new Promise<void>((resolve) => { finishArchive = resolve; }));
    state.confirmingSessionId = "A";
    const deleting = remove("A");
    expect(state.sessionOperations).toEqual([]);
    expect(state.sessionDrafts.A).toBe("draft");
    state.confirmingSessionId = "A";
    await remove("A");
    expect(state.client.archiveSession).toHaveBeenCalledTimes(1);
    state.activeSessionId = "C";
    finishArchive();
    await deleting;
    expect(state.sessionOperations).toEqual([expect.objectContaining({ sessionId: "A", kind: "deleted" })]);
    expect(state.activeSessionId).toBe("C");
  });

  it("keeps both delete entry points behind the accessible modal", () => {
    expect(app).toContain("onclick={() => confirmingSessionId = session.sessionId}");
    expect(app).toContain("onclick={() => confirmingSessionId = item.sessionId}");
    expect(component("DeleteSessionDialog")).toContain("dialog.showModal()");
    expect(component("DeleteSessionDialog")).toContain("onclose={cancelMountedDialog}");
    expect(component("DeleteSessionDialog")).toMatch(/return \(\) => \{\s*mounted = false;\s*dialog.close\(\)/);
  });

  it.each(["Escape", "n", "b"])("does not run background shortcuts while confirming: %s", (key) => {
    const state = { initializingSession: false, confirmingSessionId: "A" };
    const keydown = runInNewContext(`${componentFunctions(app, ["handleGlobalKeydown"])}\nhandleGlobalKeydown`, state);
    const event = { key, ctrlKey: true, preventDefault: vi.fn() };
    expect(() => keydown(event)).not.toThrow();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it("navigates session history and opens the quick picker with desktop shortcuts", () => {
    const openQuickPicker = vi.fn();
    const selectSession = vi.fn(async () => undefined);
    const state = {
      initializingSession: false, confirmingSessionId: "", taskActive: false,
      activeSessionId: "middle", filteredSessions: [{ sessionId: "newest" }, { sessionId: "middle" }, { sessionId: "oldest" }],
      selectSession, sessionNavigationShortcut, sessionNavigationTarget, isEditableShortcutTarget, historyJumpShortcut,
      viewportWidth: 1200, sidebarCollapsed: false, mobileSidebarOpen: false, view: "conversation",
      sessionSearchInput: { focus: vi.fn() }, tick: () => Promise.resolve(), createSession: vi.fn(), toggleSidebar: vi.fn(),
      activityOpen: false, closeMobileSidebar: vi.fn(), setActivityOpen: vi.fn(), cancel: vi.fn(),
      quickPickerOpen: false, openQuickPicker, quickPickerEntries: [], quickPickerIndex: 0,
      runQuickPickerItem: vi.fn(), closeQuickPicker: vi.fn(), quickPickerSelected: undefined,
    };
    const keydown = runInNewContext(`${componentFunctions(app, ["handleGlobalKeydown"])}\nhandleGlobalKeydown`, state);
    const previous = { key: "[", ctrlKey: true, metaKey: false, shiftKey: true, altKey: false, target: null, preventDefault: vi.fn(), defaultPrevented: false, isComposing: false };
    keydown(previous);
    expect(previous.preventDefault).toHaveBeenCalled();
    expect(selectSession).toHaveBeenCalledWith("newest");

    for (const key of ["k", "p"]) {
      const shortcut = { key, ctrlKey: true, metaKey: false, shiftKey: key === "p", altKey: false, target: null, preventDefault: vi.fn(), defaultPrevented: false, isComposing: false };
      keydown(shortcut);
      expect(shortcut.preventDefault).toHaveBeenCalled();
    }
    expect(openQuickPicker).toHaveBeenCalledTimes(2);
  });

  it("moves through quick-picker entries and opens the selected item with the keyboard", () => {
    const runQuickPickerItem = vi.fn();
    const closeQuickPicker = vi.fn();
    const state = {
      initializingSession: false, confirmingSessionId: "", quickPickerOpen: true,
      quickPickerEntries: [{ id: "a" }, { id: "b" }, { id: "c" }], quickPickerIndex: 0,
      runQuickPickerItem, closeQuickPicker, quickPickerSelected: { id: "a" },
    };
    const keydown = runInNewContext(`${componentFunctions(app, ["handleGlobalKeydown"])}\nhandleGlobalKeydown`, state);
    const down = { key: "ArrowDown", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: null, preventDefault: vi.fn(), defaultPrevented: false, isComposing: false };
    keydown(down);
    expect(down.preventDefault).toHaveBeenCalled();
    expect(state.quickPickerIndex).toBe(1);
    keydown({ ...down, key: "ArrowUp", preventDefault: vi.fn() });
    expect(state.quickPickerIndex).toBe(0);
    const enter = { ...down, key: "Enter", preventDefault: vi.fn() };
    keydown(enter);
    expect(runQuickPickerItem).toHaveBeenCalled();
    const escape = { ...down, key: "Escape", preventDefault: vi.fn() };
    keydown(escape);
    expect(closeQuickPicker).toHaveBeenCalled();
  });

  it("jumps to the top or latest point of the loaded conversation", () => {
    const scrollTo = vi.fn();
    const jumpToHistoryTop = vi.fn();
    const state = {
      initializingSession: false, confirmingSessionId: "", taskActive: false,
      sessionNavigationShortcut, sessionNavigationTarget, isEditableShortcutTarget, historyJumpShortcut,
      selectSession: vi.fn(), filteredSessions: [], activeSessionId: "A", jumpToHistoryTop, quickPickerOpen: false,
      quickPickerEntries: [], quickPickerIndex: 0, runQuickPickerItem: vi.fn(), closeQuickPicker: vi.fn(), quickPickerSelected: undefined,
      document: { querySelector: () => ({ scrollTo, scrollHeight: 900, isConnected: true }) },
    };
    const keydown = runInNewContext(`${componentFunctions(app, ["handleGlobalKeydown"])}\nhandleGlobalKeydown`, state);
    const end = { key: "End", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: null, preventDefault: vi.fn(), defaultPrevented: false, isComposing: false };
    keydown(end);
    expect(end.preventDefault).toHaveBeenCalled();
    expect(scrollTo).toHaveBeenCalledWith({ top: 900, behavior: "smooth" });

    const home = { key: "Home", ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, target: null, preventDefault: vi.fn(), defaultPrevented: false, isComposing: false };
    keydown(home);
    expect(home.preventDefault).toHaveBeenCalled();
    expect(jumpToHistoryTop).toHaveBeenCalledOnce();
  });

  it("keeps the workbench shell recoverable when a child component fails to render", () => {
    expect(app).toContain("<svelte:boundary onerror={(error) => console.error(\"[VoltUI] Workbench render failed\", error)}>");
    expect(app).toContain("工作台渲染失败");
    expect(app).toContain("onclick={reset}");
  });

  it("keeps the stop control enabled while waiting for approval or a question", () => {
    expect(app).toContain("const taskActive = $derived(sending || !!pendingApproval || !!pendingQuestion || continuingTask);");
    expect(app).toContain("loading={taskActive}");
    expect(component("DshPromptComposer")).toContain('disabled={!sessionId || (!loading && (disabled || unsupportedImages || modelBusy))}');
    expect(component("ActivityPanel")).toContain("onStop");
    expect(app).toContain("onStop={() => void cancel()}");
  });

  it("stops the active task with Escape even while the activity panel is open", () => {
    const cancel = vi.fn();
    const state = {
      initializingSession: false, confirmingSessionId: "", taskActive: true,
      activityOpen: true, mobileSidebarOpen: false, closeMobileSidebar: vi.fn(), setActivityOpen: vi.fn(), cancel, quickPickerOpen: false,
      quickPickerEntries: [], quickPickerIndex: 0, runQuickPickerItem: vi.fn(), closeQuickPicker: vi.fn(), quickPickerSelected: undefined,
      document: { getElementById: () => null }, sessionNavigationShortcut, sessionNavigationTarget, isEditableShortcutTarget, historyJumpShortcut,
    };
    const keydown = runInNewContext(`${componentFunctions(app, ["handleGlobalKeydown"])}\nhandleGlobalKeydown`, state);
    const event = { key: "Escape", ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, target: null, preventDefault: vi.fn(), defaultPrevented: false, isComposing: false };
    keydown(event);
    expect(event.preventDefault).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalledOnce();
  });
});

describe("confirmed session activity", () => {
  function activityHarness() {
    const state = {
      crypto, sessionOperations: [] as SessionOperation[], managementNotice: "", managementBusy: "",
      managementError: "", managementTab: "sessions", view: "conversation", activeSessionId: "A",
      client: {
        createSession: vi.fn(async () => ({ sessionId: "created", cwd: "/workspace/project" })),
        listSessions: vi.fn(async () => ({ items: [{ sessionId: "fork" }] })),
        rename: vi.fn(async (_sessionId: string, title: string) => ({ title })),
        fork: vi.fn(async () => ({ sessionId: "fork" })),
      },
      initializingSession: false, sessionSelectionRequest: 0, workspaceSelectionRequest: 0,
      workspacePath: "/workspace/project", sessionTitleDraft: "New title", editingSessionId: "A",
      sessions: [{ sessionId: "A" }], archivedSessionIds: [], allSessions: [], sessionDrafts: {},
      closeMobileSidebar: vi.fn(), selectSession: vi.fn(), refresh: vi.fn(), focusComposer: vi.fn(),
      visibleSessions: () => [], sessionTitle: () => "Original", userFacingError: String,
      t: (key: string, params?: Record<string, string>) => params ? `${key}:${params.title}` : key,
      runtimeError: "",
    };
    const names = ["recordSessionOperation", "updateSessionOperationTitle", "performManagementAction", "createSession", "saveSessionRename", "duplicateSession", "forkSessionAtSeq"];
    const actions = runInNewContext(`${componentFunctions(app, names)}\n({${names.join(",")}})`, state);
    return { state, actions };
  }

  it("keeps the latest 50 confirmations in reverse order with unique identities", () => {
    const { state, actions } = activityHarness();
    expect(state.sessionOperations).toEqual([]);
    for (let index = 0; index < 51; index++) actions.recordSessionOperation("renamed", "A", `Title ${index}`);
    expect(state.sessionOperations).toHaveLength(50);
    expect(state.sessionOperations[0].title).toBe("Title 50");
    expect(state.sessionOperations.at(-1)?.title).toBe("Title 1");
    expect(new Set(state.sessionOperations.map((entry) => entry.id)).size).toBe(50);
    expect(state.sessionOperations.every((entry) => Number.isFinite(entry.time))).toBe(true);
  });

  it("records actual create, rename and both fork actions, but not initial bootstrap", async () => {
    const { state, actions } = activityHarness();
    await actions.createSession("/workspace/project", true);
    expect(state.sessionOperations).toEqual([]);
    await actions.createSession();
    state.sessions = [{ sessionId: "A" }];
    await actions.saveSessionRename("A");
    await actions.duplicateSession("A");
    await actions.forkSessionAtSeq(3);
    expect(state.sessionOperations.map((entry) => entry.kind)).toEqual(["forked", "forked", "renamed", "created"]);
    expect(state.sessionOperations.at(-1)?.title).toBe("project");
    expect(state.sessionOperations[2].title).toBe("New title");
    expect(state.sessionOperations[1].title).toBe("Originalsession.copySuffix");
    expect(state.sessionOperations[0].title).toBe("Original");
  });

  it("never records rejected create, rename or fork requests", async () => {
    const { state, actions } = activityHarness();
    state.client.createSession.mockRejectedValue(new Error("create rejected"));
    state.client.rename.mockRejectedValue(new Error("rename rejected"));
    state.client.fork.mockRejectedValue(new Error("fork rejected"));
    await actions.createSession();
    await actions.saveSessionRename("A");
    await actions.duplicateSession("A");
    await actions.forkSessionAtSeq(3);
    expect(state.sessionOperations).toEqual([]);
    expect(state.managementNotice).toBe("");
  });

  it("keeps confirmed creation even when subsequent listing fails", async () => {
    const { state, actions } = activityHarness();
    state.client.listSessions.mockRejectedValue(new Error("list failed"));
    await actions.createSession();
    expect(state.sessionOperations).toEqual([expect.objectContaining({ kind: "created", sessionId: "created" })]);
    expect(state.runtimeError).toContain("list failed");
  });

  it("records the canonical rename title returned by the runtime", async () => {
    const { state, actions } = activityHarness();
    state.sessionTitleDraft = "A title normalized by the runtime";
    state.client.rename.mockResolvedValueOnce({ title: "Canonical title" });
    await actions.saveSessionRename("A");
    expect(state.sessionOperations[0].title).toBe("Canonical title");
    expect(state.managementNotice).toContain("Canonical title");
  });

  it("retains a real fork without claiming a successful rename when renaming fails", async () => {
    const { state, actions } = activityHarness();
    state.client.rename.mockRejectedValue(new Error("rename rejected"));
    await actions.duplicateSession("A");
    expect(state.sessionOperations).toEqual([expect.objectContaining({ kind: "forked", sessionId: "fork", title: "fork" })]);
    expect(state.managementError).toContain("rename rejected");
  });

  it.each(["duplicateSession", "forkSessionAtSeq"])("does not navigate after a late %s result", async (method) => {
    const { state, actions } = activityHarness();
    let finishFork!: (created: { sessionId: string }) => void;
    state.client.fork.mockImplementationOnce(() => new Promise((resolve) => { finishFork = resolve; }));
    const forking = actions[method](method === "duplicateSession" ? "A" : 3);
    state.activeSessionId = "B";
    state.sessionSelectionRequest += 1;
    finishFork({ sessionId: "fork" });
    await forking;
    expect(state.selectSession).not.toHaveBeenCalled();
    expect(state.sessionOperations).toHaveLength(1);
    expect(state.activeSessionId).toBe("B");
  });

  it.each(["duplicateSession", "forkSessionAtSeq"])("keeps follow-up calls on the original client for %s", async (method) => {
    const { state, actions } = activityHarness();
    const original = state.client;
    let finishFork!: (created: { sessionId: string }) => void;
    original.fork.mockImplementationOnce(() => new Promise((resolve) => { finishFork = resolve; }));
    const forking = actions[method](method === "duplicateSession" ? "A" : 3);
    state.client = { ...original, rename: vi.fn(), listSessions: vi.fn() };
    finishFork({ sessionId: "fork" });
    await forking;
    expect(state.client.rename).not.toHaveBeenCalled();
    expect(state.client.listSessions).not.toHaveBeenCalled();
    expect(state.refresh).not.toHaveBeenCalled();
    expect(state.selectSession).not.toHaveBeenCalled();
    expect(state.sessionOperations).toHaveLength(1);
  });
});

describe("question callback integration", () => {
  function questionHarness(options = ["A", "Other"]) {
    let states: PendingInteractionsBySession = {};
    const state = {
      id: "choice", options, otherOption: "__custom_answer__", customMode: false,
      onAnswer: vi.fn((id: string, value: string, custom = false) => {
        states = setQuestionAnswer(states, "A", id, value, custom);
      }),
    };
    const update = runInNewContext(`${componentFunctions(component("QuestionField"), ["updateAnswer"])}\nupdateAnswer`, state);
    return { state, update, answers: () => states.A.answers };
  }

  it("retains preset selections and does not confuse a preset Other with custom input", () => {
    const h = questionHarness();
    h.update({ selectedValues: ["Other"], text: "" });
    expect(h.answers()).toEqual({ choice: "Other" });
    expect(h.state.customMode).toBe(false);
    expect(h.state.onAnswer).toHaveBeenCalledTimes(1);
  });

  it("switches from preset to custom and back without retaining conflicting answers", () => {
    const h = questionHarness();
    const questions = [{ id: "choice", options: ["A"] }];
    h.update({ selectedValues: ["A"], text: "" });
    h.update({ selectedValues: ["__custom_answer__"], text: "  " });
    expect(questionsAnswered(questions, h.answers())).toBe(false);
    h.update({ selectedValues: ["__custom_answer__"], text: "path\ncommand" });
    expect(buildQuestionAnswers(questions, h.answers())).toEqual([{ id: "choice", selected: [], custom: "path\ncommand" }]);
    h.update({ selectedValues: ["A"], text: "path\ncommand" });
    expect(h.answers()).toEqual({ choice: "A" });
  });

  it("retains text-only answers through the Question value-change callback", () => {
    const h = questionHarness([]);
    h.update({ selectedValues: [], text: "details" });
    expect(h.answers()).toEqual({ "choice:custom": "details" });
  });
});

describe("response inactivity timer", () => {
  function timerHarness() {
    vi.useFakeTimers();
    const prompt: PendingPrompt = { sessionId: "A", pendingId: "pending", text: "task", images: [], files: [] };
    const response = sessionResponse((id) => state.setSessionRuntimeError(id, "errors.responseInactive"));
    const state = {
      sessionResponse: response,
      get activePrompt() { return response.prompt; }, activeSessionId: "A",
      messages: [{ id: "pending", pending: true }], get sending() { return response.sending; },
      get lastFailedPrompt() { return response.failedPrompt; },
      sessionErrors: {} as Record<string, string>, runtimeError: "",
      setSessionRuntimeError: vi.fn(), t: (key: string) => key,
    };
    response.begin(prompt);
    response.submitted(prompt);
    const source = componentFunctions(app, ["noteResponseActivity", "finishResponse"]);
    const timer = runInNewContext(`${source}\n({ noteResponseActivity, finishResponse })`, state);
    return { state, timer, prompt };
  }

  it("warns about a silent tool without ending or replaying an unconfirmed turn", () => {
    const h = timerHarness();
    h.timer.noteResponseActivity("A", [{ tool: { state: "running" } }]);
    vi.advanceTimersByTime(70_000);
    expect(h.state.sending).toBe(true);
    vi.advanceTimersByTime(110_000);
    expect(h.state.setSessionRuntimeError).toHaveBeenCalledOnce();
    expect(h.state.sending).toBe(true);
    expect(h.state.activePrompt).toEqual(h.prompt);
    expect(h.state.lastFailedPrompt).toBeUndefined();
    expect(h.state.setSessionRuntimeError).toHaveBeenCalledWith("A", "errors.responseInactive");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resets on actual activity, restores the normal timeout after a result and clears on completion", () => {
    const h = timerHarness();
    h.timer.noteResponseActivity("A", [{ tool: { state: "running" } }]);
    vi.advanceTimersByTime(170_000);
    h.timer.noteResponseActivity("A", [{ tool: { state: "done" } }]);
    vi.advanceTimersByTime(69_999);
    expect(h.state.setSessionRuntimeError).not.toHaveBeenCalled();
    h.timer.finishResponse("A");
    vi.advanceTimersByTime(180_000);
    expect(h.state.setSessionRuntimeError).not.toHaveBeenCalled();
  });

  it("does not extend the timeout for activity from another session", () => {
    const h = timerHarness();
    h.timer.noteResponseActivity("B", [{ tool: { state: "running" } }]);
    vi.advanceTimersByTime(70_000);
    expect(h.state.setSessionRuntimeError).toHaveBeenCalledOnce();
  });
});

describe("attachment reference lifecycle", () => {
  it("only removes attachments actually submitted", async () => {
    const h = submissionHarness();
    const draft = new File(["draft"], "draft.txt");
    const submitted = new File(["submitted"], "submitted.txt");
    h.state.draftFilesBySession.A = [draft, submitted];
    await h.submit("task", [], [submitted]);
    expect(h.state.draftFilesBySession.A).toEqual([draft]);
  });

  it("retains accepted uploads for preview", async () => {
    const h = submissionHarness();
    const file = new File(["x"], "report.txt");
    await h.submit("draft", [], [file]);
    expect(h.state.attachmentFilesBySession.A.new).toBe(file);
  });

  it("rolls back failed sends without dropping earlier attachments or other sessions", async () => {
    const h = submissionHarness();
    const file = new File(["x"], "report.txt");
    h.state.attachmentFilesBySession = { A: { earlier: file }, B: { other: file } };
    h.client.prompt.mockRejectedValue(new Error("rejected"));
    await expect(h.submit("draft", [], [file])).rejects.toThrow("rejected");
    expect(Object.keys(h.state.attachmentFilesBySession.A)).toEqual(["earlier"]);
    expect(h.state.attachmentFilesBySession.B.other).toBe(file);
  });

  it("does not cache an upload that resolves after cancellation", async () => {
    const h = submissionHarness();
    h.client.uploadFile.mockImplementation(async () => {
      h.state.sessionResponse.finish("A");
      return { receiptId: "receipt", file: { attachmentId: "new", name: "report.txt", bytes: 1 } };
    });
    await expect(h.submit("draft", [], [new File(["x"], "report.txt")])).rejects.toThrow("composer.sessionChanged");
    expect(h.state.attachmentFilesBySession).toEqual({});
    expect(h.client.prompt).not.toHaveBeenCalled();
  });

  it("preserves an earlier preview when a repeated content-addressed upload fails", async () => {
    const h = submissionHarness();
    const original = new File(["x"], "report.txt");
    h.state.attachmentFilesBySession = { A: { new: original } };
    h.client.prompt.mockRejectedValue(new Error("rejected"));
    await expect(h.submit("draft", [], [new File(["x"], "renamed.txt")])).rejects.toThrow("rejected");
    expect(h.state.attachmentFilesBySession.A.new).toBe(original);
  });
});

describe("continuation submission", () => {
  function continuationHarness() {
    const h = submissionHarness();
    const state = Object.assign(h.state, {
      continuingTask: false, pendingApproval: undefined as unknown, pendingQuestion: undefined as unknown,
      sessionSelectionRequest: 1, sessionEventRevision: 0, todos: [], historyEntries: [],
      hasRetryableTask: () => true,
    });
    const resume = runInNewContext(
      `${submissionSource}\n${componentFunctions(app, ["retryInterruptedTask"])}\nretryInterruptedTask`, state,
    ) as () => Promise<void>;
    return { ...h, state, resume };
  }

  it.each(["event", "selection", "approval", "question"])("discards a status response after %s changes", async (change) => {
    const h = continuationHarness();
    h.client.listSessions.mockImplementation(async () => {
      if (change === "event") h.state.sessionEventRevision += 1;
      if (change === "selection") h.state.sessionSelectionRequest += 1;
      if (change === "approval") h.state.pendingApproval = {};
      if (change === "question") h.state.pendingQuestion = {};
      return { items: [{ sessionId: "A", running: true }] };
    });
    await h.resume();
    expect(h.state.sending).toBe(false);
    expect(h.client.prompt).not.toHaveBeenCalled();
    expect(h.state.continuingTask).toBe(false);
  });

  it("does not replay a task that DSH reports as running", async () => {
    const h = continuationHarness();
    h.client.listSessions.mockResolvedValue({ items: [{ sessionId: "A", running: true }] });
    await h.resume();
    expect(h.state.sending).toBe(true);
    expect(h.client.prompt).not.toHaveBeenCalled();
  });

  it("sends one contextual continuation and preserves the current text and file draft", async () => {
    const h = continuationHarness();
    const draft = new File(["x"], "draft.txt");
    h.state.draftFilesBySession.A = [draft];
    h.client.listSessions.mockImplementation(async () => {
      h.state.input = "edited while checking";
      return { items: [{ sessionId: "A", running: false }] };
    });
    await Promise.all([h.resume(), h.resume()]);
    expect(h.client.prompt).toHaveBeenCalledExactlyOnceWith("A", [{ type: "text", text: "activity.continuePrompt" }]);
    expect(h.client.uploadFile).not.toHaveBeenCalled();
    expect(h.state.input).toBe("edited while checking");
    expect(h.state.sessionDrafts.A).toBe("edited while checking");
    expect(h.state.draftFilesBySession.A).toEqual([draft]);
  });
});

describe("session lifecycle integration", () => {
  it("marks running tools interrupted after DSH confirms the stop", async () => {
    const h = submissionHarness();
    Object.assign(h.client, { cancel: vi.fn(async () => undefined) });
    Object.assign(h.state, {
      sessionSelectionRequest: 1, hasMessageContent, interruptRunningTools, todos: [],
      messages: [{ id: "tool-1", role: "tool", text: "exec", tool: { callId: "c1", name: "bash", state: "running" } }],
      pendingInteractionsBySession: { A: { approval: { sessionId: "A", rpcId: "r1", approvalId: "p1" }, answers: {} } },
      busyInteractions: { r1: true }, clearPendingSession,
    });
    h.state.sessionResponse.begin({ sessionId: "A", pendingId: "p1", text: "task", images: [], files: [] });
    h.state.sessionResponse.submitted(h.state.sessionResponse.prompt!);
    expect(h.state.sending).toBe(true);
    expect(h.state.messages[0].tool?.state).toBe("running");
    const cancel = runInNewContext(`${componentFunctions(app, ["cancel"])}\ncancel`, h.state);
    await cancel();
    expect(h.state.sending).toBe(false);
    expect(h.state.setSessionRuntimeError).not.toHaveBeenCalled();
    expect(h.state.messages[0].tool?.state).toBe("interrupted");
    expect(h.state.pendingInteractionsBySession.A).toBeUndefined();
    expect(h.state.busyInteractions).toEqual({});
  });

  it("reports a failed stop without enabling another submission", async () => {
    const h = submissionHarness();
    Object.assign(h.client, { cancel: vi.fn(async () => { throw new Error("cancel failed"); }) });
    Object.assign(h.state, { sessionSelectionRequest: 1, hasMessageContent });
    await h.submit("task", [], []);
    const cancel = runInNewContext(`${componentFunctions(app, ["cancel"])}\ncancel`, h.state);
    await cancel();
    expect(h.state.sending).toBe(true);
    expect(h.state.sessionResponse.canSubmit).toBe(false);
    expect(h.state.setSessionRuntimeError).toHaveBeenCalledWith("A", expect.objectContaining({ message: "cancel failed" }));
    expect(h.state.lastFailedPrompt).toBeUndefined();
  });

  it.each([
    ["approval", "resolve"], ["question", "resolve"], ["approval", "reject"], ["question", "reject"],
  ])("ignores a late %s %s after the turn finishes", async (kind, outcome) => {
    const h = submissionHarness();
    let acknowledge!: () => void;
    let reject!: (error: Error) => void;
    Object.assign(h.client, { respond: vi.fn(() => new Promise<void>((resolve, fail) => { acknowledge = resolve; reject = fail; })) });
    const request = { sessionId: "A", rpcId: "r1", approvalId: "p1", questions: [] };
    const state = Object.assign(h.state, {
      pendingApproval: kind === "approval" ? request : undefined,
      pendingQuestion: kind === "question" ? request : undefined,
      pendingInteractionsBySession: { A: { [kind]: request, answers: {} } } as PendingInteractionsBySession,
      busyInteractions: {}, interactionBusy: false, questionAnswers: {},
      clearPendingApproval, clearPendingQuestion, questionsAnswered: () => true, buildQuestionAnswers,
    });
    await h.submit("task", [], []);
    h.state.sessionResponse.waitForInteraction("A");
    const callbacks = runInNewContext(`${componentFunctions(app, [
      "respondApproval", "respondQuestion", "resumeResponseAfterInteraction", "resolveInteraction",
    ])}\n({ respondApproval, respondQuestion })`, h.state);
    const responding = kind === "approval" ? callbacks.respondApproval("allowed-once") : callbacks.respondQuestion();
    h.state.sessionResponse.finish("A");
    state.pendingInteractionsBySession = {};
    if (outcome === "resolve") acknowledge();
    else reject(new Error("stale failure"));
    await responding;
    expect(h.state.sending).toBe(false);
    expect(h.state.sessionResponse.phase).toBe("idle");
    expect(h.state.setSessionRuntimeError).not.toHaveBeenCalled();
  });

  it.each(["approval", "question"])("resolves the same %s after switching A to B to A", async (kind) => {
    const h = submissionHarness();
    let acknowledge!: () => void;
    Object.assign(h.client, { respond: vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; })) });
    const request = { sessionId: "A", rpcId: "r1", approvalId: "p1", questions: [] };
    const state = Object.assign(h.state, {
      pendingApproval: kind === "approval" ? request : undefined,
      pendingQuestion: kind === "question" ? request : undefined,
      pendingInteractionsBySession: { A: { [kind]: request, answers: {} } },
      busyInteractions: {}, interactionBusy: false, questionAnswers: {},
      clearPendingApproval, clearPendingQuestion, questionsAnswered: () => true, buildQuestionAnswers,
    });
    h.state.sessionResponse.waitForInteraction("A");
    const callbacks = runInNewContext(`${componentFunctions(app, [
      "respondApproval", "respondQuestion", "resumeResponseAfterInteraction", "resolveInteraction",
    ])}\n({ respondApproval, respondQuestion })`, state);
    const responding = kind === "approval" ? callbacks.respondApproval("allowed-once") : callbacks.respondQuestion();
    h.state.sessionResponse.select("B", false);
    h.state.sessionResponse.select("A", false);
    h.state.sessionResponse.loading = false;
    h.state.sessionResponse.waitForInteraction("A");
    acknowledge();
    await responding;
    expect(state.pendingInteractionsBySession.A[kind]).toBeUndefined();
    expect(h.state.sending).toBe(true);
    h.state.sessionResponse.reconcile(false);
    expect(h.state.sessionResponse.canSubmit).toBe(true);
  });

  function selectionHarness() {
    const h = submissionHarness();
    let resolveHistory!: (history: SessionHistory) => void;
    Object.assign(h.client, {
      history: vi.fn(() => new Promise<SessionHistory>((resolve) => { resolveHistory = resolve; })),
      describeSettings: vi.fn(async () => ({ namespaces: [], writable: false, hasDocument: false })),
      listProviders: vi.fn(async () => ({ providers: [] })),
      models: vi.fn(async () => ({ groups: [], current: { provider: "p", model: "m" } })),
    });
    const state = Object.assign(h.state, {
      sessionSelectionRequest: 0, modelSelectionRequest: 0,
      subagentHistoryRequest: 0, subagents: [], selectedSubagentId: "", subagentMessages: [], subagentParentAvailable: false,
      workspacePath: "/A", workspaceNotice: "", historyNotice: "", historyEntries: [] as SessionHistory["events"], historyCursor: -1,
      historyHasMore: false, historyLoading: false, historyLoad: undefined,
      todos: [], reasoningEffort: "", modelBusy: false, modelLoading: false, modelLoadError: "", sessionErrors: {},
      sessions: [{ sessionId: "A", running: false }, { sessionId: "B", running: false }],
      pendingInteractionsBySession: {}, closeMobileSidebar: vi.fn(),
      settingsWritable: false, settingsHasDocument: false, settingsNamespaces: [], providers: [],
      credentialRefs: [], credentials: {}, modelGroups: [], foldHistory, mergeHistoryEntries,
      collectCredentialRefs: (): string[] => [], enrichModelGroups: (groups: unknown) => groups,
      modelSelectionKey: (provider: string, model: string) => `${provider}/${model}`,
      modelCredentialConfigured: () => true, userFacingError: String,
    });
    const select = runInNewContext(`${componentFunctions(app, ["selectSession", "loadSessionModels"])}\nselectSession`, state);
    return { ...h, state, select, resolveHistory: (history: SessionHistory) => resolveHistory(history) };
  }

  it("runs real selection and submission handlers without overwriting a new pending message", async () => {
    const h = selectionHarness();
    const selecting = h.select("B");
    await expect(h.submit("new task", [], [])).rejects.toThrow("app.connecting");
    expect(h.client.prompt).not.toHaveBeenCalled();
    h.resolveHistory({ events: [], cursor: -1, hasMore: false });
    await selecting;
    expect(h.state.sessionResponse.loading).toBe(false);
    await h.submit("new task", [], []);
    expect(h.state.messages).toEqual([expect.objectContaining({ text: "new task", pending: true })]);
    expect(h.client.prompt).toHaveBeenCalledExactlyOnceWith("B", [{ type: "text", text: "new task" }]);
  });

  it("loads models independently of failed history and blocks ordinary sends without losing the draft", async () => {
    const h = selectionHarness();
    Object.assign(h.client, {
      history: vi.fn(async () => { throw new Error("durable parent address"); }),
      models: vi.fn(async () => ({ groups: [{ id: "p", name: "Provider", models: [{ id: "m", name: "Model" }] }], current: { provider: "p", model: "m" } })),
    });
    await h.select("A");
    expect(h.state.modelGroups).toHaveLength(1);
    expect(h.state.modelLoadError).toBe("");
    expect(h.state.sessionLoadError).toContain("durable parent address");
    expect(h.state.input).toBe("draft");
    await expect(h.submit("quick action", [], [])).rejects.toThrow("durable parent address");
    expect(h.client.prompt).not.toHaveBeenCalled();
  });

  it("distinguishes model loading failure from missing configuration", async () => {
    const h = selectionHarness();
    Object.assign(h.client, { models: vi.fn(async () => { throw new Error("catalog failed"); }) });
    const selecting = h.select("B");
    h.resolveHistory({ events: [], cursor: -1, hasMore: false });
    await selecting;
    expect(h.state.modelLoadError).toContain("catalog failed");
    expect(h.state.modelLoading).toBe(false);
    expect(h.state.sessionLoadError).toBe("");
  });

  it.each([true, false])("corrects incompatible reasoning only after valid ordinary history (%s)", async (valid) => {
    const h = selectionHarness();
    const selectModel = vi.fn(async () => undefined);
    Object.assign(h.client, {
      history: valid ? vi.fn(async () => ({ events: [], cursor: -1, hasMore: false })) : vi.fn(async () => { throw new Error("durable parent address"); }),
      models: vi.fn(async () => ({ groups: [], current: { provider: "p", model: "m", reasoningEffort: "invalid" } })),
      selectModel,
    });
    await h.select("A");
    expect(selectModel).toHaveBeenCalledTimes(valid ? 1 : 0);
  });

  it("retains history errors and cached messages when model loading finishes later", async () => {
    const h = selectionHarness();
    let finishModels!: (value: unknown) => void;
    Object.assign(h.client, {
      history: vi.fn(async () => { throw new Error("history: API Key unavailable"); }),
      models: vi.fn(() => new Promise((resolve) => { finishModels = resolve; })),
    });
    h.state.historyEntries = [{ event: { seq: 1, time: 1, type: "user/message", data: { content: [{ type: "text", text: "retained history" }] } } }];
    const selecting = h.select("A");
    await vi.waitFor(() => expect(h.state.sessionLoadError).toContain("API Key"));
    finishModels({ groups: [], current: { provider: "p", model: "m" } });
    await selecting;
    expect(h.state.runtimeError).toContain("API Key");
    expect(h.state.sessionErrors).toHaveProperty("A", h.state.sessionLoadError);
    expect(h.state.historyEntries).toHaveLength(1);
    expect(h.state.input).toBe("draft");
  });

  it("discards history finishing after disconnect", async () => {
    const h = selectionHarness();
    const selecting = h.select("B");
    h.state.sessionSelectionRequest += 1;
    h.state.sessionResponse.disconnect();
    h.resolveHistory({ events: [{ event: { seq: 1, time: 1, type: "user/message", data: { text: "stale" } } }], cursor: 1, hasMore: false });
    await selecting;
    expect(h.state.messages).toEqual([]);
    expect(h.state.sessionResponse.phase).toBe("disconnected");
  });

  it("does not overwrite the newly selected session with late credential metadata", async () => {
    const h = selectionHarness();
    let finishOldCredentials!: (value: unknown) => void;
    const api = Object.assign(h.client, {
      history: vi.fn(async () => ({ events: [], cursor: -1, hasMore: false })),
      describeCredentials: vi.fn()
        .mockImplementationOnce(() => new Promise((resolve) => { finishOldCredentials = resolve; }))
        .mockResolvedValue({ credentials: { current: { configured: true } } }),
    });
    h.state.collectCredentialRefs = () => ["provider"];
    const selectingOld = h.select("A");
    await vi.waitFor(() => expect(api.describeCredentials).toHaveBeenCalledOnce());
    await h.select("B");
    finishOldCredentials({ credentials: { stale: { configured: false } } });
    await selectingOld;
    expect(h.state.credentials).toEqual({ current: { configured: true } });
    expect(h.state.activeSessionId).toBe("B");
  });
});

describe("issue workflow presentation boundaries", () => {
  it("binds permission confirmation to a session and verifies the official command result", () => {
    const permission = component("PermissionSelector");
    expect(permission).toContain("confirmSessionId !== sessionId");
    expect(permission).toContain("confirmationPreset !== nextPreset");
    expect(permission).toContain("client.selectPermission(sourceSession, nextPreset)");
    expect(permission).not.toContain("client.prompt(");
    expect(permission).toContain('role="alert"');
    expect(permission).toContain("disabled={busy || option.value");
  });

  it("warns about images before submission and preserves drafts during a model switch", () => {
    const composer = component("DshPromptComposer");
    expect(composer).toContain("preferredImageModel(modelGroups, selectedModel)");
    expect(composer).toContain('t("composer.textOnlyModel")');
    expect(composer).toContain("unsupportedImages || modelBusy");
    expect(composer).toContain("if (!imageInputSupported && detail.files.some(isImageAttachment))");
    expect(composer).not.toContain('throw new Error(t("models.unsupportedImage"');
    expect(composer).not.toMatch(/attachments\s*=\s*\[\]/);
  });

  it("removes images immediately when no vision model exists and links to configuration", () => {
    const composer = component("DshPromptComposer");
    expect(composer).toContain("attachments = attachments.filter((attachment) => !isImageAttachment(attachment))");
    expect(composer).toContain('t("composer.imageRejectedNoModel")');
    expect(composer).toContain("onConfigureImageModel");
    expect(composer).toContain('{#if sessionId && imageRejectedNoModel}');
  });

  it("shows model, provider, and credential context for 401 failures", () => {
    expect(app).toContain("const authFailure = $derived(/401|认证失败|authentication failed|unauthorized/iu.test(sessionLoadError || runtimeError));");
    expect(app).toContain('t("errors.authFailureContext"');
    expect(app).toContain('t("errors.authFailureBuiltinHint")');
    expect(app).toContain("function openCredentialSettingsForCurrentModel()");
    expect(app).toContain('if (ref === "XG_GOMODEL_API_KEY")');
    expect(app).toContain("onclick={openCredentialSettingsForCurrentModel}");
    expect(app).toContain("authFailureDetail");
  });

  it("keeps attachment actions available while a turn is running", () => {
    const composer = component("DshPromptComposer");
    expect(composer).toContain("<ComposerAddFiles disabled={disabled || !sessionId} />");
    expect(composer).toContain("disabled={disabled || !sessionId || captureBusy}");
    expect(composer).not.toContain("disabled={disabled || !sessionId || loading}");
  });

  it("supports an Other answer without changing the official answer shape", () => {
    const field = component("QuestionField");
    expect(field).toContain('t("interactions.otherOption")');
    expect(field).toContain("customSelected");
    expect(field).toContain("<QuestionInput");
    expect(field).toContain("onAnswer(id, value.text, true)");
    expect(field).toContain("!options.length");
    expect(field).not.toContain('onAnswer(id, "", true)');
  });

  it("previews attachment text without executing it and scopes image reads to the session", () => {
    const attachment = component("MessageAttachment");
    expect(attachment).toContain("<pre>{text}</pre>");
    expect(attachment).not.toContain("{@html");
    expect(attachment).not.toContain("<iframe");
    expect(attachment).toContain('"session.attachment"');
    expect(attachment).toContain("sessionId, attachmentId: attachment.attachmentId");
    expect(attachment).toContain('["image/png", "image/jpeg", "image/webp", "image/gif"]');
    expect(attachment).toContain("URL.revokeObjectURL");
    expect(attachment).toContain("current !== generation");
    expect(attachment).toContain("onExportSession?.(sessionId)");
  });

  it("selects a bounded tool timeout after applying each event", () => {
    expect(app).toContain('sessionResponse.activity(sessionId, responseMessages.some((item) => item.tool?.state === "running"))');
    expect(app).toContain("noteResponseActivity(payload.sessionId, transcript.messages);");
    expect(app).not.toContain("armResponseTimeout(prompt);\n        return;");
  });

  it("discards stale continuation status and keeps unsent file drafts intact", () => {
    expect(app).toContain("eventRevision !== sessionEventRevision");
    expect(app).toContain("const submittedFiles = fileAttachments.slice()");
    expect(app).toContain("mergeHistoryEntries(result.events, bufferedFrames)");
  });

  it("uses message identity for repeated tool cards", () => {
    const tools = component("ToolCallGroup");
    expect(tools).toContain("as message (message.id)");
    expect(tools).toContain("updateToolExpanded(message.id");
  });

  it("keeps tool commands readable instead of forcing one-line truncation", () => {
    const tools = component("ToolCallGroup");
    expect(tools).toContain("overflow-wrap: anywhere");
    expect(tools).toContain("white-space: normal");
    const command = `Get-ChildItem ${"long/path/".repeat(20)}\nWrite-Output done`;
    expect(toolDisplay({ name: "pwsh", args: JSON.stringify({ command }) }).detail).toBe(command);
  });
});
