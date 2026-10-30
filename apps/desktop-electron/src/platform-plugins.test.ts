import assert from "node:assert/strict";
import test from "node:test";

import { isPlatformProfilePlugin, platformProfilePluginNames, WINDOWS_ONLY_PLUGIN } from "./platform-plugins.ts";

test("Windows includes the Windows-only OCR plugin", () => {
  assert.deepEqual([...platformProfilePluginNames("win32")], [WINDOWS_ONLY_PLUGIN]);
  assert.equal(isPlatformProfilePlugin(WINDOWS_ONLY_PLUGIN, "win32"), true);
});

test("non-Windows platforms do not include Windows-only plugins", () => {
  for (const platform of ["linux", "darwin"]) {
    assert.deepEqual([...platformProfilePluginNames(platform)], []);
    assert.equal(isPlatformProfilePlugin(WINDOWS_ONLY_PLUGIN, platform), false);
  }
});
