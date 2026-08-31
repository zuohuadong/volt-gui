import { execFile } from "node:child_process";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type SmbMountStatus = "mounted" | "unmounted" | "offline" | "requires_credentials" | "error" | "unsupported";

export interface SmbMountDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly remotePath: string;
  readonly localPath: string;
  readonly autoMount: boolean;
}

export interface SmbMountView extends SmbMountDefinition {
  readonly status: SmbMountStatus;
  readonly lastError?: string;
}

export interface SmbMountRequest {
  readonly id?: string;
  readonly displayName: string;
  readonly remotePath: string;
  readonly localPath: string;
  readonly autoMount?: boolean;
}

interface StoredConfig {
  readonly version: 1;
  readonly mounts: readonly SmbMountDefinition[];
}

interface CommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export interface SmbMountManagerOptions {
  readonly platform?: NodeJS.Platform;
  readonly configPath: string;
  readonly run?: (file: string, args: readonly string[]) => Promise<CommandResult>;
}

export class SmbMountError extends Error {
  readonly status: Exclude<SmbMountStatus, "mounted" | "unmounted" | "unsupported">;

  constructor(status: Exclude<SmbMountStatus, "mounted" | "unmounted" | "unsupported">, message: string) {
    super(message);
    this.name = "SmbMountError";
    this.status = status;
  }
}

function psLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function validateId(value: string): string {
  const id = value.trim();
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/u.test(id)) throw new SmbMountError("error", "SMB 配置 ID 无效");
  return id;
}

function validateLocalPath(value: string): string {
  const localPath = value.trim().toUpperCase();
  if (!/^[A-Z]:$/u.test(localPath)) throw new SmbMountError("error", "本地路径必须是 Windows 盘符，例如 Z:");
  return localPath;
}

function validateRemotePath(value: string): string {
  const remotePath = value.trim().replaceAll("/", "\\").replace(/\\+$/u, "");
  if (!/^\\\\[^\\\0\r\n]+\\[^\\\0\r\n]+(?:\\[^\\\0\r\n]+)*$/u.test(remotePath)) {
    throw new SmbMountError("error", "远程路径必须是 SMB UNC 路径，例如 \\\\nas\\engineering");
  }
  return remotePath;
}

function sanitizeError(value: string): string {
  const message = value.replace(/\s+/gu, " ").trim();
  return message.length > 300 ? `${message.slice(0, 297)}...` : message || "Windows SMB 操作失败";
}

function classifyError(value: string): Exclude<SmbMountStatus, "mounted" | "unmounted" | "unsupported"> {
  const normalized = value.toLowerCase();
  if (/(credential|password|logon failure|1326|1219|access is denied|凭据|密码)/u.test(normalized)) return "requires_credentials";
  if (/(network|unreachable|timeout|offline|53|67|资源名称)/u.test(normalized)) return "offline";
  return "error";
}

function defaultRunner(file: string, args: readonly string[]): Promise<CommandResult> {
  return execFileAsync(file, [...args], { windowsHide: true, maxBuffer: 1024 * 1024 }).then(({ stdout, stderr }) => ({ stdout, stderr }));
}

function powershellFile(platform: NodeJS.Platform): string {
  return platform === "win32" ? "powershell.exe" : "powershell";
}

export class SmbMountManager {
  private readonly platform: NodeJS.Platform;
  private readonly configPath: string;
  private readonly run: (file: string, args: readonly string[]) => Promise<CommandResult>;
  private definitions: SmbMountDefinition[] = [];
  private loaded = false;

  constructor(options: SmbMountManagerOptions) {
    this.platform = options.platform ?? process.platform;
    this.configPath = options.configPath;
    this.run = options.run ?? defaultRunner;
  }

  async list(): Promise<SmbMountView[]> {
    await this.ensureLoaded();
    if (this.platform !== "win32") return this.definitions.map((definition) => ({ ...definition, status: "unsupported" }));
    const mappings = await this.readMappings();
    return this.definitions.map((definition) => {
      const mapping = mappings.find((item) => item.localPath.toUpperCase() === definition.localPath);
      return mapping?.remotePath.toLowerCase() === definition.remotePath.toLowerCase()
        ? { ...definition, status: "mounted" as const }
        : mapping
          ? { ...definition, status: "error" as const, lastError: `${definition.localPath} 已映射到其他网络路径` }
        : { ...definition, status: "unmounted" as const };
    });
  }

  async mountAuto(): Promise<SmbMountView[]> {
    await this.ensureLoaded();
    const results: SmbMountView[] = [];
    for (const definition of this.definitions.filter((item) => item.autoMount)) results.push(await this.mount(definition));
    return results;
  }

  async mount(request: SmbMountRequest): Promise<SmbMountView> {
    await this.ensureLoaded();
    const definition = this.normalizeRequest(request);
    this.definitions = [...this.definitions.filter((item) => item.id !== definition.id && item.localPath !== definition.localPath), definition];
    await this.save();
    if (this.platform !== "win32") return { ...definition, status: "unsupported" };
    try {
      const existing = (await this.readMappings()).find((item) => item.localPath === definition.localPath);
      if (existing?.remotePath.toLowerCase() === definition.remotePath.toLowerCase()) return { ...definition, status: "mounted" };
      if (existing) return { ...definition, status: "error", lastError: `${definition.localPath} 已映射到其他网络路径` };
      await this.runPowerShell(`New-SmbMapping -LocalPath ${psLiteral(definition.localPath)} -RemotePath ${psLiteral(definition.remotePath)} -Persistent $${definition.autoMount ? "true" : "false"} -ErrorAction Stop | Out-Null`);
      return { ...definition, status: "mounted" };
    } catch (error) {
      const classified = error instanceof SmbMountError ? error : new SmbMountError(classifyError(String(error)), sanitizeError(String(error)));
      return { ...definition, status: classified.status, lastError: classified.message };
    }
  }

  async unmount(id: string): Promise<SmbMountView> {
    await this.ensureLoaded();
    const definition = this.definitions.find((item) => item.id === validateId(id));
    if (!definition) throw new SmbMountError("error", "SMB 配置不存在");
    if (this.platform !== "win32") return { ...definition, status: "unsupported" };
    try {
      const existing = (await this.readMappings()).find((item) => item.localPath === definition.localPath);
      if (!existing) return { ...definition, status: "unmounted" };
      if (existing.remotePath.toLowerCase() !== definition.remotePath.toLowerCase()) {
        return { ...definition, status: "error", lastError: `${definition.localPath} 已映射到其他网络路径，拒绝卸载` };
      }
      await this.runPowerShell(`Remove-SmbMapping -LocalPath ${psLiteral(definition.localPath)} -Force -UpdateProfile -ErrorAction Stop`);
      return { ...definition, status: "unmounted" };
    } catch (error) {
      const classified = error instanceof SmbMountError ? error : new SmbMountError(classifyError(String(error)), sanitizeError(String(error)));
      return { ...definition, status: classified.status, lastError: classified.message };
    }
  }

  async remove(id: string): Promise<{ deleted: true }> {
    await this.ensureLoaded();
    const normalizedId = validateId(id);
    this.definitions = this.definitions.filter((item) => item.id !== normalizedId);
    await this.save();
    return { deleted: true };
  }

  async resolveOpenPath(localPath: string): Promise<string> {
    const normalizedPath = validateLocalPath(localPath);
    const view = (await this.list()).find((item) => item.localPath === normalizedPath);
    if (!view) throw new SmbMountError("error", "SMB 配置不存在");
    if (view.status !== "mounted") throw new SmbMountError("error", "SMB 共享尚未挂载");
    return normalizedPath;
  }

  private normalizeRequest(request: SmbMountRequest): SmbMountDefinition {
    const remotePath = validateRemotePath(request.remotePath);
    const localPath = validateLocalPath(request.localPath);
    const displayName = request.displayName.trim();
    if (!displayName || displayName.length > 80) throw new SmbMountError("error", "显示名称不能为空且不能超过 80 个字符");
    const id = validateId(request.id?.trim() || `smb-${localPath.slice(0, 1).toLowerCase()}`);
    return { id, displayName, remotePath, localPath, autoMount: request.autoMount === true };
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const parsed = JSON.parse(await readFile(this.configPath, "utf8")) as Partial<StoredConfig>;
      if (parsed.version !== 1 || !Array.isArray(parsed.mounts)) return;
      this.definitions = parsed.mounts.flatMap((item) => {
        try {
          const normalized = this.normalizeRequest(item);
          return [normalized];
        } catch {
          return [];
        }
      });
    } catch {
      this.definitions = [];
    }
  }

  private async save(): Promise<void> {
    await mkdir(path.dirname(this.configPath), { recursive: true });
    const temporaryPath = `${this.configPath}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(temporaryPath, `${JSON.stringify({ version: 1, mounts: this.definitions }, null, 2)}\n`, { mode: 0o600 });
    await rename(temporaryPath, this.configPath);
  }

  private async runPowerShell(command: string): Promise<void> {
    try {
      const result = await this.run(powershellFile(this.platform), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command]);
      if (result.stderr.trim()) throw new Error(sanitizeError(result.stderr));
    } catch (error) {
      if (error instanceof SmbMountError) throw error;
      throw new SmbMountError(classifyError(error instanceof Error ? error.message : String(error)), sanitizeError(error instanceof Error ? error.message : String(error)));
    }
  }

  private async readMappings(): Promise<Array<{ localPath: string; remotePath: string }>> {
    try {
      const result = await this.runPowerShellWithOutput("Get-SmbMapping -ErrorAction SilentlyContinue | Select-Object LocalPath,RemotePath | ConvertTo-Json -Compress");
      if (!result.trim()) return [];
      const parsed: unknown = JSON.parse(result);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      return items.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const value = item as Record<string, unknown>;
        return typeof value.LocalPath === "string" && typeof value.RemotePath === "string"
          ? [{ localPath: value.LocalPath.toUpperCase(), remotePath: value.RemotePath }]
          : [];
      });
    } catch {
      return [];
    }
  }

  private async runPowerShellWithOutput(command: string): Promise<string> {
    try {
      const result = await this.run(powershellFile(this.platform), ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", command]);
      return result.stdout;
    } catch (error) {
      throw new SmbMountError(classifyError(error instanceof Error ? error.message : String(error)), sanitizeError(error instanceof Error ? error.message : String(error)));
    }
  }
}
