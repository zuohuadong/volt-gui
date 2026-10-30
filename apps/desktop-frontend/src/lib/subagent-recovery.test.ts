import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const app = readFileSync(new URL("../App.svelte", import.meta.url), "utf8");
const script = ts.createSourceFile("App.ts", app.slice(app.indexOf(">") + 1, app.indexOf("</script>")), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = ["refreshManagement", "selectSubagent", "interruptSelectedSubagent", "performManagementAction"];
const source = ts.transpileModule(script.statements.filter((statement) =>
  ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text ?? ""),
).map((statement) => statement.getText(script)).join("\n"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
const child = (id: string) => ({ id, kind: "child", mode: "continuable", activity: "running" });
type Catalog = { entries: ReturnType<typeof child>[]; parentAvailable: boolean };
type History = { events: string[] };
function harness() {
  const client = {
    listSubagents: vi.fn(async () => ({ entries: [child("A")], parentAvailable: false })),
    subagentHistory: vi.fn(async () => ({ events: ["history"] })),
    interruptSubagent: vi.fn(async () => ({ accepted: true })),
  };
  const state = {
    client, activeSessionId: "parent", sessionSelectionRequest: 0,
    managementTab: "subagents", view: "settings", managementRefreshRequest: 0,
    subagentHistoryRequest: 0, subagents: [child("A")], selectedSubagentId: "A",
    subagentParentAvailable: false, subagentMessages: ["cached history"],
    managementError: "", managementNotice: "", managementBusy: "", runtimeConnectionError: "",
    get selectedSubagent() { return this.subagents.find((entry) => entry.id === this.selectedSubagentId); },
    t: (key: string) => key, userFacingError: String,
    foldHistory: (events: unknown[]) => ({ messages: events }),
  };
  const functions = runInNewContext(`${source}\n({ ${names.join(",")} })`, state);
  return { client, state, functions };
}

describe("subagent recovery", () => {
  it("allows stopping a running child without a live parent and does not infer idle from acceptance", async () => {
    const h = harness();
    await h.functions.interruptSelectedSubagent();
    expect(h.client.interruptSubagent).toHaveBeenCalledExactlyOnceWith("parent", "A");
    expect(h.state.subagents[0].activity).toBe("running");
  });

  it("ignores a late older catalog", async () => {
    const h = harness();
    const older = deferred<Catalog>();
    h.client.listSubagents.mockImplementationOnce(() => older.promise);
    const oldRefresh = h.functions.refreshManagement();
    h.client.listSubagents.mockResolvedValue({ entries: [child("B")], parentAvailable: true });
    await h.functions.refreshManagement();
    older.resolve({ entries: [], parentAvailable: false });
    await oldRefresh;
    expect(h.state.subagents.map((entry) => entry.id)).toEqual(["B"]);
    expect(h.state.subagentParentAvailable).toBe(true);
  });

  it("ignores an old catalog after returning to the same parent selection", async () => {
    const h = harness();
    const older = deferred<Catalog>();
    h.client.listSubagents.mockImplementationOnce(() => older.promise);
    const oldRefresh = h.functions.refreshManagement();
    h.state.sessionSelectionRequest += 2;
    older.resolve({ entries: [], parentAvailable: false });
    await oldRefresh;
    expect(h.state.subagents.map((entry) => entry.id)).toEqual(["A"]);
  });

  it("loads the newest child even while an older history is pending", async () => {
    const h = harness();
    const older = deferred<History>();
    h.client.subagentHistory.mockImplementationOnce(() => older.promise);
    const oldRead = h.functions.selectSubagent(child("A"));
    h.client.subagentHistory.mockResolvedValue({ events: ["B history"] });
    await h.functions.selectSubagent(child("B"));
    older.resolve({ events: ["A history"] });
    await oldRead;
    expect(h.client.subagentHistory).toHaveBeenCalledTimes(2);
    expect(h.state.selectedSubagentId).toBe("B");
    expect(h.state.subagentMessages).toEqual(["B history"]);
  });

  it("retains cached child history after retry failure", async () => {
    const h = harness();
    h.client.subagentHistory.mockRejectedValue(new Error("history unavailable"));
    await h.functions.selectSubagent(child("A"));
    expect(h.state.subagentMessages).toEqual(["cached history"]);
    expect(h.state.managementError).toContain("history unavailable");
  });

  it("does not place an old child error on the model settings page", async () => {
    const h = harness();
    const older = deferred<History>();
    h.client.subagentHistory.mockImplementationOnce(() => older.promise);
    const oldRead = h.functions.selectSubagent(child("A"));
    h.state.managementTab = "models";
    older.reject(new Error("old error"));
    await oldRead;
    expect(h.state.managementError).toBe("");
  });
});
