import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CAPABILITY_KEYS,
  type Capabilities,
  capabilityEnvironment,
  capabilityEnvironmentName,
  readCapabilities,
  writeCapabilities,
} from "./capabilities.ts";

test("optional capabilities default to disabled", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "anyong-capabilities-"));
  try {
    const file = path.join(directory, "capabilities.json");
    const capabilities = readCapabilities(file);
    for (const key of CAPABILITY_KEYS) assert.equal(capabilities[key], false, key);
    for (const key of CAPABILITY_KEYS) assert.equal(capabilityEnvironment(capabilities)[capabilityEnvironmentName(key)], "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("capabilities round-trip while ignoring unknown keys", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "anyong-capabilities-"));
  try {
    const file = path.join(directory, "capabilities.json");
    writeCapabilities(file, { ...readCapabilities(file), report: true, documentImport: true } satisfies Capabilities);
    const capabilities = readCapabilities(file);
    assert.equal(capabilities.report, true);
    assert.equal(capabilities.documentImport, true);
    assert.equal(capabilities.github, false);
    const stored = JSON.parse(readFileSync(file, "utf8")) as { capabilities: Record<string, unknown> };
    assert.equal(stored.capabilities.notAThing, undefined);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
