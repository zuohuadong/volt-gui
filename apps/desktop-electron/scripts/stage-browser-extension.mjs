import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sha256, stageBrowserSkillExtension } from "../../../scripts/browser-skill-extension.mjs";
import { browserSkillExtension } from "../../../scripts/third-party-browser-tools.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetDir = path.join(appDir, ".browser-extension-runtime");
const vendorArchive = path.resolve(appDir, "..", "..", browserSkillExtension.vendorPath);
const archiveUrl = `${browserSkillExtension.releaseUrl}/${browserSkillExtension.archive}`;

async function downloadArchive(destination) {
  const failures = [];
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(archiveUrl, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      writeFileSync(destination, Buffer.from(await response.arrayBuffer()));
      const actual = sha256(readFileSync(destination));
      if (actual !== browserSkillExtension.sha256) {
        throw new Error(`BrowserSkill extension checksum mismatch: expected ${browserSkillExtension.sha256}, got ${actual}`);
      }
      return;
    } catch (error) {
      failures.push(String(error));
      rmSync(destination, { force: true });
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  throw new Error(`BrowserSkill extension download failed: ${failures.at(-1)}`);
}

/**
 * 把审计过的浏览器扩展解压到打包目录。
 * 优先使用仓库内 vendor 归档，保证内网/无网络构建也能产出完整安装包。
 */
export async function stageBrowserExtension() {
  mkdirSync(targetDir, { recursive: true });
  let archive = vendorArchive;
  let temporary;
  if (!existsSync(vendorArchive)) {
    temporary = mkdtempSync(path.join(tmpdir(), "bsk-extension-"));
    archive = path.join(temporary, browserSkillExtension.archive);
    await downloadArchive(archive);
  }
  try {
    const result = stageBrowserSkillExtension({
      archive,
      destination: path.join(targetDir, "extension"),
      version: browserSkillExtension.version,
      sha256: browserSkillExtension.sha256,
    });
    console.log(`${result.changed ? "Staged" : "Reused"} BrowserSkill extension ${result.version} at ${result.directory}`);
    return result.directory;
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await stageBrowserExtension();
}