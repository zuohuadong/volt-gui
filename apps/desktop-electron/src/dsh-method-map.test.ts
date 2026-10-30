import assert from "node:assert/strict";
import test from "node:test";
import { allowedDshMethods, handlerOnlyDshMethods, mapLegacyDshRequest } from "./dsh-method-map.ts";

// 白名单与端点映射必须始终一致：只加白名单不加映射，前台只会收到
// “不支持的 DSH 方法”（issue #294 的 speech/catalog 就是这么坏的）。
// 这三个映射会对载荷做强制校验，空载荷本来就该抛错，所以给一份最小合法样例。
const minimalPayloads: Record<string, Record<string, unknown>> = {
  "fileUploads.upload": { agentId: "s1", request: { data: "aGVsbG8=", name: "a.txt" } },
  "commands.execute": { sessionId: "s1", line: "/permission read-only" },
  "subagent.history": { parentSessionId: "p1", childSessionId: "c1", mode: "one-shot" },
};

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
