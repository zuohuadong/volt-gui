import assert from "node:assert/strict";
import test from "node:test";
import { commandExecuteRequest, permissionCommandRequest } from "./permission-request.ts";

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

test("any registered slash command line is forwarded, not only /permission", () => {
  assert.deepEqual(commandExecuteRequest({ sessionId: "s1", line: "/plan off" }), {
    endpoint: "commands/execute",
    args: { agentId: "s1", line: "/plan off", submittedAttachments: [] },
  });
  assert.deepEqual(commandExecuteRequest({ sessionId: "s1", line: "/compact" }), {
    endpoint: "commands/execute",
    args: { agentId: "s1", line: "/compact", submittedAttachments: [] },
  });
});

test("command lines are validated: no leading text, bounded length", () => {
  for (const line of ["plan", "", "/", "/1plan", "/plan\u0000x", `/${"a".repeat(5000)}`]) {
    assert.throws(() => commandExecuteRequest({ sessionId: "s1", line }), /Invalid command line/u);
  }
  assert.throws(() => commandExecuteRequest({ sessionId: "", line: "/plan" }), /Invalid command line/u);
});

test("the official command-name syntax allows underscores and whitespace separators", () => {
  for (const line of ["/my_command", "/my-command", "/plan off", "/plan\toff", "/plan\noff"]) {
    assert.equal(commandExecuteRequest({ sessionId: "s1", line }).args.line, line);
  }
});
