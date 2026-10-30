import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

import { isAllowedExternalUrl, isAllowedNavigationUrl, isAudioOnlyMediaPermission, isTrustedIpcSenderUrl } from "./renderer-security.ts";

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

test("encoded frontend paths retain exact entry matching", () => {
  const expected = pathToFileURL(path.resolve("runner~a19 space%23", "\u4e2d\u6587", "index.html")).href;
  assert.equal(isTrustedIpcSenderUrl(expected, expected), true);
  for (const candidate of [
    expected.replace("%7E", "~"),
    expected.replace("%2523", "%23"),
    `${expected}?debug=1`,
    `${expected}#route`,
    expected.replace("index.html", "other.html"),
    expected.replace("index.html", "%2Findex.html"),
    expected.replace("index.html", "%5Cindex.html"),
  ]) {
    assert.notEqual(candidate, expected);
    assert.equal(isTrustedIpcSenderUrl(candidate, expected), false);
  }
});

test("opens only ordinary credential-free HTTP(S) links outside the desktop shell", () => {
  assert.equal(isAllowedExternalUrl("https://example.com/docs?q=1#part"), true);
  assert.equal(isAllowedExternalUrl("http://127.0.0.1:3000/"), true);
  assert.equal(isAllowedExternalUrl("https://user:pass@example.com/"), false);
  assert.equal(isAllowedExternalUrl("file:///C:/secret.txt"), false);
  assert.equal(isAllowedExternalUrl("javascript:alert(1)"), false);
});

test("allows only microphone audio media permission requests", () => {
  assert.equal(isAudioOnlyMediaPermission("media", { mediaTypes: ["audio"] }), true);
  assert.equal(isAudioOnlyMediaPermission("media", { mediaType: "audio" }), true);
  assert.equal(isAudioOnlyMediaPermission("media", { mediaTypes: ["audio", "video"] }), false);
  assert.equal(isAudioOnlyMediaPermission("media", { mediaTypes: ["video"] }), false);
  assert.equal(isAudioOnlyMediaPermission("media", {}), false);
  assert.equal(isAudioOnlyMediaPermission("media", undefined), false);
  assert.equal(isAudioOnlyMediaPermission("notifications", { mediaTypes: ["audio"] }), false);
  assert.equal(isAudioOnlyMediaPermission("display-capture", { mediaTypes: ["audio"] }), false);
});
