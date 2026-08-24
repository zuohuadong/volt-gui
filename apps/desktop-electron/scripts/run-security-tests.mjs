import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const outputRoot = mkdtempSync(path.join(tmpdir(), "voltui-electron-security-"));
const require = createRequire(import.meta.url);
const tscPath = require.resolve("typescript/bin/tsc");

try {
  execFileSync(process.execPath, [
    tscPath,
    "--project",
    path.join(packageRoot, "tsconfig.json"),
    "--outDir",
    outputRoot,
  ], { cwd: packageRoot, stdio: "inherit" });

  execFileSync(process.execPath, [
    "--test",
    path.join(outputRoot, "tool-permission-broker.test.js"),
    path.join(outputRoot, "persistence.test.js"),
  ], { cwd: packageRoot, stdio: "inherit" });
} finally {
  rmSync(outputRoot, { recursive: true, force: true });
}
