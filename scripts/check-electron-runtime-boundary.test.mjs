import assert from "node:assert/strict";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { scanElectronRuntimeBoundary } from "./check-electron-runtime-boundary.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fixtureFiles = [
  "apps/desktop-electron/src/main.ts",
  "apps/desktop-electron/src/preload.ts",
  "apps/desktop-electron/src/official-dsh-runtime.ts",
  "apps/desktop-electron/package.json",
  "apps/desktop-electron/electron-builder.mjs",
  "scripts/native-executable.mjs",
  "apps/desktop-frontend/src/lib/dsh-client.ts",
];

test("current Electron shell is isolated around the official DSH runtime and local Svelte renderer", async () => {
  assert.deepEqual(await scanElectronRuntimeBoundary(), []);
});

test("gate rejects a local Harness import and a non-loopback DSH URL", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voltui-electron-boundary-"));
  try {
    for (const relativePath of fixtureFiles) {
      const target = path.join(root, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(repositoryRoot, relativePath), target);
    }

    const mainPath = path.join(root, "apps/desktop-electron/src/main.ts");
    const runtimePath = path.join(root, "apps/desktop-electron/src/official-dsh-runtime.ts");
    await writeFile(mainPath, `${await readFile(mainPath, "utf8")}\nimport "@dsh/server";\n`);
    await writeFile(runtimePath, (await readFile(runtimePath, "utf8")).replace(
      "127\\.0\\.0\\.1",
      "0\\.0\\.0\\.0",
    ));

    const rules = new Set((await scanElectronRuntimeBoundary({ root })).map((finding) => finding.rule));
    assert.equal(rules.has("local-harness-import"), true);
    assert.equal(rules.has("loopback-url"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gate rejects renderer DSH methods missing from the Electron allowlist", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voltui-electron-allowlist-"));
  try {
    for (const relativePath of fixtureFiles) {
      const target = path.join(root, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(repositoryRoot, relativePath), target);
    }

    const clientPath = path.join(root, "apps/desktop-frontend/src/lib/dsh-client.ts");
    await writeFile(clientPath, `${await readFile(clientPath, "utf8")}\nthis.request("mcp.enable", {});\n`);

    const rules = new Set((await scanElectronRuntimeBoundary({ root })).map((finding) => finding.rule));
    assert.equal(rules.has("ipc-client-allowlist"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gate rejects unused Electron DSH allowlist methods", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voltui-electron-allowlist-extra-"));
  try {
    for (const relativePath of fixtureFiles) {
      const target = path.join(root, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(repositoryRoot, relativePath), target);
    }

    const mainPath = path.join(root, "apps/desktop-electron/src/main.ts");
    await writeFile(mainPath, (await readFile(mainPath, "utf8")).replace(
      '"settings.update"',
      '"settings.update", "settings.mutate"',
    ));

    const rules = new Set((await scanElectronRuntimeBoundary({ root })).map((finding) => finding.rule));
    assert.equal(rules.has("ipc-allowlist-unused"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("gate rejects IPC handlers that drop stable desktop error codes", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "voltui-electron-desktop-error-"));
  try {
    for (const relativePath of fixtureFiles) {
      const target = path.join(root, relativePath);
      await mkdir(path.dirname(target), { recursive: true });
      await cp(path.join(repositoryRoot, relativePath), target);
    }

    const mainPath = path.join(root, "apps/desktop-electron/src/main.ts");
    await writeFile(mainPath, (await readFile(mainPath, "utf8"))
      .replace(/import \{ DesktopErrorCode, desktopError, desktopErrorMessage \} from "\.\/desktop-error\.ts";\n/, "")
      .replaceAll("throw desktopError(DesktopErrorCode.", "throw new Error("));

    const rules = new Set((await scanElectronRuntimeBoundary({ root })).map((finding) => finding.rule));
    assert.equal(rules.has("desktop-error-import"), true);
    assert.equal(rules.has("desktop-error-throw"), true);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
