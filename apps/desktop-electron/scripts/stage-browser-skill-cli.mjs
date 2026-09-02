import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { browserSkillCli } from "../../../scripts/third-party-browser-tools.mjs";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetDir = path.join(appDir, ".browser-skill-runtime");
const assetKey = `${process.platform}-${process.arch}`;
const asset = browserSkillCli.assets[assetKey];
const binaryName = process.platform === "win32" ? "bsk.exe" : "bsk";
const targetBinary = path.join(targetDir, binaryName);

function sha256(file) {
  return createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function resetTarget() {
  if (path.dirname(targetDir) !== appDir) throw new Error(`Refusing to reset unexpected BrowserSkill target: ${targetDir}`);
  fs.rmSync(targetDir, { recursive: true, force: true });
  fs.mkdirSync(targetDir, { recursive: true });
}

function verifyStagedBinary() {
  if (process.platform !== "win32") fs.chmodSync(targetBinary, 0o755);
  const version = spawnSync(targetBinary, ["--version"], { encoding: "utf8", windowsHide: true });
  if (version.error) throw version.error;
  if (version.status !== 0 || version.stdout.trim() !== `bsk ${browserSkillCli.version}`) {
    throw new Error(`BrowserSkill CLI version check failed: ${version.stdout}${version.stderr}`);
  }
}

export async function stageBrowserSkillCli() {
  if (!asset) throw new Error(`BrowserSkill CLI has no audited asset for ${assetKey}`);
  if (fs.existsSync(targetBinary) && (!asset.binarySha256 || sha256(targetBinary) === asset.binarySha256)) {
    verifyStagedBinary();
    return targetBinary;
  }

  resetTarget();
  const explicitSource = process.env.BSK_PATH?.trim();
  if (explicitSource && fs.existsSync(explicitSource)) {
    fs.copyFileSync(explicitSource, targetBinary);
    if (asset.binarySha256 && sha256(targetBinary) !== asset.binarySha256) {
      throw new Error(`Explicit BSK_PATH does not match audited BrowserSkill CLI ${browserSkillCli.version}`);
    }
    verifyStagedBinary();
    console.log(`Staged BrowserSkill CLI ${browserSkillCli.version} from BSK_PATH.`);
    return targetBinary;
  }
  const archivePath = path.join(targetDir, asset.name);
  let lastError;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${browserSkillCli.releaseUrl}/${asset.name}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      fs.writeFileSync(archivePath, Buffer.from(await response.arrayBuffer()), { flag: "wx" });
      lastError = undefined;
      break;
    } catch (error) {
      lastError = error;
      fs.rmSync(archivePath, { force: true });
      await new Promise((resolve) => setTimeout(resolve, attempt * 1_000));
    }
  }
  if (lastError) throw new Error(`BrowserSkill CLI download failed after retries: ${String(lastError)}`);
  const archiveHash = sha256(archivePath);
  if (archiveHash !== asset.sha256) {
    throw new Error(`BrowserSkill CLI archive checksum mismatch: ${archiveHash}`);
  }

  const extracted = spawnSync("tar", ["-xf", archivePath, "-C", targetDir], {
    cwd: appDir,
    encoding: "utf8",
    windowsHide: true,
  });
  if (extracted.error) throw extracted.error;
  if (extracted.status !== 0) throw new Error(`BrowserSkill CLI extraction failed: ${extracted.stderr}`);
  fs.rmSync(archivePath, { force: true });

  if (!fs.existsSync(targetBinary)) throw new Error(`BrowserSkill CLI archive did not contain bsk.exe`);
  const binaryHash = sha256(targetBinary);
  if (asset.binarySha256 && binaryHash !== asset.binarySha256) {
    throw new Error(`BrowserSkill CLI binary checksum mismatch: ${binaryHash}`);
  }
  verifyStagedBinary();
  console.log(`Staged BrowserSkill CLI ${browserSkillCli.version}.`);
  return targetBinary;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await stageBrowserSkillCli();
}
