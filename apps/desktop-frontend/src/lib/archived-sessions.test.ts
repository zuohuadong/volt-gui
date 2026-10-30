import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const app = readFileSync(new URL("../App.svelte", import.meta.url), "utf8");
const script = ts.createSourceFile("App.ts", app.slice(app.indexOf(">") + 1, app.indexOf("</script>")), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const names = ["performManagementAction", "recordSessionOperation", "restoreArchivedSession", "purgeArchivedSession", "cleanupArchivedSessions"];
const source = ts.transpileModule(
  script.statements.filter((statement) => ts.isFunctionDeclaration(statement) && names.includes(statement.name?.text ?? ""))
    .map((statement) => statement.getText(script)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

const archived = (sessionId: string, running = false) => ({ sessionId, updatedAt: 1, running, blank: false, cwd: `/${sessionId}` });

function harness() {
  const client = {
    unarchiveSession: vi.fn(async () => ({ archivedSessionIds: [] as string[] })),
  };
  const api = { deleteArchivedSession: vi.fn(async () => ({ deleted: true })) };
  const state = {
    client,
    archivedSessions: [archived("A"), archived("B", true)],
    allSessions: [archived("A"), archived("B"), archived("live")],
    archivedSessionIds: ["A", "B"],
    managementBusy: "",
    confirmingArchivedSessionId: "",
    confirmingArchivedCleanup: false,
    managementError: "",
    managementTab: "sessions",
    view: "settings",
    activeSessionId: "live",
    sessionOperations: [] as Array<Record<string, unknown>>,
    managementNotice: "",
    refresh: vi.fn(async () => undefined),
    sessionTitle: (session: { sessionId: string }) => `Title ${session.sessionId}`,
    t: (key: string, params?: Record<string, string | number>) => params ? `${key}:${Object.values(params).join(",")}` : key,
    userFacingError: String,
    window: { voltDesktop: api },
    crypto,
    Array,
    Set,
  };
  const functions = runInNewContext(`${source}\n({ ${names.join(",")} })`, state) as {
    restoreArchivedSession(sessionId: string): Promise<void>;
    purgeArchivedSession(sessionId: string): Promise<void>;
    cleanupArchivedSessions(): Promise<void>;
  };
  return { state, client, api, functions };
}

describe("archived session management", () => {
  it("restores an archived session without deleting its history", async () => {
    const h = harness();
    await h.functions.restoreArchivedSession("A");
    expect(h.client.unarchiveSession).toHaveBeenCalledExactlyOnceWith("A");
    expect(h.state.archivedSessionIds).toEqual([]);
    expect(h.state.refresh).toHaveBeenCalledTimes(1);
    expect(h.state.managementNotice).toBe("session.restoreSuccess");
  });

  it("only purges the confirmed archived session and keeps memory intact", async () => {
    const h = harness();
    await h.functions.purgeArchivedSession("A");
    expect(h.api.deleteArchivedSession).not.toHaveBeenCalled();
    h.state.confirmingArchivedSessionId = "A";
    await h.functions.purgeArchivedSession("A");
    expect(h.api.deleteArchivedSession).toHaveBeenCalledExactlyOnceWith("A");
    expect(h.state.confirmingArchivedSessionId).toBe("");
    expect(h.state.allSessions.map((item: { sessionId: string }) => item.sessionId)).toEqual(["B", "live"]);
    expect(h.state.archivedSessionIds).toEqual(["B"]);
    expect(h.state.managementNotice).toBe("session.purgeSuccess");
  });

  it("cleans up archived sessions in bulk while skipping running work", async () => {
    const h = harness();
    h.state.confirmingArchivedCleanup = true;
    await h.functions.cleanupArchivedSessions();
    expect(h.api.deleteArchivedSession).toHaveBeenCalledExactlyOnceWith("A");
    expect(h.state.confirmingArchivedCleanup).toBe(false);
    expect(h.state.allSessions.map((item: { sessionId: string }) => item.sessionId)).toEqual(["B", "live"]);
    expect(h.state.archivedSessionIds).toEqual(["B"]);
    expect(h.state.managementNotice).toBe("session.cleanupNotice:1");
  });
});
