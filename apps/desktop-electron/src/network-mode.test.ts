import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DEFAULT_NETWORK_MODE,
  isNetworkMode,
  networkPolicyEnvironment,
  readNetworkMode,
  writeNetworkMode,
} from "./network-mode.ts";

test("defaults to intranet mode and rejects invalid persisted values", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "anyong-network-mode-"));
  try {
    const filePath = path.join(root, "network-policy.json");
    assert.equal(readNetworkMode(filePath), DEFAULT_NETWORK_MODE);
    writeFileSync(filePath, JSON.stringify({ mode: "invalid" }));
    assert.equal(readNetworkMode(filePath), DEFAULT_NETWORK_MODE);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("persists only supported network modes", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "anyong-network-mode-"));
  try {
    const filePath = path.join(root, "nested", "network-policy.json");
    assert.equal(isNetworkMode("intranet"), true);
    assert.equal(isNetworkMode("external"), true);
    assert.equal(isNetworkMode("public"), false);
    writeNetworkMode(filePath, "external");
    assert.equal(readNetworkMode(filePath), "external");
    assert.match(readFileSync(filePath, "utf8"), /"mode": "external"/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("passes the selected mode and policy path to child processes", () => {
  const environment = networkPolicyEnvironment("C:\\Program Files\\Anyong\\network-policy.mjs", "intranet");
  assert.deepEqual(environment, {
    ANYONG_NETWORK_MODE: "intranet",
    ANYONG_NETWORK_POLICY_PATH: "C:\\Program Files\\Anyong\\network-policy.mjs",
    ALL_PROXY: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
    all_proxy: "",
    http_proxy: "",
    https_proxy: "",
  });
});
