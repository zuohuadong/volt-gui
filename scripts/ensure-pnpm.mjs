import { execFileSync } from "node:child_process";

const required = "12.1.0";
const userAgent = process.env.npm_config_user_agent || "";
const detected = userAgent.match(/pnpm\/(\d+\.\d+\.\d+)/)?.[1] || detectFromPath();

if (detected !== required) {
  console.error(`This repository requires pnpm ${required}; detected ${detected || "unknown"}.`);
  console.error("Run `corepack enable` and `corepack prepare pnpm@12.1.0 --activate`, then retry.");
  process.exit(1);
}

function detectFromPath() {
  try {
    return execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["--version"], { encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}
