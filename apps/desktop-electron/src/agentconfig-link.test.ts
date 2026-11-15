import assert from "node:assert/strict";
import test from "node:test";

import { parseAgentConfigLink, scanAgentConfigArgv } from "./agentconfig-link.ts";

const valid = "agentconfig://import?v=1&bundle=eyJzY2hlbWEiOiJhZ2VudGNvbmZpZy1idW5kbGUifQ";

test("accepts an import link with a base64url bundle", () => {
  assert.deepEqual(parseAgentConfigLink(valid), { ok: true, link: valid });
  assert.deepEqual(parseAgentConfigLink(`  ${valid}  `), { ok: true, link: valid });
});

test("normalizes an upper-case scheme so the bridge cannot drop it", () => {
  // Windows 的协议名大小写不敏感；渲染层按小写匹配，所以这里必须规范化。
  const upper = "AGENTCONFIG://import?v=1&bundle=eyJzY2hlbWEiOiJhZ2VudGNvbmZpZy1idW5kbGUifQ";
  assert.deepEqual(parseAgentConfigLink(upper), { ok: true, link: valid });
  assert.deepEqual(
    parseAgentConfigLink("AgentConfig://import?v=1&bundle=eyJ6Ijoi_dXJsIg"),
    { ok: true, link: "agentconfig://import?v=1&bundle=eyJ6Ijoi_dXJsIg" },
  );
});

test("keeps the last link when one argv carries several", () => {
  const other = "agentconfig://import?v=1&bundle=b3RoZXI";
  const scan = scanAgentConfigArgv([valid, "--flag", other]);
  assert.equal(scan.link, other);
  assert.deepEqual(scan.rejected, []);
});

test("rejects malformed variants with a reason instead of guessing", () => {
  const cases = [
    ["https://example.com", "not-agentconfig"],
    ["agentconfig://", "malformed"],
    ["agentconfig://auth/callback?code=x", "unsupported-host"],
    ["agentconfig://import?v=2&bundle=abc", "unsupported-version"],
    ["agentconfig://import?v=1", "missing-bundle"],
    ["agentconfig://import?v=1&bundle=has+plus+signs", "malformed"],
    [`agentconfig://import?v=1&bundle=${"a".repeat(20_001)}`, "malformed"],
  ] as const;
  for (const [value, reason] of cases) {
    assert.deepEqual(parseAgentConfigLink(value), { ok: false, reason }, value.slice(0, 40));
  }
});

test("scans argv, ignoring unrelated arguments and de-duplicating the link", () => {
  const scan = scanAgentConfigArgv(["/app/anyong", "--flag", valid, valid, "agentconfig://auth/callback?code=x"]);
  assert.equal(scan.link, valid);
  assert.deepEqual(scan.rejected, [{ value: "agentconfig://auth/callback?code=x", reason: "unsupported-host" }]);
});

test("returns nothing for a plain launch", () => {
  assert.deepEqual(scanAgentConfigArgv(["/app/anyong", "--enable-logging"]), { rejected: [] });
});