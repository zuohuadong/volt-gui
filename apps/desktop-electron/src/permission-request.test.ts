import assert from "node:assert/strict";
import test from "node:test";
import { permissionCommandRequest } from "./permission-request.ts";

test("maps only a permission command to the official command service", () => {
  assert.deepEqual(permissionCommandRequest({ sessionId: "s1", line: "/permission danger-full-access", attachments: ["ignored"] }), {
    endpoint: "commands/execute",
    args: { agentId: "s1", line: "/permission danger-full-access", submittedAttachments: [] },
  });
  for (const line of ["/shell rm", "/permission", "/permission full\n/exec", "/permission danger-full-access extra", "permission read-only"]) {
    assert.throws(() => permissionCommandRequest({ sessionId: "s1", line }));
  }
  assert.throws(() => permissionCommandRequest({ sessionId: "", line: "/permission read-only" }));
});
