import { execFile } from "node:child_process";

export interface PwshProbeResult {
  ok: boolean;
  version?: string;
  exitCode?: number | null;
  error?: string;
}

/** 用给定 argv 跑一次只读命令并捕获退出码；供 PowerShell 探测与测试复用。 */
export function probeCommand(executable: string, args: readonly string[], timeoutMs = 20_000): Promise<PwshProbeResult> {
  return new Promise((resolve) => {
    execFile(
      executable,
      [...args],
      { timeout: timeoutMs, windowsHide: true, encoding: "utf8", maxBuffer: 64 * 1024 },
      (error, stdout, stderr) => {
        const text = `${stdout ?? ""}`.trim();
        if (error) {
          const code = typeof error.code === "number" ? error.code : null;
          resolve({
            ok: false,
            exitCode: code,
            error: `${(stderr ?? "").trim() || error.message}`.trim().slice(0, 600),
          });
          return;
        }
        resolve({ ok: true, version: text, exitCode: 0 });
      },
    );
  });
}

/**
 * 启动期探测随包 PowerShell。
 * 目的：CET 影子栈/系统版本不兼容会让 pwsh 在托管代码启动前直接退出，
 * 等到第一次工具调用才暴露会非常难排查。这里只读版本号，不改任何状态。
 */
export function probePowerShell(executable: string, timeoutMs = 20_000): Promise<PwshProbeResult> {
  return probeCommand(
    executable,
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", "$PSVersionTable.PSVersion.ToString()"],
    timeoutMs,
  );
}

const CET_HARD_FAILURE_EXIT = 0x80131506;

/** 识别 CoreCLR 在 CET 不完整系统上的硬失败（0x80131506，Node 可能报有符号/无符号两种形式）。 */
export function isCetHardFailure(result: PwshProbeResult): boolean {
  if (result.ok) return false;
  const code = result.exitCode;
  if (typeof code === "number" && (code === -2146233082 || code >>> 0 === CET_HARD_FAILURE_EXIT)) return true;
  return /doesn't fully support CET|not fully support CET/iu.test(result.error ?? "");
}

/**
 * 随包 PowerShell 完全无法启动的判定：CET 硬失败、缺少 VC++ 运行库
 * (0xC0000135) 或镜像格式不被系统接受 (0xC000007B)。这三类都不是“命令写错”，
 * 而是二进制在本机根本跑不起来，回退到系统 PowerShell 5.1 严格更好。
 */
export function isBundledUnstartable(result: PwshProbeResult): boolean {
  if (result.ok) return false;
  if (isCetHardFailure(result)) return true;
  const code = result.exitCode;
  if (typeof code !== "number") return false;
  const unsigned = code >>> 0;
  return unsigned === 0xc0000135 || unsigned === 0xc000007b;
}

/** 把探测结果转成一行可直接写进启动日志的诊断文本。 */
export function describePwshProbe(result: PwshProbeResult, executable: string): string {
  if (result.ok) return `[Electron] PowerShell probe ok version=${result.version} executable=${executable}`;
  const exitCode = result.exitCode ?? "none";
  const hint = isCetHardFailure(result)
    ? " (CoreCLR CET 自检失败：该构建依赖 .NET 9/10 影子栈，需要 .NET 8 版 PowerShell 或升级 Windows)"
    : "";
  return `[Electron] PowerShell probe failed exit=${exitCode} executable=${executable} error=${result.error ?? ""}${hint}`;
}

export interface ShellSelection {
  path: string;
  source: "bundled" | "system";
  probe: PwshProbeResult;
  reason: string;
}

/**
 * 选择本次会话要用的 PowerShell。
 * 默认始终使用随包版本；只有当它因为 CET 自检直接退出（连托管代码都没跑起来）时，
 * 才回退到系统自带的 Windows PowerShell 5.1（.NET Framework，无 CET 依赖）。
 * 其它失败绝不降级，避免悄悄改变 PowerShell 语义。
 */
export async function selectPowerShell(options: {
  bundled: string;
  system: string;
  enabled?: boolean;
  probe?: (executable: string) => Promise<PwshProbeResult>;
}): Promise<ShellSelection> {
  const probe = options.probe ?? ((executable: string) => probePowerShell(executable, 8_000));
  const bundledProbe = await probe(options.bundled);
  if (bundledProbe.ok) {
    return { path: options.bundled, source: "bundled", probe: bundledProbe, reason: `bundled ${bundledProbe.version}` };
  }
  if (options.enabled === false || !isBundledUnstartable(bundledProbe)) {
    return { path: options.bundled, source: "bundled", probe: bundledProbe, reason: "bundled unavailable; no fallback" };
  }
  const systemProbe = await probe(options.system);
  if (systemProbe.ok) {
    return {
      path: options.system,
      source: "system",
      probe: systemProbe,
      reason: `bundled PowerShell cannot start (exit=${bundledProbe.exitCode ?? "none"}); using Windows PowerShell ${systemProbe.version}`,
    };
  }
  return {
    path: options.bundled,
    source: "bundled",
    probe: bundledProbe,
    reason: "both bundled and system PowerShell probes failed",
  };
}