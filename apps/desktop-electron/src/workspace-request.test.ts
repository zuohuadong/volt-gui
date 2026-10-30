import assert from "node:assert/strict";
import test from "node:test";
import { checkWorkspaceRequest } from "./workspace-request.ts";

const client = {
  async call() { return { items: [{ sessionId: "old", cwd: "home" }, { sessionId: "new", cwd: "project" }] }; },
  async readFirstStreamItem(method: string) {
    if (method === "workspace/follow") return { type: "baseline", value: { items: [
      { workspaceId: "workspace-1", path: "project" },
      { workspaceId: "unsafe", path: "home" },
    ] } };
    return { header: { cwd: "home" } };
  },
};
const validate = (cwd: string) => {
  if (cwd !== "project") throw new Error("WORKSPACE_UNSAFE");
  return "canonical-project";
};
test("creation validates the requested directory, never a global bootstrap warning", async () => {
  assert.deepEqual(await checkWorkspaceRequest(client, "session.create", { cwd: "project" }, "home", validate), { cwd: "canonical-project" });
  await assert.rejects(checkWorkspaceRequest(client, "session.create", {}, "home", validate), /UNSAFE/);
  await assert.rejects(checkWorkspaceRequest(client, "workspace.create", { path: "home" }, "project", validate), /UNSAFE/);
  assert.deepEqual(await checkWorkspaceRequest(client, "session.create", { cwd: "home" }, "project", validate), { cwd: "canonical-project" });
});
test("preserves the official workspaceId-only session creation form", async () => {
  const request = { workspaceId: "workspace-1" };
  assert.equal(await checkWorkspaceRequest(client, "session.create", request, "home", validate), request);
  await assert.rejects(
    checkWorkspaceRequest(client, "session.create", { workspaceId: "workspace-1", cwd: "project" }, "home", validate),
    /UNAVAILABLE/,
  );
  for (const workspaceId of ["", "missing", null, 123]) {
    await assert.rejects(checkWorkspaceRequest(client, "session.create", { workspaceId }, "project", validate), /UNAVAILABLE/);
  }
  await assert.rejects(checkWorkspaceRequest(client, "session.create", { workspaceId: "unsafe" }, "project", validate), /UNSAFE/);
});
test("all execution entry points validate official session cwd, not a spoofed payload", async () => {
  for (const method of ["session.prompt", "session.fork", "session.updateQueue", "commands.execute", "goal.create", "goal.edit", "goal.resume"]) {
    await assert.rejects(checkWorkspaceRequest(client, method, { sessionId: "old", cwd: "project" }, "project", validate), /UNSAFE/);
    await checkWorkspaceRequest(client, method, { sessionId: "new" }, "home", validate);
    await assert.rejects(checkWorkspaceRequest(client, method, { sessionId: "missing" }, "project", validate), /UNAVAILABLE/);
  }
});
test("subagent execution checks the child's official header", async () => {
  await assert.rejects(checkWorkspaceRequest(client, "subagent.prompt", { parentSessionId: "new", childSessionId: "child", mode: "continuable" }, "project", validate), /UNSAFE/);
});
test("ordinary execution cannot target an owned child, but a normal fork remains usable", async () => {
  const routed = { ...client, async call() { return { items: [
    { sessionId: "child", cwd: "project", origin: "subagent", parentSessionId: "parent" },
    { sessionId: "fork", cwd: "project", origin: "user", parentSessionId: "parent" },
  ] }; } };
  await assert.rejects(checkWorkspaceRequest(routed, "session.prompt", { sessionId: "child" }, "project", validate), /durable parent address/);
  await checkWorkspaceRequest(routed, "session.prompt", { sessionId: "fork" }, "project", validate);
});
test("reading history and stopping work remain possible in an unsafe old session", async () => {
  const noReads = { call: async () => { throw new Error("unexpected"); }, readFirstStreamItem: async () => { throw new Error("unexpected"); } };
  for (const method of ["session.history", "session.cancel", "goal.pause", "goal.clear", "subagent.interrupt"]) {
    await checkWorkspaceRequest(noReads, method, { sessionId: "old" }, "home", validate);
  }
});
