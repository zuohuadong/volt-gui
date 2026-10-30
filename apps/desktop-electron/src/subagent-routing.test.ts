import assert from "node:assert/strict";
import test from "node:test";
import { listSubagents, subagentAddress } from "./subagent-routing.ts";

test("child addresses preserve the durable direct parent and reject unknown modes", () => {
  const request = { parentSessionId: "direct-parent", childSessionId: "child", mode: "one-shot" };
  assert.deepEqual(subagentAddress(request), { kind: "subagent", ...request });
  for (const invalid of [{ ...request, mode: "unknown" }, { ...request, parentSessionId: "" }, { ...request, childSessionId: "" }]) {
    assert.throws(() => subagentAddress(invalid), /durable parent address/);
  }
});

test("catalog reads official projections without activating or reassigning agents", async () => {
  const calls: string[] = [];
  const entries = [
    { id: "child", mode: "continuable", label: "Child" },
    { id: "one-shot", mode: "one-shot" }, { id: "unknown", mode: "unknown" },
    { id: "wrong-parent", mode: "continuable" }, { id: "gone", mode: "one-shot" },
  ];
  const client = { async call(method: string, args: Record<string, unknown>) {
    calls.push(method);
    if (method === "session/projections") {
      assert.deepEqual(args, { request: { sessionId: "parent" } });
      return { values: { subagentCatalog: entries } };
    }
    assert.equal(method, "session/list");
    return { items: [
      { sessionId: "parent", agentAvailable: false, running: false },
      { sessionId: "child", parentSessionId: "parent", origin: "subagent", running: true },
      { sessionId: "one-shot", parentSessionId: "parent", origin: "subagent" },
      { sessionId: "grandchild", parentSessionId: "child", origin: "subagent" },
      { sessionId: "wrong-parent", parentSessionId: "different-parent", origin: "subagent" },
    ] };
  } };
  const result = await listSubagents(client, "parent");
  assert.equal(result.parentAvailable, false);
  assert.deepEqual(result.entries, [
    { kind: "child", id: "child", mode: "continuable", label: "Child", activity: "running", hasChildren: true },
    { kind: "child", id: "one-shot", mode: "one-shot", label: undefined, activity: "inactive", hasChildren: false },
    { kind: "diagnostic", id: "unknown", reason: "unsupported" },
    { kind: "diagnostic", id: "wrong-parent", reason: "corrupt" },
    { kind: "diagnostic", id: "gone", reason: "unavailable" },
  ]);
  assert.deepEqual(calls, ["session/projections", "session/list"]);
});

test("missing parents are failures rather than successful empty catalogs", async () => {
  await assert.rejects(listSubagents({ call: async () => null }, "missing"), /parent session is unavailable/);
});
