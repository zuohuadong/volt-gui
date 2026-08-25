import { spawn, type ChildProcessByStdio } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import type { Readable } from "node:stream";

const require = createRequire(import.meta.url);
const STARTUP_TIMEOUT_MS = 180_000;
const STOP_TIMEOUT_MS = 5_000;
const DSH_URL_PATTERN = /^dsh web:\s+(http:\/\/127\.0\.0\.1:\d+\/?$)/;

export interface OfficialDshRuntimeOptions {
  dshBin: string;
  dshHome: string;
  patchFile: string;
  workspace: string;
  executable?: string;
  executableArgs?: string[];
  startupTimeoutMs?: number;
  onLog?: (line: string) => void;
  onExit?: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export function resolveOfficialDshBin(resourcesPath?: string): string {
  if (resourcesPath) {
    return path.join(resourcesPath, "dsh-runtime", "node_modules", "@deepseek-ai", "dsh", "lib", "bin.js");
  }
  const packageJson = require.resolve("@deepseek-ai/dsh/package.json");
  return path.join(path.dirname(packageJson), "lib", "bin.js");
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
        DSH_HOME: this.options.dshHome,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child = child;

    return new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Official DSH did not publish its loopback URL within ${this.options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS}ms.`));
        void this.stop();
      }, this.options.startupTimeoutMs ?? STARTUP_TIMEOUT_MS);
      let stdoutBuffer = "";
      let settled = false;

      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      };
      const handleLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        this.options.onLog?.(trimmed);
        const match = trimmed.match(DSH_URL_PATTERN);
        if (!match || settled) return;
        settled = true;
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
        for (const line of chunk.split(/\r?\n/)) handleLine(line);
      });
      child.once("error", (error) => fail(error));
      child.once("exit", (code, signal) => {
        this.child = null;
        this.runtimeUrl = "";
        if (!settled) fail(new Error(`Official DSH exited before startup: code=${code} signal=${signal}`));
        else this.options.onExit?.(code, signal);
      });
    });
  }

  async stop(): Promise<void> {
    const child = this.child;
    if (!child) return;
    this.child = null;
    this.runtimeUrl = "";

    await new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) {
        resolve();
        return;
      }
      const forceStop = setTimeout(() => child.kill("SIGKILL"), STOP_TIMEOUT_MS);
      child.once("exit", () => {
        clearTimeout(forceStop);
        resolve();
      });
      child.kill("SIGTERM");
    });
  }
}
