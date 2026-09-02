import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createRequire } from "node:module";
import { constants, copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import { isMap, parseDocument, type Document } from "yaml";
import { provisionBundledBrowserSkillProfile } from "../../../scripts/provision-dsh-profile.mjs";

const require = createRequire(import.meta.url);
const STARTUP_TIMEOUT_MS = 30_000;
const STOP_TIMEOUT_MS = 5_000;
const MAX_DIAGNOSTIC_LINES = 20;
const STARTUP_RETRY_DELAY_MS = 500;
const DSH_URL_PATTERN = /^dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/?$)/;
export const WELCOME_NOTICE_VERSION = "2026-08-13.1";
const DSH_CREDENTIALS_FILENAME = ".credentials.yaml";

export interface LegacyDshCredentialMigrationResult {
  migratedFrom?: string;
  warnings: string[];
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
  startupTimeoutMs?: number;
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
): Promise<string> {
  try {
    return await runtime.start();
  } catch (error) {
    if (!isTransientStartupExit(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    try {
      return await runtime.start();
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : String(retryError);
      throw new Error(`Official DSH failed after one automatic retry.\n${message}`, { cause: retryError });
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
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (closed: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve(closed);
    };
    const timeout = setTimeout(() => finish(false), timeoutMs);
    child.once("close", () => finish(true));
  });
}

async function terminateWindowsProcessTree(pid: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const taskkill = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
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

function readSettingsDocument(settingsPath: string): Document {
  const source = existsSync(settingsPath) ? readFileSync(settingsPath, "utf8") : "{}\n";
  const document = parseDocument(source);
  if (document.errors.length > 0) {
    throw new Error(`Official DSH settings are invalid: ${settingsPath}\n${document.errors[0].message}`);
  }
  if (document.contents !== null && !isMap(document.contents)) {
    throw new Error(`Official DSH settings must contain a YAML mapping: ${settingsPath}`);
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
    if (this.child) throw new Error("Official DSH is already running.");

    this.validatePaths();
    acknowledgeOfficialDshWelcomeNotice(this.options.dshHome);
    if (this.options.bundledBrowserSkillPackageDir) {
      provisionBundledBrowserSkillProfile({
        dshHome: this.options.dshHome,
        profileName: "web",
        bundledPackageDir: this.options.bundledBrowserSkillPackageDir,
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
      env: {
        ...process.env,
        ...this.options.environment,
        DSH_HOME: this.options.dshHome,
        DSH_CWD: this.options.workspace,
      },
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
        const trimmed = line.trim();
        if (!trimmed) return;
        diagnostics.push(trimmed);
        if (diagnostics.length > MAX_DIAGNOSTIC_LINES) diagnostics.shift();
        this.options.onLog?.(trimmed);
      };

      const diagnosticText = () => diagnostics.length > 0
        ? `\nDSH output:\n${diagnostics.join("\n")}`
        : "";

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        const error = new Error(`Official DSH did not publish its loopback URL within ${this.options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS}ms.${diagnosticText()}`);
        void this.stop().then(() => reject(error), () => reject(error));
      }, this.options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS);

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(new Error(`${error.message}${diagnosticText()}`, { cause: error }));
      };
      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        remember(trimmed);
        const match = trimmed.match(DSH_URL_PATTERN);
        if (!match || settled) return;
        settled = true;
        ready = true;
        clearTimeout(timeout);
        this.runtimeUrl = match[1];
        resolve(this.runtimeUrl);
      };

      child.stdout.setEncoding("utf8");
      child.stdout.on("data", (chunk: string) => {
        stdoutBuffer += chunk;
        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk: string) => {
        stderrBuffer += chunk;
        const lines = stderrBuffer.split(/\r?\n/);
        stderrBuffer = lines.pop() ?? "";
        for (const line of lines) handleLine(line);
      });
      child.once("error", (error) => fail(error));
      child.once("close", (code, signal) => {
        handleLine(stdoutBuffer);
        handleLine(stderrBuffer);
        this.child = null;
        this.runtimeUrl = "";
        if (!settled) fail(new Error(`Official DSH exited before startup: code=${code} signal=${signal}`));
        else if (ready) this.options.onExit?.(code, signal);
      });
    });
  }

  private validatePaths(): void {
    const { dshBin, dshHome, patchFile, workspace } = this.options;
    if (!existsSync(dshBin)) throw new Error(`Official DSH launcher is missing: ${dshBin}`);
    if (!existsSync(patchFile)) throw new Error(`Official DSH profile patch is missing: ${patchFile}`);
    if (!existsSync(workspace) || !statSync(workspace).isDirectory()) {
      throw new Error(`Official DSH workspace is unavailable: ${workspace}`);
    }
    try {
      mkdirSync(dshHome, { recursive: true });
    } catch (error) {
      throw new Error(`Official DSH home is unavailable: ${dshHome}`, { cause: error });
    }
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = null;
    this.runtimeUrl = "";

    if (process.platform === "win32" && child.pid) {
      // Windows signals only target the direct child. Kill the complete tree
      // so the bundled node-runtime process cannot keep the installer locked.
      await terminateWindowsProcessTree(child.pid);
      if (!(await waitForChildClose(child, STOP_TIMEOUT_MS))) child.kill("SIGKILL");
      return;
    }

    await new Promise<void>((resolve) => {
      if ((child.exitCode !== null || child.signalCode !== null)
        && child.stdout.closed && child.stderr.closed) {
        resolve();
        return;
      }
      const forceStop = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
      child.once("close", () => {
        clearTimeout(forceStop);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }
}
