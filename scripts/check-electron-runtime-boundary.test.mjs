import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { scanElectronRuntimeBoundary } from "./check-electron-runtime-boundary.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("current Electron renderer is isolated from Wails and mock bridges", async () => {
  assert.deepEqual(await scanElectronRuntimeBoundary(), []);
});

test("gate rejects a legacy renderer bridge and functional fallback", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voltui-electron-boundary-"));
  try {
    const fixtureFiles = [
      "apps/desktop-frontend/electron.html",
      "apps/desktop-frontend/src/electron-main.ts",
      "apps/desktop-frontend/src/components/ElectronWorkbench.svelte",
      "apps/desktop-electron/src/main.ts",
      "apps/desktop-electron/src/runtime-config.ts",
      "apps/desktop-electron/src/preload.ts",
      "apps/desktop-electron/src/workbench.html",
      "apps/desktop-electron/scripts/build-frontend.mjs",
      "packages/dsh-server/src/server.ts",
    ];
    for (const relativePath of fixtureFiles) {
      const target = path.join(root, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(repositoryRoot, relativePath), target);
    }

    const entryPath = path.join(root, "apps/desktop-frontend/src/electron-main.ts");
    const fallbackPath = path.join(root, "apps/desktop-electron/src/workbench.html");
    const runtimeConfigPath = path.join(root, "apps/desktop-electron/src/runtime-config.ts");
    const serverPath = path.join(root, "packages/dsh-server/src/server.ts");
    await writeFile(entryPath, `${await readFile(entryPath, "utf8")}\nwindow.go.main.App.Version();\n`);
    await writeFile(fallbackPath, "<button onclick=\"makeMockApp()\">保存</button>");
    await writeFile(runtimeConfigPath, (await readFile(runtimeConfigPath, "utf8")).replace(
      "currentConfig.apiKey && nextApiKey === undefined && patch.clearApiKey !== true",
      "false",
    ));
    await writeFile(serverPath, `${await readFile(serverPath, "utf8")}\nres.setHeader('Access-Control-Allow-Origin', '*');\n`);

    const rules = new Set((await scanElectronRuntimeBoundary({ root })).map((finding) => finding.rule));
    assert.equal(rules.has("wails-global"), true);
    assert.equal(rules.has("fallback-button"), true);
    assert.equal(rules.has("fallback-mock"), true);
    assert.equal(rules.has("wildcard-local-cors"), true);
    assert.equal(rules.has("endpoint-key-reuse"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
