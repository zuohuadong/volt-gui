import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { isAllowedExternalUrl, isAllowedNavigationUrl, isTrustedIpcSenderUrl } from "./renderer-security.ts";

test("trusts only the exact packaged frontend entry for privileged IPC", () => {
  const expected = pathToFileURL(path.join("C:\\Program Files", "暗涌", "frontend", "index.html")).href;
  assert.equal(isTrustedIpcSenderUrl(expected, expected), true);
  assert.equal(isTrustedIpcSenderUrl(`${expected}?debug=1`, expected), false);
  assert.equal(isTrustedIpcSenderUrl(`${expected}#route`, expected), false);
  assert.equal(isTrustedIpcSenderUrl(expected.replace("index.html", "index.html.evil"), expected), false);
  assert.equal(isTrustedIpcSenderUrl("file:///C:/Users/Public/index.html", expected), false);
  assert.equal(isTrustedIpcSenderUrl("https://example.invalid/", expected), false);
});

test("navigation stays on the frontend entry or the managed DSH loopback origin", () => {
  const expected = pathToFileURL("C:\\app\\frontend\\index.html").href;
  const dsh = `http://127.0.0.1:43123/?token=${"A".repeat(43)}`;
  assert.equal(isAllowedNavigationUrl(expected, expected, dsh), true);
  assert.equal(isAllowedNavigationUrl("http://127.0.0.1:43123/session/1", expected, dsh), true);
  assert.equal(isAllowedNavigationUrl("http://127.0.0.1:43124/", expected, dsh), false);
  assert.equal(isAllowedNavigationUrl("http://localhost:43123/", expected, dsh), false);
  assert.equal(isAllowedNavigationUrl("file:///C:/app/frontend/other.html", expected, dsh), false);
});

test("opens only ordinary credential-free HTTP(S) links outside the desktop shell", () => {
  assert.equal(isAllowedExternalUrl("https://example.com/docs?q=1#part"), true);
  assert.equal(isAllowedExternalUrl("http://127.0.0.1:3000/"), true);
  assert.equal(isAllowedExternalUrl("https://user:pass@example.com/"), false);
  assert.equal(isAllowedExternalUrl("file:///C:/secret.txt"), false);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
});
