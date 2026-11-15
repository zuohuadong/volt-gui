import assert from "node:assert/strict";
import test from "node:test";
import { allowedDshMethods, handlerOnlyDshMethods, mapLegacyDshRequest } from "./dsh-method-map.ts";

// 白名单与端点映射必须始终一致：只加白名单不加映射，前台只会收到
// “不支持的 DSH 方法”（issue #294 的 speech/catalog 就是这么坏的）。
// 这三个映射会对载荷做强制校验，空载荷本来就该抛错，所以给一份最小合法样例。
const minimalPayloads: Record<string, Record<string, unknown>> = {
  "fileUploads.upload": { agentId: "s1", request: { data: "aGVsbG8=", name: "a.txt" } },
  "commands.execute": { sessionId: "s1", line: "/permission read-only" },
  "commands.list": { sessionId: "s1" },
  "schedule.list": {},
  "schedule.run": { id: "id" },
  "schedule.edit": { id: "id", action: "update", patch: { active: false } },
  "agentTeams.setEnabled": { sessionId: "s1", enabled: true },
  "subagent.history": { parentSessionId: "p1", childSessionId: "c1", mode: "one-shot" },
};

test("minimal payload fixtures only describe allowlisted methods", () => {
  for (const method of Object.keys(minimalPayloads)) {
    assert.ok(allowedDshMethods.has(method), `${method} has an obsolete request fixture`);
  }
});

test("every allowlisted DSH method resolves to an endpoint", () => {
  const unmapped: string[] = [];
  for (const method of allowedDshMethods) {
    if (handlerOnlyDshMethods.has(method)) continue;
    try {
      const mapped = mapLegacyDshRequest(method, minimalPayloads[method] ?? {});
      assert.ok(mapped.endpoint, `${method} mapped to an empty endpoint`);
    } catch {
      unmapped.push(method);
    }
  }
  assert.deepEqual(unmapped, [], `allowlisted methods without an endpoint: ${unmapped.join(", ")}`);
});

test("the command catalog lists through the official agent-scoped endpoint", () => {
  assert.deepEqual(mapLegacyDshRequest("commands.list", { sessionId: "s1" }), {
    endpoint: "commands/list",
    args: { agentId: "s1" },
  });
});

test("schedule actions use the official namespace while job and terminal streams stay on their dedicated IPC", () => {
  for (const method of [
    "job.list", "job.follow", "job.kill",
    "terminal.list", "terminal.environment", "terminal.shells", "terminal.create",
    "terminal.readScreen", "terminal.close", "terminal.rename",
    "terminal/readScreen", "terminal/retain", "terminal/attach",
  ]) {
    assert.equal(allowedDshMethods.has(method), false);
    assert.throws(() => mapLegacyDshRequest(method, {}), /不支持/u);
  }
  assert.deepEqual(mapLegacyDshRequest("schedule.edit", { id: "x", action: "delete" }), {
    endpoint: "schedule/edit",
    args: { request: { id: "x", action: "delete" } },
  });
  assert.deepEqual(mapLegacyDshRequest("agentTeams.setEnabled", { sessionId: "s1", enabled: false }), {
    endpoint: "agentTeams/setEnabled",
    args: { agentId: "s1", enabled: false },
  });
});

test("handler-only methods are the documented bypasses", () => {
  for (const method of handlerOnlyDshMethods) {
    assert.ok(allowedDshMethods.has(method), `${method} must stay allowlisted`);
    assert.throws(() => mapLegacyDshRequest(method, {}), /不支持的 DSH 方法/u);
  }
});

// issue #294：设置页读语音模型状态必须转发到官方 speech/* 端点。
test("speech methods forward to the official speech endpoints", () => {
  assert.deepEqual(mapLegacyDshRequest("speech/catalog", {}), { endpoint: "speech/catalog", args: {} });
  assert.deepEqual(mapLegacyDshRequest("speech/prepare", { providerId: "sensevoice" }), {
    endpoint: "speech/prepare",
    args: { providerId: "sensevoice" },
  });
  assert.deepEqual(mapLegacyDshRequest("speech/cancelPreparation", { providerId: "sensevoice" }), {
    endpoint: "speech/cancelPreparation",
    args: { providerId: "sensevoice" },
  });
  const transcribe = mapLegacyDshRequest("speech/transcribe", { request: { audioBase64: "AAA" } });
  assert.equal(transcribe.endpoint, "speech/transcribe");
  assert.deepEqual(transcribe.args, { request: { audioBase64: "AAA" } });
});
