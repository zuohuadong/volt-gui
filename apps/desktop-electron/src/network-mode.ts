import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_NETWORK_MODE = "intranet" as const;
export const NETWORK_MODES = ["intranet", "external"] as const;
export type NetworkMode = (typeof NETWORK_MODES)[number];

export function isNetworkMode(value: unknown): value is NetworkMode {
  return value === "intranet" || value === "external";
}

export function readNetworkMode(filePath: string): NetworkMode {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { mode?: unknown };
    return isNetworkMode(parsed.mode) ? parsed.mode : DEFAULT_NETWORK_MODE;
  } catch {
    return DEFAULT_NETWORK_MODE;
  }
}

export function writeNetworkMode(filePath: string, mode: NetworkMode): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify({ mode }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  renameSync(temporaryPath, filePath);
}

export function networkPolicyEnvironment(policyPath: string, mode: NetworkMode): Readonly<NodeJS.ProcessEnv> {
  const environment = {
    ANYONG_NETWORK_MODE: mode,
    ANYONG_NETWORK_POLICY_PATH: policyPath,
  } satisfies Record<string, string>;
  if (mode === "intranet") {
    Object.assign(environment, {
      ALL_PROXY: "",
      HTTP_PROXY: "",
      HTTPS_PROXY: "",
      all_proxy: "",
      http_proxy: "",
      https_proxy: "",
    });
  }
  return environment;
}
