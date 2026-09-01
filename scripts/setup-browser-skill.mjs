#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { browserSkill } from "./third-party-browser-tools.mjs";

const require = createRequire(import.meta.url);
const dshPackageJson = require.resolve("@deepseek-ai/dsh/package.json");
const dshBin = path.join(path.dirname(dshPackageJson), "lib", "bin.js");
const mode = process.argv[2] || "check";
const bskCommand = process.env.BSK_PATH || "bsk";
const dshHome = process.env.DSH_HOME?.trim()
  || (process.platform === "win32" && process.env.APPDATA
    ? path.join(process.env.APPDATA, "Anyong", "dsh")
    : undefined);

function run(command, args, options = {}) {
  try {
    return execFileSync(command, args, {
      stdio: "inherit",
      encoding: "utf8",
      windowsHide: true,
      env: dshHome ? { ...process.env, DSH_HOME: dshHome } : process.env,
      ...options,
    });
  } catch (error) {
    if (error?.code === "ENOENT" && command === bskCommand) {
      throw new Error("BrowserSkill CLI `bsk` is not available. Install it first or set BSK_PATH.", { cause: error });
    }
    throw error;
  }
}

function runDsh(args, options = {}) {
  return run(process.execPath, [dshBin, ...args], options);
}

if (mode === "install") {
  run(bskCommand, ["--version"]);
  console.log(`Installing ${browserSkill.packageName}@${browserSkill.version} into the official DSH web profile...`);
  runDsh(["plugin", "--profile", "web", "add", `${browserSkill.packageName}@${browserSkill.version}`]);
  console.log("Installed. Run `pnpm run check:browser-skill` to verify the profile and local bsk daemon.");
} else if (mode === "check") {
  console.log(`Checking ${browserSkill.packageName}@${browserSkill.version}...`);
  run(bskCommand, ["--version"]);
  const pluginList = JSON.parse(runDsh(["plugin", "--profile", "web", "list", "--depth=0", "--json"], { stdio: "pipe" }));
  const webProfile = Array.isArray(pluginList)
    ? pluginList.find((entry) => entry?.name === "dsh-profile-web")
    : undefined;
  const installedVersion = webProfile?.dependencies?.[browserSkill.packageName]?.version;
  if (installedVersion !== browserSkill.version) {
    throw new Error(`Expected ${browserSkill.packageName}@${browserSkill.version}, got ${JSON.stringify(installedVersion)}.`);
  }
  const config = runDsh(["--profile", "web", "--dump-config"], { stdio: "pipe" });
  if (!config.includes(browserSkill.packageName)) {
    throw new Error("BrowserSkill is not active in the official DSH web profile. Run `pnpm run setup:browser-skill` first.");
  }
  console.log(`[ok] official DSH web profile contains BrowserSkill ${installedVersion}`);
  console.log("[ok] bsk CLI is available; browser extension connectivity is checked separately by `pnpm run doctor:browser-skill`");
} else if (mode === "doctor") {
  run(bskCommand, ["doctor"]);
} else {
  throw new Error(`Unknown mode ${JSON.stringify(mode)}. Use install, check, or doctor.`);
}
