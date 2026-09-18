import { spawn, type ChildProcessByStdio } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { isMap, parseDocument, type Document } from "yaml";
import { provisionBundledBrowserSkillProfile } from "../../../scripts/provision-dsh-profile.mjs";
import { ensureOfficeCliBinary, officeCliEntryFromEnvironment } from "../../../scripts/third-party-office-tools.mjs";
import type { DshRemoteClient } from "./dsh-remote-client.js";
import { DesktopErrorCode, desktopError, desktopErrorMessage } from "./desktop-error.ts";

const require = createRequire(import.meta.url);
export const STARTUP_TIMEOUT_MS = 240_000;
const STOP_TIMEOUT_MS = 5_000;
const MAX_DIAGNOSTIC_LINES = 20;
const STARTUP_RETRY_DELAY_MS = 500;
const DSH_URL_PATTERN = /(?:^|\s)dsh\s+web:\s+(http:\/\/127\.0\.0\.1:\d+\/\?token=[A-Za-z0-9_-]{43})(?=\s|$)/iu;
export const WELCOME_NOTICE_VERSION = "2026-08-13.1";
const DSH_CREDENTIALS_FILENAME = ".credentials.yaml";
const BUNDLED_MODEL_CREDENTIAL_REF = "XG_GOMODEL_API_KEY";

export function extractTrustedDshUrl(value: string): string | undefined {
  const normalized = value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "");
  const candidate = normalized.match(DSH_URL_PATTERN)?.[1];
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" || url.hostname !== "127.0.0.1" || url.pathname !== "/" || url.hash) return undefined;
    if (url.searchParams.getAll("token").length !== 1 || [...url.searchParams.keys()].some((key) => key !== "token")) return undefined;
    return url.href;
  } catch {
    return undefined;
  }
}

function redactDshStartupSecrets(value: string): string {
  return value.replace(/([?&]token=)[A-Za-z0-9_-]+/gu, "$1[redacted]");
}

export interface LegacyDshCredentialMigrationResult {
  migratedFrom?: string;
  warnings: string[];
}

export interface BundledDshCredentialProvisionResult {
  provisioned: boolean;
  skipped: boolean;
  reason: "missing-bundle" | "already-configured" | "provisioned";
}

function parseBundledEnv(source: string): Readonly<Record<string, string>> {
  const values: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (key && value) values[key] = value;
  }
  return values;
}

const INHERITED_OEM_ENDPOINT_ENV = /^(?:XG_GOMODEL_ENDPOINT|XG_MODEL_BASE_URL|XIGU_MODEL_BASE_URL|VOLT_MODEL_BASE_URL|volt_MODEL_BASE_URL)$/;
const INHERITED_SECRET_ENV = /(?:api[_-]?key|access[_-]?token|(?:^|_)(?:secret|token)$)/i;

export function isInheritedCredentialEnv(name: string): boolean {
  return INHERITED_SECRET_ENV.test(name) || INHERITED_OEM_ENDPOINT_ENV.test(name);
}

export function officialDshChildEnvironment(
  processEnv: NodeJS.ProcessEnv,
  overrides: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(processEnv)) {
    if (value === undefined || isInheritedCredentialEnv(key)) continue;
    env[key] = value;
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    env[key] = value;
  }
  for (const key of Object.keys(env)) {
    if (INHERITED_SECRET_ENV.test(key)) delete env[key];
  }
  env.XG_GOMODEL_API_KEY = "";
  return env;
}

export function bundledDshModelEnvironment(bundledEnvPath: string): Record<string, string> {
  if (!existsSync(bundledEnvPath)) return { XG_MODEL_BASE_URL: "" };
  const values = parseBundledEnv(readFileSync(bundledEnvPath, "utf8"));
  const endpoint = values.XG_MODEL_BASE_URL;
  if (!endpoint) return { XG_MODEL_BASE_URL: "" };
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw desktopError(DesktopErrorCode.BUNDLED_ENDPOINT_INVALID, "内置模型网关地址无效");
  }
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw desktopError(DesktopErrorCode.BUNDLED_ENDPOINT_INVALID, "内置模型网关地址必须是不含凭据、查询参数或片段的 HTTP(S) URL");
  }
  return { XG_MODEL_BASE_URL: endpoint.replace(/\/+$/u, "") };
}

async function dshCredentialRequest(
  dsh: string | Pick<DshRemoteClient, "call">,
  method: "credentials.describe" | "credentials.set",
  payload: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  if (typeof dsh !== "string") {
    return dsh.call(method.replace(".", "/"), payload as Record<string, unknown>, signal);
  }
  const response = await fetch(`${dsh}/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "client-request", rpcId: randomUUID(), method, payload }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw desktopError(DesktopErrorCode.CREDENTIAL_PROVISION_FAILED, `DSH credential request failed (HTTP ${response.status})`);
  const body = await response.json() as { result?: { ok?: boolean; value?: unknown; error?: { message?: string } } };
  if (body.result?.ok !== true) throw desktopError(DesktopErrorCode.CREDENTIAL_PROVISION_FAILED, body.result?.error?.message || "DSH credential request failed");
  return body.result.value;
}

export async function provisionBundledDshCredential(
  dshUrl: string | Pick<DshRemoteClient, "call">,
  bundledEnvPath: string,
  signal?: AbortSignal,
): Promise<BundledDshCredentialProvisionResult> {
  signal?.throwIfAborted();
  if (!existsSync(bundledEnvPath)) {
    return { provisioned: false, skipped: true, reason: "missing-bundle" };
  }
  const values = parseBundledEnv(readFileSync(bundledEnvPath, "utf8"));
  const value = values[BUNDLED_MODEL_CREDENTIAL_REF]?.trim();
  if (!value || /[\r\n]/u.test(value)) {
    throw desktopError(DesktopErrorCode.BUNDLED_CREDENTIAL_INVALID, `内置模型凭据 sidecar 无效：缺少 ${BUNDLED_MODEL_CREDENTIAL_REF}`);
  }

  const described = await dshCredentialRequest(dshUrl, "credentials.describe", {
    refs: [BUNDLED_MODEL_CREDENTIAL_REF],
  }, signal) as { credentials?: Record<string, { configured?: boolean; source?: string }> } | Record<string, { configured?: boolean; source?: string }>;
  const nestedCredentials = (described as { credentials?: unknown }).credentials;
  const credentials = nestedCredentials && typeof nestedCredentials === "object" && !Array.isArray(nestedCredentials)
    ? nestedCredentials as Record<string, { configured?: boolean; source?: string }>
    : described as Record<string, { configured?: boolean; source?: string }>;
  const credential = credentials[BUNDLED_MODEL_CREDENTIAL_REF];
  // 用户通过设置保存的凭据优先；项目/用户 .env 只是回退来源，不能挡住内置凭据导入。
  if (credential?.configured === true && credential.source !== "project-env" && credential.source !== "user-env") {
    if (credential.source === "env") {
      throw desktopError(DesktopErrorCode.BUNDLED_CREDENTIAL_OVERRIDDEN, "内置模型凭据被启动环境覆盖，请清除同名环境变量后重启");
    }
    return { provisioned: false, skipped: true, reason: "already-configured" };
  }

  await dshCredentialRequest(dshUrl, "credentials.set", {
    ref: BUNDLED_MODEL_CREDENTIAL_REF,
    value,
  }, signal);
  return { provisioned: true, skipped: false, reason: "provisioned" };
}

export interface OfficialDshRuntimeOptions {
  dshBin: string;
  dshHome: string;
  patchFile: string;
  workspace: string;
  executable?: string;
  executableArgs?: string[];
  environment?: Readonly<Record<string, string>>;
  bundledBrowserSkillPackageDir?: string;
  bundledProfilePlugins?: ReadonlyArray<{ packageName: string; packageDir: string }>;
  startupTimeoutMs?: number;
  signal?: AbortSignal;
  onLog?: (line: string) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

function isTransientStartupExit(error: unknown): error is Error {
  return error instanceof Error
    && (/Official DSH exited before startup: code=1 signal=null/.test(error.message)
      || /Official DSH did not publish its loopback URL within \d+ms/.test(error.message));
}

export async function startOfficialDshWithRetry(
  runtime: { start(): Promise<string> },
  retryDelayMs = STARTUP_RETRY_DELAY_MS,
  signal?: AbortSignal,
): Promise<string> {
  signal?.throwIfAborted();
  try {
    return await runtime.start();
  } catch (error) {
    signal?.throwIfAborted();
    if (!isTransientStartupExit(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    signal?.throwIfAborted();
    try {
      return await runtime.start();
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : String(retryError);
      throw desktopError(DesktopErrorCode.DSH_STARTUP_FAILED, `Official DSH failed after one automatic retry.\n${message}`, { cause: retryError });
    }
  }
}

export function rethrowUnlessBrokenPipe(error: NodeJS.ErrnoException): void {
  if (error.code !== "EPIPE") throw error;
}

export function migrateLegacyDshCredentials(
  targetDshHome: string,
  legacyDshHomes: readonly string[],
): LegacyDshCredentialMigrationResult {
  const targetPath = path.join(targetDshHome, DSH_CREDENTIALS_FILENAME);
  const warnings: string[] = [];
  if (existsSync(targetPath)) return { warnings };

  for (const legacyDshHome of legacyDshHomes) {
    const sourcePath = path.join(legacyDshHome, DSH_CREDENTIALS_FILENAME);
    if (path.resolve(sourcePath) === path.resolve(targetPath) || !existsSync(sourcePath)) continue;
    try {
      if (!statSync(sourcePath).isFile()) continue;
      mkdirSync(targetDshHome, { recursive: true });
      copyFileSync(sourcePath, targetPath, constants.COPYFILE_EXCL);
      return { migratedFrom: sourcePath, warnings };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") return { warnings };
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`无法从旧 DSH Home 迁移凭据 ${sourcePath}: ${message}`);
    }
  }

  return { warnings };
}

function waitForChildClose(child: ChildProcessByStdio<null, Readable, Readable>, timeoutMs: number): Promise<boolean> {
  if ((child.exitCode !== null || child.signalCode !== null) && child.stdout.closed && child.stderr.closed) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (closed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      child.off("close", onClose);
      resolve(closed);
    };
    const onClose = () => finish(true);
    const timeout = setTimeout(() => finish(false), timeoutMs);
    child.once("close", onClose);
  });
}

async function terminateWindowsProcessTree(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const taskkill = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
      timeout: STOP_TIMEOUT_MS,
    });
    taskkill.once("error", () => resolve());
    taskkill.once("close", () => resolve());
  });
}

export function resolveOfficialDshBin(resourcesPath?: string): string {
  if (resourcesPath) {
    return path.join(resourcesPath, "dsh-runtime", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  }
  const packageJson = require.resolve("@deepseek-ai/dsh/package.json");
  return path.join(path.dirname(packageJson), "lib", "bin.js");
}

export function resolveOfficialDshVersion(resourcesPath?: string): string {
  const packagePath = path.resolve(path.dirname(resolveOfficialDshBin(resourcesPath)), "..", "package.json");
  const manifest = JSON.parse(readFileSync(packagePath, "utf8")) as { version?: unknown };
  if (typeof manifest.version !== "string" || !manifest.version.trim()) {
    throw desktopError(DesktopErrorCode.DSH_STARTUP_FAILED, `Official DSH package version is invalid: ${packagePath}`);
  }
  return manifest.version;
}

function readSettingsDocument(settingsPath: string): Document {
  const source = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : "{}\n";
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    throw desktopError(DesktopErrorCode.DSH_STARTUP_FAILED, `Official DSH settings are invalid: ${settingsPath}\n${document.errors[0].message}`);
  }
  if (document.contents !== null && !isMap(document.contents)) {
    throw desktopError(DesktopErrorCode.DSH_STARTUP_FAILED, `Official DSH settings must contain a YAML mapping: ${settingsPath}`);
  }
  return document;
}

function writeSettingsDocument(settingsPath: string, document: Document): void {
  const temporaryPath = `${settingsPath}.${process.pid}.${Date.now()}.tmp`;
  try {
    writeFileSync(temporaryPath, document.toString(), { encoding: "utf8", flag: "wx", mode: 0o600 });
    renameSync(temporaryPath, settingsPath);
  } finally {
    rmSync(temporaryPath, { force: true });
  }
}

export function acknowledgeOfficialDshWelcomeNotice(dshHome: string): void {
  mkdirSync(dshHome, { recursive: true });
  const settingsPath = path.join(dshHome, "settings.yaml");
  const document = readSettingsDocument(settingsPath);

  const currentVersion = document.getIn(["ui-onboarding", "welcomeNoticeVersion"]);
  if (currentVersion === WELCOME_NOTICE_VERSION) return;

  document.setIn(["ui-onboarding", "welcomeNoticeVersion"], WELCOME_NOTICE_VERSION);
  writeSettingsDocument(settingsPath, document);
}

export class OfficialDshRuntime {
  private child: ChildProcessByStdio<null, Readable, Readable> | null = null;
  private runtimeUrl = "";
  private readonly options: OfficialDshRuntimeOptions;

  constructor(options: OfficialDshRuntimeOptions) {
    this.options = options;
  }

  get url(): string {
    return this.runtimeUrl;
  }

  async start(): Promise<string> {
    this.options.signal?.throwIfAborted();
    if (this.child) throw desktopError(DesktopErrorCode.DSH_STARTUP_FAILED, "Official DSH is already running.");

    this.validatePaths();
    const officeCliEntry = officeCliEntryFromEnvironment(this.options.environment);
    if (officeCliEntry) await ensureOfficeCliBinary(officeCliEntry);
    this.options.signal?.throwIfAborted();
    acknowledgeOfficialDshWelcomeNotice(this.options.dshHome);
    if (this.options.bundledBrowserSkillPackageDir) {
      provisionBundledBrowserSkillProfile({
        dshHome: this.options.dshHome,
        profileName: "web",
        bundledPackageDir: this.options.bundledBrowserSkillPackageDir,
        additionalPlugins: this.options.bundledProfilePlugins,
      });
    }

    const executable = this.options.executable || process.execPath;
    const child = spawn(executable, [
      ...(this.options.executableArgs ?? []),
      this.options.dshBin,
      "web",
      "--patch",
      this.options.patchFile,
      "--host",
      "127.0.0.1",
      "--port",
      "0",
      "--no-open",
    ], {
      cwd: this.options.workspace,
      env: officialDshChildEnvironment(process.env, {
        ...this.options.environment,
        DSH_HOME: this.options.dshHome,
        DSH_CWD: this.options.workspace,
      }),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;

    return new Promise<string>((resolve, reject) => {
      let stdoutBuffer = "";
      let stderrBuffer = "";
      const diagnostics: string[] = [];
      let settled = false;
      let ready = false;

      const remember = (line: string) => {
        const trimmed = redactDshStartupSecrets(line.trim());
        if (!trimmed) return;
        diagnostics.push(trimmed);
        if (diagnostics.length > MAX_DIAGNOSTIC_LINES) diagnostics.shift();
        this.options.onLog?.(trimmed);
      };

      const diagnosticText = () => {
        const unterminated = [stdoutBuffer, stderrBuffer]
          .flatMap((buffer) => buffer.split(/\r?\n/u))
          .map((line) => redactDshStartupSecrets(line.trim()))
          .filter(Boolean);
        const output = [...diagnostics, ...unterminated];
        return output.length > 0 ? `\nDSH output:\n${output.slice(-MAX_DIAGNOSTIC_LINES).join("\n")}` : "";
      };

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.options.signal?.removeEventListener("abort", onAbort);
        const error = desktopError(DesktopErrorCode.DSH_STARTUP_FAILED, `Official DSH did not publish its loopback URL within ${this.options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS}ms.${diagnosticText()}`);
        void this.stop().then(() => reject(error), () => reject(error));
      }, this.options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS);

      const onAbort = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.options.signal?.removeEventListener("abort", onAbort);
        const error = this.options.signal?.reason ?? desktopError(DesktopErrorCode.DSH_STOPPED, "官方 DSH 启动已取消");
        void this.stop().then(() => reject(error), reject);
      };
      this.options.signal?.addEventListener("abort", onAbort, { once: true });

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this.options.signal?.removeEventListener("abort", onAbort);
        const message = error.message.startsWith("VOLT_")
          ? error.message
          : desktopErrorMessage(DesktopErrorCode.DSH_STARTUP_FAILED, error.message);
        reject(new Error(`${message}${diagnosticText()}`, { cause: error }));
      };
      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        remember(trimmed);
        const runtimeUrl = extractTrustedDshUrl(trimmed);
        if (!runtimeUrl || settled) return;
        settled = true;
        ready = true;
        clearTimeout(timeout);
        this.options.signal?.removeEventListener("abort", onAbort);
        this.runtimeUrl = runtimeUrl;
        resolve(this.runtimeUrl);
      };

      const settleReady = (runtimeUrl: string): boolean => {
        if (!runtimeUrl || settled) return false;
        settled = true;
        ready = true;
        clearTimeout(timeout);
        this.options.signal?.removeEventListener("abort", onAbort);
        this.runtimeUrl = runtimeUrl;
        resolve(this.runtimeUrl);
        return true;
      };

      const inspectChunk = (chunk: string) => settleReady(extractTrustedDshUrl(chunk) || "");

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        if (inspectChunk(chunk)) return;
        stdoutBuffer += chunk;
        if (settleReady(extractTrustedDshUrl(stdoutBuffer) || "")) return;
        const lines = stdoutBuffer.split(/[\r\n]+/u);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        if (inspectChunk(chunk)) return;
        stderrBuffer += chunk;
        if (settleReady(extractTrustedDshUrl(stderrBuffer) || "")) return;
        const lines = stderrBuffer.split(/[\r\n]+/u);
        stderrBuffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      });
      child.once("error", (error) => fail(error));
      child.once("close", (code, signal) => {
        handleLine(stdoutBuffer);
        handleLine(stderrBuffer);
        // 旧进程的 close 可能晚于重试启动，不能清除新进程的所有权。
        if (this.child === child) {
          this.child = null;
          this.runtimeUrl = "";
        }
        if (!settled) fail(desktopError(DesktopErrorCode.DSH_STARTUP_FAILED, `Official DSH exited before startup: code=${code} signal=${signal}`));
        else if (ready) this.options.onExit?.(code, signal);
      });
      if (this.options.signal?.aborted) onAbort();
    });
  }

  private validatePaths(): void {
    const { dshBin, dshHome, patchFile, workspace } = this.options;
    if (!existsSync(dshBin)) throw desktopError(DesktopErrorCode.DSH_STARTUP_FAILED, `Official DSH launcher is missing: ${dshBin}`);
    if (!existsSync(patchFile)) throw desktopError(DesktopErrorCode.DSH_STARTUP_FAILED, `Official DSH profile patch is missing: ${patchFile}`);
    if (!existsSync(workspace) || !statSync(workspace).isDirectory()) {
      throw desktopError(DesktopErrorCode.DSH_STARTUP_FAILED, `Official DSH workspace is unavailable: ${workspace}`);
    }
    try {
      mkdirSync(dshHome, { recursive: true });
    } catch (error) {
      throw desktopError(DesktopErrorCode.DSH_STARTUP_FAILED, `Official DSH home is unavailable: ${dshHome}`, { cause: error });
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.runtimeUrl = "";

    if (process.platform === "win32" && child.pid) {
      // Windows signals only target the direct child. Kill the complete tree
      // so the bundled node-runtime process cannot keep the installer locked.
      await terminateWindowsProcessTree(child.pid);
      if (!(await waitForChildClose(child, STOP_TIMEOUT_MS))) {
        child.kill("SIGKILL");
        if (!(await waitForChildClose(child, STOP_TIMEOUT_MS))) {
          throw desktopError(DesktopErrorCode.DSH_STOPPED, "Official DSH could not be stopped; refusing to start an overlapping runtime.");
        }
      }
      if (this.child === child) this.child = null;
      return;
    }

    child.kill("SIGTERM");
    if (!(await waitForChildClose(child, STOP_TIMEOUT_MS))) {
      child.kill("SIGKILL");
      if (!(await waitForChildClose(child, STOP_TIMEOUT_MS))) {
        throw desktopError(DesktopErrorCode.DSH_STOPPED, "Official DSH could not be stopped; refusing to start an overlapping runtime.");
      }
    }
    if (this.child === child) this.child = null;
  }
}
