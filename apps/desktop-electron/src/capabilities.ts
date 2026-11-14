import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CAPABILITY_KEYS = [
  "altium",
  "pcb",
  "sentry",
  "report",
  "documentImport",
  "github",
  "cnb",
  "feishu",
  "computerUse",
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];
export type Capabilities = Record<CapabilityKey, boolean>;

export const DEFAULT_CAPABILITIES: Capabilities = Object.freeze({
  altium: false,
  pcb: false,
  sentry: false,
  report: false,
  documentImport: false,
  github: false,
  cnb: false,
  feishu: false,
  computerUse: false,
});

const CAPABILITY_ENVIRONMENT: Readonly<Record<CapabilityKey, string>> = Object.freeze({
  altium: "ANYONG_ALTIUM_ENABLED",
  pcb: "ANYONG_PCB_ENABLED",
  sentry: "ANYONG_SENTRY_ENABLED",
  report: "ANYONG_REPORT_ENABLED",
  documentImport: "ANYONG_DOCUMENT_IMPORT_ENABLED",
  github: "ANYONG_GITHUB_ENABLED",
  cnb: "ANYONG_CNB_ENABLED",
  feishu: "ANYONG_FEISHU_ENABLED",
  computerUse: "ANYONG_COMPUTER_USE_ENABLED",
});

export function isCapabilityKey(value: unknown): value is CapabilityKey {
  return typeof value === "string" && (CAPABILITY_KEYS as readonly string[]).includes(value);
}

function normalize(source: unknown): Capabilities {
  const record = source && typeof source === "object" && !Array.isArray(source)
    ? source as Record<string, unknown>
    : {};
  const result = { ...DEFAULT_CAPABILITIES };
  for (const key of CAPABILITY_KEYS) result[key] = record[key] === true;
  return result;
}

export function readCapabilities(filePath: string): Capabilities {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { capabilities?: unknown };
    return normalize(parsed.capabilities);
  } catch {
    return { ...DEFAULT_CAPABILITIES };
  }
}

export function writeCapabilities(filePath: string, capabilities: Capabilities): void {
  mkdirSync(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  writeFileSync(temporaryPath, `${JSON.stringify({ capabilities: normalize(capabilities) }, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  renameSync(temporaryPath, filePath);
}

export function capabilityEnvironment(capabilities: Capabilities): Readonly<Record<string, string>> {
  const environment: Record<string, string> = {};
  for (const key of CAPABILITY_KEYS) {
    environment[CAPABILITY_ENVIRONMENT[key]] = capabilities[key] ? "1" : "";
  }
  return environment;
}

export function capabilityEnvironmentName(key: CapabilityKey): string {
  return CAPABILITY_ENVIRONMENT[key];
}
