#!/usr/bin/env node

import { execFile, spawn } from "node:child_process";
import { closeSync, cpSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { promisify } from "node:util";
import { readFile, realpath, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { z } from "zod";
import { assertNetworkUrlAllowed, networkMode } from "./network-policy.mjs";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

async function loadMcpRuntime(subpath) {
  try {
    return await import(`@modelcontextprotocol/sdk/${subpath}`);
  } catch (error) {
    // pnpm may keep peer-specific SDK instances under .pnpm without a root symlink.
    const pnpmRoot = path.resolve(SCRIPT_DIR, "..", "node_modules", ".pnpm");
    const candidate = readdirSync(pnpmRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith("@modelcontextprotocol+sdk@"))
      .map((entry) => path.join(pnpmRoot, entry.name, "node_modules", "@modelcontextprotocol", "sdk", "dist", "esm", subpath.endsWith(".js") ? subpath : `${subpath}.js`))
      .find((filePath) => { try { return Boolean(statSync(filePath)); } catch { return false; } });
    if (!candidate) throw error;
    return import(pathToFileURL(candidate).href);
  }
}

const { McpServer } = await loadMcpRuntime("server/mcp.js");
const { StdioServerTransport } = await loadMcpRuntime("server/stdio.js");

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_CHARS = 24_000;
const MAX_LOG_CHARS = 120_000;
const DEFAULT_IMPORT_MAX_BYTES = 25 * 1024 * 1024;
const DEFAULT_SHEET_ROW_LIMIT = 2_000;
const DEFAULT_SHEET_TEXT_LINES = 200;
// OfficeCLI refuses workbooks above roughly three million XML elements; keep the
// boundary in one place so the guidance stays consistent with the real engine.
const OFFICECLI_ELEMENT_LIMIT = 3_000_000;
const SHEET_TOOL_TIMEOUT_MS = 300_000;
const DEFAULT_TIMEOUT_MS = 20_000;

function env(name, fallback = "") {
  const value = String(process.env[name] ?? "").trim();
  return value || fallback;
}

function enabled(name) {
  return env(name) === "1";
}

function positiveInt(name, fallback) {
  const parsed = Number.parseInt(env(name), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function importMaxBytes() {
  return positiveInt("ANYONG_IMPORT_MAX_BYTES", DEFAULT_IMPORT_MAX_BYTES);
}

export function sheetRowLimit() {
  return positiveInt("ANYONG_SHEET_ROW_LIMIT", DEFAULT_SHEET_ROW_LIMIT);
}

function truncate(value, max = MAX_OUTPUT_CHARS) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n...[truncated ${text.length - max} chars]`;
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  const output = {};
  for (const [key, item] of Object.entries(value)) {
    if (/(token|secret|password|api[-_]?key|authorization|cookie|dsn)/iu.test(key)) {
      output[key] = "[redacted]";
    } else {
      output[key] = redact(item);
    }
  }
  return output;
}

function result(value) {
  return { content: [{ type: "text", text: truncate(redact(value)) }] };
}

function fail(message) {
  return { content: [{ type: "text", text: message }], isError: true };
}

export function validateEndpoint(raw, label, { allowLocalHttp = false } = {}) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase());
  const intranetHttp = networkMode() === "intranet" && url.protocol === "http:";
  if (url.protocol !== "https:" && !(allowLocalHttp && url.protocol === "http:" && local) && !intranetHttp) {
    throw new Error(`${label} must use HTTPS${allowLocalHttp ? " (HTTP is allowed only for localhost)" : ""}`);
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(`${label} must not contain credentials, query parameters, or fragments`);
  }
  return url;
}

function validateServiceEndpoint({ raw, label, defaults, overrideEnv, allowLocalHttp = false }) {
  const url = validateEndpoint(raw, label, { allowLocalHttp });
  const allowed = new Set([
    ...defaults,
    ...env(overrideEnv).split(",").map((host) => host.trim()).filter(Boolean),
  ].map((host) => host.toLowerCase()));
  if (!allowed.has(url.hostname.toLowerCase())) {
    throw new Error(`${label} host is not allowlisted; set ${overrideEnv} for an approved enterprise host`);
  }
  return url;
}

export function officeRoots() {
  return [path.resolve(env("ANYONG_OFFICE_ROOT") || env("DSH_CWD") || process.cwd())];
}

function canonicalLocalPath(candidate) {
  const suffix = [];
  let current = path.resolve(candidate);
  for (;;) {
    if (lstatSync(current, { throwIfNoEntry: false })) return path.join(realpathSync(current), ...suffix.reverse());
    suffix.push(path.basename(current));
    const parent = path.dirname(current);
    if (parent === current) throw new Error("Cannot resolve local path");
    current = parent;
  }
}

function allowedLocalPath(candidate, roots) {
  const target = canonicalLocalPath(candidate);
  return roots.some((root) => {
    const relative = path.relative(canonicalLocalPath(root), target);
    return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
  });
}

export function resolveOfficePath(raw, roots, { mustExist = true } = {}) {
  if (typeof raw !== "string" || !raw.trim()) throw new Error("An Office document path is required");
  const candidate = path.resolve(roots[0] ?? process.cwd(), raw.trim());
  if (!allowedLocalPath(candidate, roots)) throw new Error("Office document path is outside the allowed workspace");
  if (mustExist) {
    const stats = statSync(candidate, { throwIfNoEntry: false });
    if (!stats?.isFile()) throw new Error("Office document does not exist");
  }
  return candidate;
}

const OFFICE_CONVERSIONS = new Map([
  [".doc", { extension: ".docx", format: 16 }],
  [".xls", { extension: ".xlsx", format: 51 }],
  [".ppt", { extension: ".pptx", format: 24 }],
]);

export function officeConversionTarget(filePath) {
  return OFFICE_CONVERSIONS.get(path.extname(String(filePath ?? "")).toLowerCase());
}

function officePowerShell() {
  return process.platform === "win32"
    ? env("ANYONG_POWERSHELL", "pwsh.exe")
    : "powershell";
}

function officeControlScript() {
  return path.join(SCRIPT_DIR, "office-control.ps1");
}

/** Actions that must never borrow the Office instance the user is working in. */
const OFFICE_BACKGROUND_ACTIONS = new Set(["convert", "export-pdf"]);

export function officeControlArgs(action, payload = {}, scriptPath = officeControlScript()) {
  const args = [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-File", scriptPath, "-Action", action,
    "-App", payload.app || "auto",
    "-Vendor", payload.vendor || "auto",
  ];
  if (payload.path) args.push("-Path", payload.path);
  if (payload.output) args.push("-Output", payload.output);
  if (payload.pidFile) args.push("-PidFile", payload.pidFile);
  if (payload.visible === true) args.push("-Visible");
  if (payload.private === true) args.push("-Private");
  if (payload.save === true) args.push("-Save");
  if (payload.overwrite === true) args.push("-Overwrite");
  return args;
}

export function officeRunTimeoutMs() {
  return positiveInt("ANYONG_OFFICE_TIMEOUT_MS", 180_000);
}

/**
 * Kill the background Office process this run created, if it outlived its
 * PowerShell parent (for example after an execFile timeout). The script
 * verifies the recorded creation time first, so a recycled PID is never hit.
 */
async function cleanupOfficeOwner(pidFile) {
  if (!pidFile || process.platform !== "win32") return { killed: false };
  let killed = false;
  try {
    const { stdout } = await execFileAsync(officePowerShell(), officeControlArgs("cleanup", { pidFile }), {
      timeout: 30_000,
      windowsHide: true,
      maxBuffer: 256 * 1024,
    });
    const line = String(stdout ?? "").trim().split(/\r?\n/u).filter(Boolean).at(-1);
    if (line) {
      try { killed = JSON.parse(line)?.killed === true; } catch { killed = false; }
    }
  } catch {
    killed = false;
  } finally {
    await unlink(pidFile).catch(() => undefined);
  }
  return { killed };
}

function officeResultLine(value) {
  return String(value ?? "").trim().split(/\r?\n/u).filter(Boolean).at(-1) ?? "";
}

async function officeRun(action, payload = {}) {
  if (process.platform !== "win32") throw new Error("Office/WPS control is available only on Windows");
  const script = officeControlScript();
  if (!statSync(script, { throwIfNoEntry: false })?.isFile()) throw new Error("Office control script is missing");
  const background = payload.private === true || (payload.private !== false && OFFICE_BACKGROUND_ACTIONS.has(action));
  const pidFile = background ? path.join(tmpdir(), `anyong-office-${randomUUID()}.json`) : "";
  const timeoutMs = officeRunTimeoutMs();
  const args = officeControlArgs(action, { ...payload, private: background, pidFile });
  let cleaned = null;
  const cleanupOnce = async () => {
    if (!pidFile) return { killed: false };
    if (!cleaned) cleaned = await cleanupOfficeOwner(pidFile);
    return cleaned;
  };
  try {
    let stdout;
    try {
      ({ stdout } = await execFileAsync(officePowerShell(), args, {
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
        env: { ...process.env, ANYONG_OFFICE_ROOT: payload.root || "" },
      }));
    } catch (error) {
      const cleanup = await cleanupOnce();
      const line = officeResultLine(error?.stdout);
      if (line) {
        try {
          const parsed = JSON.parse(line);
          if (parsed?.error) throw new Error(parsed.error);
        } catch (parseError) {
          if (!(parseError instanceof SyntaxError)) throw parseError;
          throw new Error(line);
        }
      }
      const timedOut = error?.killed === true || /ETIMEDOUT|timed out/iu.test(String(error?.message ?? ""));
      if (timedOut) {
        throw new Error(
          `Office 操作超过 ${Math.round(timeoutMs / 1000)}s 已中止`
          + `${cleanup.killed ? "，并已结束本次创建的私有 Office 进程" : ""}。`
          + "请确认文件未被占用、没有更新链接的弹窗，然后重试；大文件建议先拆分或转成新格式。",
        );
      }
      throw new Error(error?.message || "Office control failed");
    }
    const line = officeResultLine(stdout);
    if (!line) throw new Error("Office control returned no result");
    const parsed = JSON.parse(line);
    if (!parsed?.ok) throw new Error(parsed?.error || "Office control failed");
    return parsed;
  } finally {
    await cleanupOnce();
  }
}

const ALTIUM_READ_COMMANDS = new Set([
  "get_project_info",
  "get_project_components",
  "get_all_component_data",
  "get_all_nets",
  "get_schematic_data",
  "get_pcb_layers",
  "get_pcb_layer_stackup",
  "get_board_summary",
  "get_pcb_rules",
  "get_erc_violations",
  "get_output_job_containers",
  "get_net_connections",
  "get_component_pins",
  "get_symbol_primitives",
  "get_footprint_primitives",
  "get_library_symbol_reference",
  "get_selected_components_coordinates",
  "check_placement",
]);

const ALTIUM_WRITE_COMMANDS = new Set([
  "run_output_jobs",
  "set_pcb_layer_visibility",
  "move_components",
  "place_components",
  "set_component_position",
  "create_net_class",
  "create_schematic_symbol",
  "create_symbols_batch",
  "create_pcb_footprint",
  "create_footprints_batch",
  "layout_duplicator",
  "layout_duplicator_apply",
  "build_circuit",
  "take_view_screenshot",
]);

export function altiumCommandKind(command) {
  if (ALTIUM_READ_COMMANDS.has(command)) return "read";
  if (ALTIUM_WRITE_COMMANDS.has(command)) return "write";
  return "unsupported";
}

function altiumScriptRoot() {
  return env("ANYONG_ALTIUM_SCRIPT_DIR") || path.join(process.env.LOCALAPPDATA || process.env.USERPROFILE || SCRIPT_DIR, "Anyong", "altium");
}

function altiumBundledScriptRoot() {
  return path.join(SCRIPT_DIR, "altium", "AltiumScript");
}

function altiumExchangeDir() {
  return env("ANYONG_ALTIUM_EXCHANGE_DIR") || path.join(altiumScriptRoot(), "exchange");
}

async function secureAltiumDirectory(directory) {
  const localRoot = process.env.LOCALAPPDATA;
  if (!localRoot || !path.isAbsolute(directory) || !allowedLocalPath(directory, [localRoot])) {
    throw new Error("Altium bridge directories must be inside the current user's LOCALAPPDATA");
  }
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const { stdout } = await execFileAsync("whoami.exe", ["/user", "/fo", "csv", "/nh"], { windowsHide: true });
  const sid = stdout.match(/\bS-1-\d+(?:-\d+)+\b/u)?.[0];
  if (!sid) throw new Error("Cannot determine the current Windows user SID");
  await execFileAsync("icacls.exe", [directory, "/reset"], { windowsHide: true });
  await execFileAsync("icacls.exe", [directory, "/inheritance:r", "/grant:r", `*${sid}:(OI)(CI)F`, "*S-1-5-18:(OI)(CI)F"], { windowsHide: true });
}

function altiumFindExecutable() {
  const configured = env("ANYONG_ALTIUM_EXE");
  if (configured) {
    if (!path.isAbsolute(configured) || !existsSync(configured)) throw new Error("ANYONG_ALTIUM_EXE does not point to an existing file");
    return configured;
  }
  if (process.platform !== "win32") throw new Error("Altium Designer control is available only on Windows");
  const roots = [process.env.ProgramFiles, process.env["ProgramFiles(x86)"]].filter(Boolean).map((root) => path.join(root, "Altium"));
  const candidates = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory() || !/^AD\d+/u.test(entry.name)) continue;
      const executable = path.join(root, entry.name, "X2.EXE");
      if (existsSync(executable)) candidates.push({ executable, version: Number.parseInt(entry.name.slice(2), 10) || 0 });
    }
  }
  const found = candidates.sort((left, right) => right.version - left.version)[0];
  if (!found) throw new Error("Altium Designer X2.EXE was not found; set ANYONG_ALTIUM_EXE");
  return found.executable;
}

export function ensureAltiumScripts({ force = false } = {}) {
  const root = altiumScriptRoot();
  const target = path.join(root, "AltiumScript");
  const source = altiumBundledScriptRoot();
  if (!existsSync(source)) throw new Error("Bundled Altium bridge scripts are missing");
  const bridgePath = path.join(target, "Altium_API.pas");
  const exchange = altiumExchangeDir();
  const bridge = readFileSync(path.join(source, "Altium_API.pas"), "utf8")
    .replaceAll("@ANYONG_ALTIUM_EXCHANGE_DIR@", () => `${exchange}${path.sep}`.replaceAll("'", "''"));
  if (force || !existsSync(bridgePath) || readFileSync(bridgePath, "utf8") !== bridge) {
    cpSync(source, target, { recursive: true, force: true });
    for (const fileName of ["Altium_API.pas", "other_utils.pas", "schematic_utils.pas"]) {
      const filePath = path.join(target, fileName);
      const sourceText = readFileSync(filePath, "utf8");
      writeFileSync(filePath, sourceText.replaceAll("@ANYONG_ALTIUM_EXCHANGE_DIR@", () => `${exchange}${path.sep}`.replaceAll("'", "''")), {
        encoding: "utf8",
        mode: 0o600,
      });
    }
  }
  return target;
}

function altiumStatusValue() {
  let executable = "";
  let error = "";
  try { executable = altiumFindExecutable(); } catch (value) { error = value instanceof Error ? value.message : String(value); }
  return {
    platform: process.platform,
    executable,
    exchangeDir: altiumExchangeDir(),
    scriptDir: altiumScriptRoot(),
    available: Boolean(executable),
    ...(error ? { error } : {}),
  };
}

async function launchAltiumScript(projectPath) {
  const executable = altiumFindExecutable();
  const command = `-RScriptingSystem:RunScript(ProjectName="${projectPath}"|ProcName="Altium_API>Run")`;
  await launchAltium(executable, [command]);
}

function launchAltium(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { detached: true, stdio: "ignore", windowsHide: false });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

let altiumQueue = Promise.resolve();

export function acquireAltiumLock(lockPath) {
  const recoveryPath = `${lockPath}.recovery`;
  let recovery;
  try {
    recovery = openSync(recoveryPath, "wx", 0o600);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    throw new Error("Altium lock recovery is busy; verify all bridge owners have stopped before removing request.lock.recovery", { cause: error });
  }
  try {
    try {
      return openSync(lockPath, "wx", 0o600);
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      let owner;
      try { owner = JSON.parse(readFileSync(lockPath, "utf8")); } catch { owner = undefined; }
      if (owner?.phase === "prepared" && Number.isSafeInteger(owner.pid) && owner.pid > 0 && owner.pid !== process.pid) {
        try {
          process.kill(owner.pid, 0);
        } catch (probeError) {
          if (probeError?.code === "ESRCH") {
            rmSync(lockPath);
            return openSync(lockPath, "wx", 0o600);
          }
        }
      }
      throw new Error("Altium bridge is busy; stop the active bridge or remove its stale request.lock after verifying the bridge has finished", { cause: error });
    }
  } finally {
    closeSync(recovery);
    rmSync(recoveryPath);
  }
}

async function altiumRunCommandUnlocked(command, params) {
  const kind = altiumCommandKind(command);
  if (kind === "unsupported") throw new Error(`Unsupported Altium bridge command: ${command}`);
  if (kind === "write" && params.confirm !== true) throw new Error("Altium write command requires confirm=true after user approval");
  if (process.platform !== "win32") throw new Error("Altium Designer control is available only on Windows");
  const exchange = altiumExchangeDir();
  await secureAltiumDirectory(altiumScriptRoot());
  await secureAltiumDirectory(exchange);
  const request = path.join(exchange, "request.json");
  const response = path.join(exchange, "response.json");
  mkdirSync(exchange, { recursive: true });
  const lockPath = path.join(exchange, "request.lock");
  const requestId = randomUUID();
  const lock = acquireAltiumLock(lockPath);
  let launched = false;
  let answered = false;
  try {
    const owner = { pid: process.pid, requestId, phase: "prepared", startedAt: new Date().toISOString() };
    writeFileSync(lock, JSON.stringify(owner), { encoding: "utf8", mode: 0o600 });
    const scriptDir = ensureAltiumScripts();
    const project = path.join(scriptDir, "Altium_API.PrjScr");
    if (!existsSync(project)) throw new Error("Altium bridge project is missing");
    const payload = { ...params };
    delete payload.confirm;
    delete payload.command;
    delete payload.requestId;
    rmSync(response, { force: true });
    const temporaryRequest = `${request}.${requestId}.tmp`;
    try {
      writeFileSync(temporaryRequest, JSON.stringify({ ...payload, command, confirm: params.confirm === true, requestId }, null, 2), { encoding: "utf8", mode: 0o600 });
      renameSync(temporaryRequest, request);
    } finally {
      rmSync(temporaryRequest, { force: true });
    }
    writeFileSync(lockPath, JSON.stringify({ ...owner, phase: "bridge-started" }), { encoding: "utf8", mode: 0o600 });
    await launchAltiumScript(project);
    launched = true;
    const deadline = Date.now() + 120_000;
    while (!existsSync(response) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 500));
    if (!existsSync(response)) throw new Error("Altium did not answer within 120 seconds; check that Altium Designer is running and the bridge script is loaded");
    const value = JSON.parse(readFileSync(response, "utf8").replace(/^\uFEFF/u, ""));
    if (value.requestId !== requestId) throw new Error("Altium bridge response does not match the active request; stop the old bridge before retrying");
    answered = true;
    return value;
  } finally {
    closeSync(lock);
    // 超时后旧脚本可能仍会写回；保留锁直到人工确认已停止，避免错配下一次响应。
    if (!launched || answered) rmSync(lockPath, { force: true });
    if (!launched || answered) rmSync(request, { force: true });
  }
}

export function altiumRunCommand(command, params = {}) {
  const run = altiumQueue.then(() => altiumRunCommandUnlocked(command, params));
  altiumQueue = run.catch(() => undefined);
  return run;
}

function joinUrl(base, pathname) {
  const baseText = String(base);
  const root = baseText.endsWith("/") ? baseText : `${baseText}/`;
  return new URL(pathname.replace(/^\//u, ""), root).toString();
}

function queryUrl(base, pathname, params) {
  const url = new URL(joinUrl(base, pathname));
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && String(value) !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function requestJson({ url, label, token, method = "GET", body, headers = {}, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    await assertNetworkUrlAllowed(url, networkMode());
    const response = await fetch(url, {
      method,
      signal: controller.signal,
      redirect: "manual",
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const location = response.headers.get("location");
    if (location) await assertNetworkUrlAllowed(new URL(location, url), networkMode());
    const text = await response.text();
    if (!response.ok) throw new Error(`${label} failed (HTTP ${response.status})`);
    if (!text.trim()) return {};
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`${label} returned invalid JSON`);
    }
  } catch (error) {
    if (error?.name === "AbortError") throw new Error(`${label} timed out after ${timeoutMs}ms`);
    if (error instanceof Error && error.message.startsWith(`${label} `)) throw error;
    throw new Error(`${label} failed: network error`);
  } finally {
    clearTimeout(timeout);
  }
}

function githubBase() {
  return validateServiceEndpoint({ raw: env("GITHUB_API_BASE_URL", "https://api.github.com"), label: "GITHUB_API_BASE_URL", defaults: ["api.github.com", "github.com"], overrideEnv: "GITHUB_ALLOWED_HOSTS" });
}

function githubRepo(owner, repo) {
  const cleanOwner = String(owner ?? "").trim();
  const cleanRepo = String(repo ?? "").trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/u.test(cleanOwner) || !/^[A-Za-z0-9_.-]{1,100}$/u.test(cleanRepo)) {
    throw new Error("owner and repo must be simple GitHub repository identifiers");
  }
  return `${encodeURIComponent(cleanOwner)}/${encodeURIComponent(cleanRepo)}`;
}

async function githubSearchCode(args) {
  const base = githubBase();
  const q = String(args.query ?? "").trim();
  if (!q) throw new Error("query is required");
  const data = await requestJson({
    url: queryUrl(base, "/search/code", { q, per_page: Math.min(Number(args.limit) || 20, 50) }),
    label: "GitHub code search",
    token: env("GITHUB_TOKEN"),
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return result({ total_count: data.total_count, items: (data.items ?? []).map((item) => ({ name: item.name, path: item.path, sha: item.sha, html_url: item.html_url, repository: item.repository?.full_name })) });
}

async function githubListIssues(args) {
  const base = githubBase();
  const data = await requestJson({
    url: queryUrl(base, `/repos/${githubRepo(args.owner, args.repo)}/issues`, { state: args.state || "all", page: args.page || 1, per_page: Math.min(Number(args.limit) || 30, 100) }),
    label: "GitHub issue list",
    token: env("GITHUB_TOKEN"),
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return result((data ?? []).filter((item) => !item.pull_request).map((item) => ({ number: item.number, title: item.title, state: item.state, user: item.user?.login, labels: (item.labels ?? []).map((label) => label.name), comments: item.comments, created_at: item.created_at, updated_at: item.updated_at, html_url: item.html_url, body: truncate(item.body ?? "", 4_000) })));
}

async function githubListPulls(args) {
  const base = githubBase();
  const data = await requestJson({
    url: queryUrl(base, `/repos/${githubRepo(args.owner, args.repo)}/pulls`, { state: args.state || "all", page: args.page || 1, per_page: Math.min(Number(args.limit) || 30, 100) }),
    label: "GitHub pull request list",
    token: env("GITHUB_TOKEN"),
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return result((data ?? []).map((item) => ({ number: item.number, title: item.title, state: item.state, draft: item.draft, user: item.user?.login, head: item.head?.label, base: item.base?.label, created_at: item.created_at, updated_at: item.updated_at, html_url: item.html_url, body: truncate(item.body ?? "", 4_000) })));
}

async function githubGetIssue(args, kind = "issues") {
  const number = Number(args.number);
  if (!Number.isInteger(number) || number < 1) throw new Error("number must be a positive integer");
  const data = await requestJson({
    url: joinUrl(githubBase(), `/repos/${githubRepo(args.owner, args.repo)}/${kind}/${number}`),
    label: kind === "pulls" ? "GitHub pull request" : "GitHub issue",
    token: env("GITHUB_TOKEN"),
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return result({ ...data, body: truncate(data.body ?? "", 12_000), user: data.user?.login, assignee: data.assignee?.login, requested_reviewers: (data.requested_reviewers ?? []).map((item) => item.login) });
}

async function githubGetPullFiles(args) {
  const number = Number(args.number);
  if (!Number.isInteger(number) || number < 1) throw new Error("number must be a positive integer");
  const data = await requestJson({
    url: queryUrl(githubBase(), `/repos/${githubRepo(args.owner, args.repo)}/pulls/${number}/files`, { page: args.page || 1, per_page: Math.min(Number(args.limit) || 30, 100) }),
    label: "GitHub pull request files",
    token: env("GITHUB_TOKEN"),
    headers: { "X-GitHub-Api-Version": "2022-11-28" },
  });
  return result((data ?? []).map((item) => ({ filename: item.filename, status: item.status, additions: item.additions, deletions: item.deletions, changes: item.changes, patch: truncate(item.patch ?? "", 8_000), raw_url: item.raw_url })));
}

function cnbBase() {
  return validateServiceEndpoint({ raw: env("CNB_API_ENDPOINT", "https://api.cnb.cool"), label: "CNB_API_ENDPOINT", defaults: ["api.cnb.cool"], overrideEnv: "CNB_ALLOWED_HOSTS" });
}

function cnbSlug(slug) {
  const clean = String(slug ?? env("CNB_REPO_SLUG")).trim();
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?$/u.test(clean)) throw new Error("slug must look like group/repo or org/group/repo");
  return clean.split("/").map(encodeURIComponent).join("/");
}

function cnbPath(template, values) {
  return template.replace(/\{(slug|pipelineId|buildId|jobId)\}/gu, (_match, key) => values[key] ?? "");
}

async function cnbGetBuilds(args) {
  const slug = cnbSlug(args.slug);
  const pathTemplate = env("CNB_PIPELINES_PATH", "/{slug}/-/pipelines");
  const data = await requestJson({
    url: queryUrl(cnbBase(), cnbPath(pathTemplate, { slug }), { branch: args.branch, page: args.page || 1, page_size: Math.min(Number(args.limit) || 20, 100) }),
    label: "CNB build status",
    token: env("CNB_TOKEN"),
  });
  return result(data);
}

async function cnbGetBuildLogs(args) {
  const pipelineId = String(args.pipelineId ?? "").trim();
  if (!pipelineId) throw new Error("pipelineId is required");
  const slug = cnbSlug(args.slug);
  const pathTemplate = env("CNB_LOGS_PATH", "/{slug}/-/pipelines/{pipelineId}/logs");
  const data = await requestJson({
    url: queryUrl(cnbBase(), cnbPath(pathTemplate, { slug, pipelineId: encodeURIComponent(pipelineId), jobId: args.jobId ? encodeURIComponent(String(args.jobId)) : undefined }), { job_id: args.jobId }),
    label: "CNB build logs",
    token: env("CNB_TOKEN"),
  });
  return result(typeof data === "string" ? truncate(data, MAX_LOG_CHARS) : data);
}

export function analyzeFailure(logText) {
  const text = String(logText ?? "");
  const lines = text.split(/\r?\n/u);
  const suspicious = lines.filter((line) => /(error|failed|failure|exception|fatal|panic|timeout|exit code|permission denied|unauthori[sz]ed|forbidden)/iu.test(line));
  const categories = new Map();
  for (const line of suspicious) {
    const key = /timeout/iu.test(line) ? "timeout" : /permission|unauthori[sz]ed|forbidden/iu.test(line) ? "permission" : /network|fetch|connect|dns/iu.test(line) ? "network" : /test|assert/iu.test(line) ? "test" : "build";
    categories.set(key, (categories.get(key) || 0) + 1);
  }
  return { line_count: lines.length, failure_line_count: suspicious.length, categories: Object.fromEntries(categories), excerpts: suspicious.slice(-40).map((line) => truncate(line, 800)) };
}

async function cnbAnalyzeFailure(args) {
  let logs = String(args.logs ?? "");
  if (!logs && args.pipelineId) {
    const response = await cnbGetBuildLogs({ slug: args.slug, pipelineId: args.pipelineId, jobId: args.jobId });
    logs = response.content?.[0]?.text ?? "";
  }
  if (!logs) throw new Error("logs or pipelineId is required");
  return result(analyzeFailure(logs));
}

function sentryBase() {
  return validateServiceEndpoint({ raw: env("SENTRY_BASE_URL", "https://sentry.io/api/0"), label: "SENTRY_BASE_URL", defaults: ["sentry.io"], overrideEnv: "SENTRY_ALLOWED_HOSTS" });
}

function sentryOrg(value) {
  const org = String(value ?? env("SENTRY_ORG")).trim();
  if (!/^[A-Za-z0-9_.-]{1,100}$/u.test(org)) throw new Error("organization is required and must be a simple identifier");
  return encodeURIComponent(org);
}

async function sentryListIssues(args) {
  const data = await requestJson({
    url: queryUrl(sentryBase(), `/organizations/${sentryOrg(args.organization)}/issues/`, { project: args.project, query: args.query, sort: args.sort || "date", statsPeriod: args.statsPeriod || "24h", limit: Math.min(Number(args.limit) || 25, 100) }),
    label: "Sentry issue list",
    token: env("SENTRY_AUTH_TOKEN"),
  });
  return result(data);
}

async function sentryIssueEvents(args) {
  const issue = String(args.issueId ?? "").trim();
  if (!/^\d{1,32}$/u.test(issue)) throw new Error("issueId must be a numeric Sentry issue id");
  const data = await requestJson({
    url: queryUrl(sentryBase(), `/issues/${encodeURIComponent(issue)}/events/`, { limit: Math.min(Number(args.limit) || 25, 100) }),
    label: "Sentry issue events",
    token: env("SENTRY_AUTH_TOKEN"),
  });
  return result(data);
}

async function sentrySearchEvents(args) {
  const query = String(args.query ?? "").trim();
  if (!query) throw new Error("query is required");
  const data = await requestJson({
    url: queryUrl(sentryBase(), `/organizations/${sentryOrg(args.organization)}/events/`, { query, project: args.project, field: args.field || "title", statsPeriod: args.statsPeriod || "24h", per_page: Math.min(Number(args.limit) || 25, 100) }),
    label: "Sentry event search",
    token: env("SENTRY_AUTH_TOKEN"),
  });
  return result(data);
}

// ---------------------------------------------------------------------------
// 本地失效分析报告（离线）。
//
// 资料来自操作员自己的本地文件夹或 SMB 映射/UNC 目录，报告只在本机生成
// DOCX：不访问网络、不调用任何远端接口、不需要账号、成员或 token。
// 扫描仅限允许的根目录，最多 3 层深、默认 60 份文件；生成物永远带
// “草稿 / 未经审核签发”声明，不能当作正式报告。
// ---------------------------------------------------------------------------
const REPORT_SECTIONS = [
  ["summary", "一、失效概述"],
  ["failureMode", "二、失效模式"],
  ["mechanism", "三、失效机理分析"],
  ["rootCause", "四、根本原因"],
  ["conclusion", "五、结论"],
  ["recommendation", "六、改进建议"],
];
const REPORT_DRAFT_NOTICE = "本文件为本地生成的草稿，未经审核、批准与签发，不得作为正式报告使用。";
const REPORT_SECTION_KEYS = new Set(REPORT_SECTIONS.map(([key]) => key));
const REPORT_MAX_SECTION_CHARS = 12_000;
const REPORT_MAX_DEPTH = 3;
const REPORT_DEFAULT_MAX_FILES = 60;
const REPORT_SKIP_DIRECTORIES = new Set([
  ".git", "node_modules", "dist", "build", "out", "target", ".next", ".venv",
  "__pycache__", "$recycle.bin", "system volume information",
]);
const REPORT_EVIDENCE_EXTENSIONS = new Map([
  [".pdf", "pdf"],
  [".png", "image"], [".jpg", "image"], [".jpeg", "image"], [".bmp", "image"], [".tif", "image"], [".tiff", "image"],
  [".docx", "document"], [".doc", "document"], [".txt", "text"], [".md", "text"], [".log", "text"], [".csv", "table"],
  [".xlsx", "table"], [".xls", "table"], [".pptx", "presentation"], [".ppt", "presentation"],
]);

function reportRoots() {
  const configured = env("ANYONG_REPORT_ROOTS")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  const roots = [...new Set((configured.length ? configured : officeRoots()).map((item) => path.resolve(item)))];
  if (roots.length === 0) throw new Error("未找到可用的本地资料根目录");
  return roots;
}

/** 本地路径必须是绝对路径或相对于第一个允许根目录，且落在允许根目录内。 */
function reportPath(raw, { mustExist = false } = {}) {
  const value = String(raw ?? "").trim();
  if (!value) throw new Error("资料目录或输出路径不能为空");
  const roots = reportRoots();
  const candidate = path.resolve(path.isAbsolute(value) ? value : path.join(roots[0], value));
  if (!allowedLocalPath(candidate, roots)) {
    throw new Error("路径不在允许的本地资料根目录内；请设置 ANYONG_REPORT_ROOTS（逗号分隔，可含本地文件夹、SMB 映射盘或 UNC 根）");
  }
  const stats = statSync(candidate, { throwIfNoEntry: false });
  if (mustExist && !stats?.isDirectory()) throw new Error("资料目录不存在、不可读或不是文件夹");
  return candidate;
}

function reportPythonCommand() {
  const configured = env("ANYONG_REPORT_PYTHON") || env("ANYONG_PYTHON_COMMAND");
  if (!configured) {
    throw new Error("未找到生成报告用的 Python 运行时：请设置 ANYONG_PYTHON_COMMAND（桌面端默认使用随包 Python）。");
  }
  return configured;
}

/** 扫描资料目录里的可引用文件；有界、跳过隐藏项和依赖目录。 */
function reportEvidenceFiles(root, { maxFiles = REPORT_DEFAULT_MAX_FILES } = {}) {
  const limit = Math.max(1, Math.min(Number(maxFiles) || REPORT_DEFAULT_MAX_FILES, 200));
  const files = [];
  const walk = (directory, depth) => {
    if (files.length >= limit) return;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      if (files.length >= limit) return;
      if (entry.name.startsWith(".")) continue;
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (depth < REPORT_MAX_DEPTH && !REPORT_SKIP_DIRECTORIES.has(entry.name.toLowerCase())) {
          walk(full, depth + 1);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      const extension = path.extname(entry.name).toLowerCase();
      const kind = REPORT_EVIDENCE_EXTENSIONS.get(extension);
      if (!kind) continue;
      const stats = statSync(full, { throwIfNoEntry: false });
      if (!stats?.isFile()) continue;
      files.push({
        title: path.basename(entry.name, extension),
        fileName: entry.name,
        relativePath: path.relative(root, full).split(path.sep).join("/"),
        evidenceType: kind,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
      });
    }
  };
  walk(root, 0);
  return files;
}

/** 只接受的六个叙事节；未提供的节写成“待补充”，不编造内容。 */
function reportSections(value) {
  if (value === undefined || value === null) return {};
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("sections 必须是对象，键为 summary/failureMode/mechanism/rootCause/conclusion/recommendation");
  }
  const output = {};
  for (const [key, text] of Object.entries(value)) {
    if (!REPORT_SECTION_KEYS.has(key)) throw new Error(`未知的报告章节：${key}`);
    if (typeof text !== "string") throw new Error(`报告章节 ${key} 必须是字符串`);
    if (text.length > REPORT_MAX_SECTION_CHARS) throw new Error(`报告章节 ${key} 超过 ${REPORT_MAX_SECTION_CHARS} 字符`);
    if (text.trim()) output[key] = text.trim();
  }
  if (Object.keys(output).length === 0) throw new Error("至少需要一个报告章节正文");
  return output;
}

function reportProjectRows(project) {
  const record = project && typeof project === "object" && !Array.isArray(project) ? project : {};
  const rows = [
    ["流程单号", record.flowNumber],
    ["项目号", record.projectNo],
    ["报告编号", record.reportNo],
    ["客户", record.customer],
    ["器件/型号", [record.device, record.model].filter(Boolean).join(" / ")],
    ["批次", record.batch],
    ["状态", record.status],
  ];
  return rows
    .map(([label, value]) => [label, value === undefined || value === null ? "" : String(value).trim()])
    .filter(([, value]) => value)
    .map(([label, value]) => ({ label, value }));
}

/** 纯函数：把本地事实和用户正文拼成渲染规格；不需要网络或 Python。 */
function reportSpec({
  root, project, evidence, sections, output, title, overwrite, gaps = [], generatedAt,
}) {
  const provided = reportSections(sections);
  const folder = path.basename(root);
  return {
    output,
    ...(overwrite === true ? { overwrite: true } : {}),
    title: String(title || `${String(project?.flowNumber ?? "").trim()} 失效分析报告（草稿）`.trim()),
    notice: REPORT_DRAFT_NOTICE,
    identifiers: [
      ...reportProjectRows(project),
      { label: "资料目录", value: root },
    ],
    sections: REPORT_SECTIONS.map(([key, heading]) => ({
      key,
      title: heading,
      body: provided[key] || "待补充（本次未提供该节正文）。",
    })),
    evidence: evidence.slice(0, 200),
    gaps,
    source: `来源：本机资料目录 ${folder} · 生成时间 ${generatedAt || new Date().toISOString()} · 本文件由 anyong-agent 在本地生成，未上传任何资料。`,
  };
}

async function reportScanSources(args = {}) {
  const root = reportPath(args.root, { mustExist: true });
  const evidence = reportEvidenceFiles(root, { maxFiles: args.maxFiles });
  return result({
    root,
    total: evidence.length,
    evidence,
    note: evidence.length === 0
      ? "目录中没有可引用的资料（支持 PDF、图片、Office、文本、CSV）。请确认路径或直接提供 sections 正文。"
      : "清单仅按文件名和扩展名生成，内容仍需人工确认。",
  });
}

async function reportGenerateDocx(args = {}) {
  const root = reportPath(args.root, { mustExist: true });
  const output = reportPath(args.output, { mustExist: false });
  if (statSync(output, { throwIfNoEntry: false }) && args.overwrite !== true) {
    throw new Error("目标文件已存在；如需覆盖请显式传 overwrite=true");
  }
  const sections = reportSections(args.sections);
  const evidence = args.includeEvidence === false ? [] : reportEvidenceFiles(root, { maxFiles: args.maxFiles });
  const spec = reportSpec({
    root,
    project: args.project,
    evidence,
    sections,
    output,
    title: args.title,
    overwrite: args.overwrite === true,
    gaps: Array.isArray(args.gaps) ? args.gaps.slice(0, 20).map((item) => String(item)) : [],
  });
  const specPath = path.join(tmpdir(), `anyong-report-${randomUUID()}.json`);
  await writeFile(specPath, JSON.stringify(spec), { encoding: "utf8", mode: 0o600 });
  const command = reportPythonCommand();
  try {
    const { stdout } = await execFileAsync(command, [reportScript(), specPath], {
      timeout: positiveInt("ANYONG_REPORT_TIMEOUT_MS", 120_000),
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" },
    });
    const line = String(stdout ?? "").trim().split(/\r?\n/u).filter(Boolean).at(-1) ?? "";
    let receipt;
    try {
      receipt = JSON.parse(line);
    } catch {
      throw new Error("报告生成器返回了无法解析的结果");
    }
    if (receipt?.error) throw new Error(String(receipt.error));
    return result({
      ...receipt,
      root,
      draft: true,
      notice: REPORT_DRAFT_NOTICE,
      evidence: evidence.length,
      sectionsProvided: Object.keys(sections).length,
    });
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`Python 运行时不可用：${command}`);
    if (error?.killed || /timed out/iu.test(String(error?.message))) {
      throw new Error("报告生成超时：请减少资料数量或缩小目录范围后重试");
    }
    throw error;
  } finally {
    await unlink(specPath).catch(() => undefined);
  }
}

function reportScript() {
  return path.join(SCRIPT_DIR, "report-docx.py");
}

function feishuBase() {
  return validateServiceEndpoint({ raw: env("FEISHU_BASE_URL", "https://open.feishu.cn/open-apis"), label: "FEISHU_BASE_URL", defaults: ["open.feishu.cn"], overrideEnv: "FEISHU_ALLOWED_HOSTS" });
}

let feishuTokenCache;
async function feishuToken() {
  const direct = env("FEISHU_TENANT_ACCESS_TOKEN");
  if (direct) return direct;
  if (feishuTokenCache) return feishuTokenCache;
  const appId = env("FEISHU_APP_ID");
  const appSecret = env("FEISHU_APP_SECRET");
  if (!appId || !appSecret) throw new Error("FEISHU_TENANT_ACCESS_TOKEN or FEISHU_APP_ID/FEISHU_APP_SECRET is required");
  const data = await requestJson({
    url: joinUrl(feishuBase(), "/auth/v3/tenant_access_token/internal"),
    label: "Feishu tenant token",
    method: "POST",
    body: { app_id: appId, app_secret: appSecret },
  });
  if (!data.tenant_access_token) throw new Error("Feishu tenant token response is missing a token");
  feishuTokenCache = data.tenant_access_token;
  return feishuTokenCache;
}

async function feishuListApprovals(args) {
  const data = await requestJson({
    url: queryUrl(feishuBase(), "/approval/v4/instances", { approval_code: args.approvalCode, start_time: args.startTime, end_time: args.endTime, page_size: Math.min(Number(args.pageSize) || 20, 100), page_token: args.pageToken }),
    label: "Feishu approval list",
    token: await feishuToken(),
  });
  return result(data);
}

async function feishuGetApproval(args) {
  const instanceCode = String(args.instanceCode ?? "").trim();
  if (!instanceCode) throw new Error("instanceCode is required");
  const data = await requestJson({
    url: joinUrl(feishuBase(), `/approval/v4/instances/${encodeURIComponent(instanceCode)}`),
    label: "Feishu approval instance",
    token: await feishuToken(),
  });
  return result(data);
}

async function feishuSendNotification(args) {
  if (!enabled("ANYONG_FEISHU_WRITE_ENABLED")) return fail("Feishu notifications are disabled; set ANYONG_FEISHU_WRITE_ENABLED=1 in an explicitly approved environment");
  if (args.confirm !== true) return fail("This sends an external Feishu message. Re-run with confirm=true after user approval.");
  const receiveId = String(args.receiveId ?? "").trim();
  const text = String(args.text ?? "").trim();
  if (!receiveId || !text) throw new Error("receiveId and text are required");
  const data = await requestJson({
    url: queryUrl(feishuBase(), "/im/v1/messages", { receive_id_type: args.receiveIdType || "open_id" }),
    label: "Feishu notification",
    method: "POST",
    token: await feishuToken(),
    headers: { "Content-Type": "application/json" },
    body: { receive_id: receiveId, msg_type: "text", content: JSON.stringify({ text: truncate(text, 4_000) }) },
  });
  return result(data);
}

function importRoot() {
  return path.resolve(env("ANYONG_IMPORT_ROOT", process.cwd()));
}

function sheetEngineScript() {
  return path.join(SCRIPT_DIR, "sheet-engine.py");
}

/** Resolve the bundled Python runtime without guessing a system interpreter. */
export function sheetPythonCommand() {
  const configured = env("ANYONG_SHEET_PYTHON") || env("ANYONG_PYTHON_COMMAND");
  if (!configured) {
    throw new Error("未找到表格计算用的 Python 运行时：请设置 ANYONG_SHEET_PYTHON（桌面端默认使用随包 Python）。");
  }
  return configured;
}

export function sheetCacheDir() {
  return path.resolve(env("ANYONG_SHEET_CACHE_DIR", path.join(tmpdir(), "anyong-sheet-cache")));
}

export function sheetMemoryLimit() {
  return env("ANYONG_SHEET_MEMORY_LIMIT", "512MB");
}

export function sheetCellBudget() {
  return positiveInt("ANYONG_SHEET_CELL_BUDGET", 10_000_000);
}

export function sheetExtensionDirectory() {
  return env("ANYONG_DUCKDB_EXTENSION_DIR", "");
}

async function sheetRun(request) {
  const script = sheetEngineScript();
  if (!statSync(script, { throwIfNoEntry: false })?.isFile()) {
    throw new Error("表格引擎脚本缺失，请重新安装应用");
  }
  const command = sheetPythonCommand();
  const timeoutMs = positiveInt("ANYONG_SHEET_TIMEOUT_MS", SHEET_TOOL_TIMEOUT_MS);
  const requestFile = path.join(tmpdir(), `anyong-sheet-${randomUUID()}.json`);
  await writeFile(requestFile, JSON.stringify(request), { encoding: "utf8", mode: 0o600 });
  try {
    let stdout = "";
    try {
      ({ stdout } = await execFileAsync(command, [script, requestFile], {
        timeout: timeoutMs,
        windowsHide: true,
        maxBuffer: 16 * 1024 * 1024,
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8", PYTHONDONTWRITEBYTECODE: "1" },
      }));
    } catch (error) {
      if (error?.code === "ENOENT") throw new Error(`Python 运行时不可用：${command}`);
      const text = String(error?.stdout ?? "").trim();
      const line = text.split(/\r?\n/u).filter(Boolean).at(-1);
      if (line) {
        try {
          const parsed = JSON.parse(line);
          if (parsed?.error) throw new Error(String(parsed.error));
        } catch (parseError) {
          if (parseError instanceof SyntaxError) throw new Error(line);
          throw parseError;
        }
      }
      if (error?.killed || /timed out/iu.test(String(error?.message))) {
        throw new Error(`表格计算超过 ${Math.round(timeoutMs / 1000)}s：请缩小范围、先转 CSV，或调高 ANYONG_SHEET_TIMEOUT_MS`);
      }
      throw new Error(lastErrorLine(`${error?.stderr ?? ""}${error?.message ?? ""}`) || "表格引擎执行失败");
    }
    const line = String(stdout ?? "").trim().split(/\r?\n/u).filter(Boolean).at(-1);
    if (!line) throw new Error("表格引擎没有返回结果");
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error("表格引擎返回了无效结果");
    }
    if (!parsed?.ok) throw new Error(String(parsed?.error || "表格引擎执行失败"));
    return parsed;
  } finally {
    await unlink(requestFile).catch(() => undefined);
  }
}

function sheetRequest(args, operation) {
  const file = resolveOfficePath(args.path, officeRoots(), { mustExist: true });
  return {
    operation,
    path: file,
    sheet: typeof args.sheet === "string" && args.sheet.trim() ? args.sheet.trim() : undefined,
    range: typeof args.range === "string" && args.range.trim() ? args.range.trim() : undefined,
    sql: typeof args.sql === "string" && args.sql.trim() ? args.sql.trim() : undefined,
    maxRows: args.maxRows ? Math.max(1, Math.min(Number(args.maxRows), sheetRowLimit())) : undefined,
    limit: args.limit ? Math.max(1, Math.min(Number(args.limit), sheetRowLimit())) : undefined,
    cacheDir: sheetCacheDir(),
    memoryLimit: sheetMemoryLimit(),
    threads: positiveInt("ANYONG_SHEET_THREADS", 2),
    cellBudget: sheetCellBudget(),
    reader: env("ANYONG_SHEET_READER", "") || undefined,
    fallback: env("ANYONG_SHEET_FALLBACK", "") || undefined,
    extensionDirectory: sheetExtensionDirectory() || undefined,
  };
}

async function safeImportPath(rawPath) {
  const candidate = path.resolve(importRoot(), String(rawPath ?? ""));
  const root = await realpath(importRoot());
  const lexicalRelative = path.relative(root, candidate);
  if (lexicalRelative.startsWith("..") || path.isAbsolute(lexicalRelative)) throw new Error("document path must stay inside ANYONG_IMPORT_ROOT");
  let resolved;
  try {
    resolved = await realpath(candidate);
  } catch (error) {
    if (error?.code === "ENOENT") throw new Error(`ENOENT: no such file or directory, realpath '${candidate}'`);
    throw error;
  }
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("document path must stay inside ANYONG_IMPORT_ROOT");
  const info = await stat(resolved);
  if (!info.isFile()) throw new Error("document path must point to a regular file");
  const limit = importMaxBytes();
  if (info.size > limit) {
    throw new Error(
      `文件 ${path.basename(resolved)} 有 ${Math.ceil(info.size / 1024 / 1024)}MB，超过当前上限 ${Math.ceil(limit / 1024 / 1024)}MB。`
      + "请拆分工作表或转成 CSV 后重试；如需处理更大的文件，请设置 ANYONG_IMPORT_MAX_BYTES 或改用 sheet_aggregate。",
    );
  }
  return { path: resolved, info };
}

function decodeXml(value) {
  return value.replace(/<[^>]+>/gu, " ").replace(/&amp;/gu, "&").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">").replace(/&quot;/gu, '"').replace(/&#39;/gu, "'").replace(/\s+/gu, " ").trim();
}

function unzipEntries(buffer) {
  const entries = [];
  let cursor = 0;
  while (cursor + 4 <= buffer.length) {
    const signature = buffer.readUInt32LE(cursor);
    if (signature !== 0x04034b50) break;
    const method = buffer.readUInt16LE(cursor + 8);
    const compressedSize = buffer.readUInt32LE(cursor + 18);
    const nameLength = buffer.readUInt16LE(cursor + 26);
    const extraLength = buffer.readUInt16LE(cursor + 28);
    const name = buffer.toString("utf8", cursor + 30, cursor + 30 + nameLength);
    const start = cursor + 30 + nameLength + extraLength;
    const end = start + compressedSize;
    if (end > buffer.length) break;
    entries.push({ name, method, data: buffer.subarray(start, end) });
    cursor = end;
  }
  return entries;
}

async function inflateRaw(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return Buffer.from(await new Response(stream).arrayBuffer());
}

async function extractOfficeText(filePath) {
  const entries = unzipEntries(await readFile(filePath));
  const xmlEntries = entries.filter((entry) => /\.(xml|rels)$/iu.test(entry.name) && (entry.name.startsWith("word/") || entry.name.startsWith("xl/") || entry.name.startsWith("ppt/")));
  const chunks = [];
  for (const entry of xmlEntries) {
    const bytes = entry.method === 8 ? await inflateRaw(entry.data) : entry.data;
    const text = decodeXml(bytes.toString("utf8"));
    if (text) chunks.push(text);
  }
  return chunks.join("\n");
}

const SPREADSHEET_EXTENSIONS = new Set([".xlsx", ".xlsm", ".xls", ".xlsb", ".ods"]);
// Below this size the legacy in-process OOXML reader is acceptable; above it the
// unzip path can allocate gigabytes, so the engine is required instead.
const LEGACY_SPREADSHEET_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Resolve the OfficeCLI launcher without downloading or installing anything.
 * ANYONG_OFFICECLI_COMMAND belongs to the MCP transport (it may be the Node
 * runtime), so the reader only honours the dedicated launcher override.
 */
export function officeCliInvocation() {
  const configured = env("ANYONG_OFFICECLI_LAUNCHER");
  if (configured) return { command: process.execPath, prefix: [configured] };
  const launchers = [
    path.resolve(SCRIPT_DIR, "..", "node_modules", "@officecli", "officecli", "officecli.js"),
    path.resolve(SCRIPT_DIR, "node_modules", "@officecli", "officecli", "officecli.js"),
  ];
  for (const launcher of launchers) {
    if (existsSync(launcher)) return { command: process.execPath, prefix: [launcher] };
  }
  return { command: "officecli", prefix: [] };
}

function lastErrorLine(value) {
  return String(value ?? "")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1) ?? "";
}

export function spreadsheetOversizeMessage(filePath, detail = "") {
  const megabytes = Math.ceil(statSync(filePath, { throwIfNoEntry: false })?.size ?? 0) / (1024 * 1024);
  return `表格 ${path.basename(filePath)}（约 ${Math.max(1, Math.round(megabytes))}MB）超过 OfficeCLI 引擎上限（约 ${OFFICECLI_ELEMENT_LIMIT.toLocaleString("en-US")} 个 XML 元素，约 40 万单元格）。`
    + "请改用 sheet_profile / sheet_query 指定工作表或范围，或用 sheet_aggregate 直接统计，不要整表读进上下文。"
    + (detail ? `引擎原始信息：${lastErrorLine(detail)}` : "");
}

/** Read a bounded text window from a workbook through the Rust OfficeCLI engine. */
async function extractSpreadsheetText(filePath, args = {}) {
  const maxLines = Math.max(1, Math.min(Number(args.maxLines) || DEFAULT_SHEET_TEXT_LINES, 5000));
  const sheet = typeof args.sheet === "string" ? args.sheet.trim() : "";
  const range = typeof args.range === "string" ? args.range.trim() : "";
  const invocation = officeCliInvocation();
  const commandArgs = [...invocation.prefix, "view", filePath, "text"];
  if (range) {
    commandArgs.push("--range", sheet && !range.includes("!") ? `${sheet}!${range}` : range);
  } else {
    commandArgs.push("--max-lines", String(maxLines));
  }
  try {
    const { stdout } = await execFileAsync(invocation.command, commandArgs, {
      timeout: 120_000,
      windowsHide: true,
      maxBuffer: 8 * 1024 * 1024,
    });
    const text = String(stdout ?? "").trim();
    if (!text) throw new Error("OfficeCLI 没有返回表格内容，请确认工作表和范围是否正确");
    return { text, engine: "officecli", sheet: sheet || null, range: range || null, maxLines };
  } catch (error) {
    const detail = `${error?.stdout ?? ""}\n${error?.stderr ?? ""}\n${error?.message ?? ""}`.trim();
    if (/3,000,000|XML elements/iu.test(detail)) throw new Error(spreadsheetOversizeMessage(filePath, detail));
    if (error?.code === "ENOENT") return null;
    if (/timed out/iu.test(detail)) throw new Error(`读取表格超时：${path.basename(filePath)} 太大或工作表过多，请用 --range 指定范围`);
    throw new Error(`读取表格失败：${lastErrorLine(detail) || "未知错误"}`);
  }
}

async function runCommand(command, args, timeoutMs = 60_000) {
  try {
    const output = await execFileAsync(command, args, { timeout: timeoutMs, maxBuffer: MAX_LOG_CHARS * 2, windowsHide: true });
    return `${output.stdout ?? ""}${output.stderr ? `\n${output.stderr}` : ""}`.trim();
  } catch (error) {
    const message = error?.killed ? `command timed out after ${timeoutMs}ms` : "command failed";
    throw new Error(message);
  }
}

async function extractDocument(args) {
  const file = await safeImportPath(args.path);
  const extension = path.extname(file.path).toLowerCase();
  let text = "";
  let engine = extension;
  let extra = {};
  if ([".txt", ".md", ".csv", ".json", ".log", ".yaml", ".yml"].includes(extension)) {
    text = (await readFile(file.path, "utf8")).slice(0, MAX_LOG_CHARS);
  } else if (SPREADSHEET_EXTENSIONS.has(extension)) {
    const extracted = await extractSpreadsheetText(file.path, args);
    if (extracted) {
      text = extracted.text;
      engine = extracted.engine;
      extra = { sheet: extracted.sheet, range: extracted.range, maxLines: extracted.maxLines };
    } else if (file.info.size <= LEGACY_SPREADSHEET_MAX_BYTES) {
      text = await extractOfficeText(file.path);
      engine = "ooxml-fallback";
    } else {
      throw new Error(`未找到 OfficeCLI 表格引擎，而该文件有 ${Math.ceil(file.info.size / 1024 / 1024)}MB，无法用内置解压路径安全读取。`
        + "请安装 OfficeCLI 或设置 ANYONG_OFFICECLI_COMMAND，或改用 sheet_aggregate 做统计。");
    }
  } else if ([".docx", ".pptx"].includes(extension)) {
    text = await extractOfficeText(file.path);
  } else if (extension === ".pdf") {
    try {
      text = await runCommand(env("ANYONG_PDFTOTEXT_COMMAND", "pdftotext"), ["-layout", file.path, "-"], 60_000);
    } catch {
      text = "";
    }
  }
  if (!text && args.ocr === true && env("ANYONG_OCR_COMMAND")) {
    const rawArgs = JSON.parse(env("ANYONG_OCR_ARGS_JSON", '["{{file}}"]'));
    text = await runCommand(env("ANYONG_OCR_COMMAND"), rawArgs.map((item) => String(item).replaceAll("{{file}}", file.path)), 120_000);
  }
  if (!text) throw new Error(`no text extractor available for ${extension || "this file type"}`);
  return result({ path: file.path, bytes: file.info.size, mime: extension, engine, ...extra, text: truncate(text, MAX_LOG_CHARS), truncated: text.length > MAX_LOG_CHARS });
}

async function ingestWeKnora(args) {
  if (!enabled("ANYONG_WEKNORA_INGEST_ENABLED")) return fail("WeKnora ingestion is disabled; set ANYONG_WEKNORA_INGEST_ENABLED=1 in an explicitly approved environment");
  if (args.confirm !== true) return fail("This uploads a document to WeKnora. Re-run with confirm=true after user approval.");
  const file = await safeImportPath(args.path);
  const endpointRaw = env("WEKNORA_INGEST_URL");
  if (!endpointRaw) throw new Error("WEKNORA_INGEST_URL is required for ingestion");
  const endpoint = validateServiceEndpoint({
    raw: endpointRaw,
    label: "WEKNORA_INGEST_URL",
    defaults: ["localhost", "127.0.0.1", "[::1]"],
    overrideEnv: "WEKNORA_ALLOWED_HOSTS",
    allowLocalHttp: true,
  });
  const knowledgeBaseId = String(args.knowledgeBaseId ?? "").trim();
  if (!knowledgeBaseId) throw new Error("knowledgeBaseId is required");
  const configuredIds = env("WEKNORA_KNOWLEDGE_BASE_IDS").split(",").map((id) => id.trim()).filter(Boolean);
  if (configuredIds.length > 0 && !configuredIds.includes(knowledgeBaseId)) throw new Error("knowledgeBaseId is outside the configured WeKnora allowlist");
  const form = new FormData();
  form.append("file", new Blob([await readFile(file.path)]), path.basename(file.path));
  form.append("knowledge_base_id", knowledgeBaseId);
  if (args.title) form.append("title", truncate(String(args.title), 240));
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);
  try {
    await assertNetworkUrlAllowed(endpoint, networkMode());
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      redirect: "manual",
      headers: {
        ...(env("WEKNORA_API_KEY") ? { "X-API-Key": env("WEKNORA_API_KEY") } : {}),
        ...(env("WEKNORA_TENANT_ID") ? { "X-Tenant-ID": env("WEKNORA_TENANT_ID") } : {}),
        Accept: "application/json",
      },
      body: form,
    });
    const location = response.headers.get("location");
    if (location) await assertNetworkUrlAllowed(new URL(location, endpoint), networkMode());
    if (!response.ok) throw new Error(`WeKnora ingestion failed (HTTP ${response.status})`);
    const text = await response.text();
    let payload;
    try { payload = text ? JSON.parse(text) : {}; } catch { payload = { status: "accepted" }; }
    return result({ path: file.path, bytes: file.info.size, response: payload });
  } catch (error) {
    if (error?.name === "AbortError") throw new Error("WeKnora ingestion timed out after 120000ms");
    if (error instanceof Error && error.message.startsWith("WeKnora ingestion")) throw error;
    throw new Error("WeKnora ingestion failed: network error");
  } finally {
    clearTimeout(timeout);
  }
}

function commonSchemas() {
  return {
    owner: z.string(),
    repo: z.string(),
    state: z.enum(["open", "closed", "all"]).optional(),
    page: z.number().int().min(1).max(100).optional(),
    limit: z.number().int().min(1).max(100).optional(),
  };
}

function createServer(scope = "all") {
  const server = new McpServer({ name: "anyong-integrations", version: "0.1.0" });
  const github = scope === "all" || scope === "github";
  const cnb = scope === "all" || scope === "cnb";
  const sentry = scope === "all" || scope === "sentry";
  const feishu = scope === "all" || scope === "feishu";
  const documents = scope === "all" || scope === "documents";
  const office = scope === "all" || scope === "office";
  const altium = scope === "all" || scope === "altium";
  const sheets = scope === "all" || scope === "sheets";
  const report = scope === "all" || scope === "report";

  if (github) {
    server.registerTool("github_search_code", { description: "Read-only GitHub code search", inputSchema: { query: z.string(), limit: z.number().int().min(1).max(50).optional() } }, async (args) => githubSearchCode(args));
    server.registerTool("github_list_issues", { description: "Read-only GitHub issue listing", inputSchema: commonSchemas() }, async (args) => githubListIssues(args));
    server.registerTool("github_list_pull_requests", { description: "Read-only GitHub pull request listing", inputSchema: commonSchemas() }, async (args) => githubListPulls(args));
    server.registerTool("github_get_issue", { description: "Read-only GitHub issue details", inputSchema: { ...commonSchemas(), number: z.number().int().min(1) } }, async (args) => githubGetIssue(args));
    server.registerTool("github_get_pull_request", { description: "Read-only GitHub pull request details", inputSchema: { ...commonSchemas(), number: z.number().int().min(1) } }, async (args) => githubGetIssue(args, "pulls"));
    server.registerTool("github_get_pull_request_files", { description: "Read-only GitHub pull request changed files", inputSchema: { ...commonSchemas(), number: z.number().int().min(1) } }, async (args) => githubGetPullFiles(args));
  }
  if (cnb) {
    server.registerTool("cnb_get_builds", { description: "Read-only CNB build status and pipeline metadata", inputSchema: { slug: z.string().optional(), branch: z.string().optional(), page: z.number().int().min(1).optional(), limit: z.number().int().min(1).max(100).optional() } }, async (args) => cnbGetBuilds(args));
    server.registerTool("cnb_get_build_logs", { description: "Read-only CNB build logs with bounded output", inputSchema: { slug: z.string().optional(), pipelineId: z.string(), jobId: z.string().optional() } }, async (args) => cnbGetBuildLogs(args));
    server.registerTool("cnb_analyze_failure", { description: "Analyze supplied or fetched CNB logs without performing any write", inputSchema: { logs: z.string().optional(), slug: z.string().optional(), pipelineId: z.string().optional(), jobId: z.string().optional() } }, async (args) => cnbAnalyzeFailure(args));
  }
  if (sentry) {
    server.registerTool("sentry_list_issues", { description: "Read-only Sentry issue listing", inputSchema: { organization: z.string().optional(), project: z.string().optional(), query: z.string().optional(), sort: z.string().optional(), statsPeriod: z.string().optional(), limit: z.number().int().min(1).max(100).optional() } }, async (args) => sentryListIssues(args));
    server.registerTool("sentry_get_issue_events", { description: "Read-only Sentry issue events", inputSchema: { issueId: z.string(), limit: z.number().int().min(1).max(100).optional() } }, async (args) => sentryIssueEvents(args));
    server.registerTool("sentry_search_events", { description: "Read-only Sentry event search", inputSchema: { organization: z.string().optional(), query: z.string(), project: z.string().optional(), field: z.string().optional(), statsPeriod: z.string().optional(), limit: z.number().int().min(1).max(100).optional() } }, async (args) => sentrySearchEvents(args));
  }
  if (report) {
    const reportCommon = { root: z.string(), maxFiles: z.number().int().min(1).max(200).optional() };
    server.registerTool("report_scan_sources", {
      description: "Scan a local folder or mapped SMB share for referenceable evidence files; read-only and bounded",
      inputSchema: reportCommon,
      annotations: { readOnlyHint: true },
    }, async (args) => reportScanSources(args));
    server.registerTool("report_generate_docx", {
      description: "Generate a failure-analysis draft DOCX entirely offline from a local folder plus the six narrative sections; the output is always marked as an unsigned draft",
      inputSchema: {
        ...reportCommon,
        output: z.string(),
        title: z.string().max(200).optional(),
        project: z.record(z.string(), z.string().max(500)).optional(),
        sections: z.record(z.string(), z.string().max(12000)).optional(),
        gaps: z.array(z.string().max(500)).max(20).optional(),
        includeEvidence: z.boolean().optional(),
        overwrite: z.boolean().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false },
    }, async (args) => reportGenerateDocx(args));
  }
  if (feishu) {
    server.registerTool("feishu_list_approvals", { description: "Read-only Feishu approval instance listing", inputSchema: { approvalCode: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional(), pageSize: z.number().int().min(1).max(100).optional(), pageToken: z.string().optional() } }, async (args) => feishuListApprovals(args));
    server.registerTool("feishu_get_approval", { description: "Read-only Feishu approval instance details", inputSchema: { instanceCode: z.string() } }, async (args) => feishuGetApproval(args));
    server.registerTool("feishu_send_notification", { description: "Send a Feishu notification only after explicit confirmation", inputSchema: { receiveId: z.string(), receiveIdType: z.string().optional(), text: z.string(), confirm: z.boolean().optional() }, annotations: { destructiveHint: true, readOnlyHint: false } }, async (args) => feishuSendNotification(args));
  }
  if (documents) {
    server.registerTool("document_extract_text", {
      description: "Extract bounded text from PDF, Office, or OCR-enabled documents inside the workspace. Spreadsheets are read through the Rust OfficeCLI engine with an optional sheet/range window instead of loading the whole workbook.",
      inputSchema: {
        path: z.string(),
        ocr: z.boolean().optional(),
        sheet: z.string().optional().describe("工作表名；不填时由引擎选择"),
        range: z.string().optional().describe("单元格范围，例如 A1:H50；不填时读取前 maxLines 行"),
        maxLines: z.number().int().min(1).max(5000).optional().describe("不指定 range 时最多返回的行数，默认 200"),
      },
    }, async (args) => extractDocument(args));
    server.registerTool("weknora_ingest_document", { description: "Upload a validated document to WeKnora only after explicit confirmation", inputSchema: { path: z.string(), knowledgeBaseId: z.string(), title: z.string().optional(), confirm: z.boolean().optional() }, annotations: { destructiveHint: true, readOnlyHint: false } }, async (args) => ingestWeKnora(args));
  }
  if (office) {
    const officeCommon = {
      app: z.enum(["auto", "word", "excel", "powerpoint", "wps-writer", "wps-spreadsheet", "wps-presentation"]).optional(),
      vendor: z.enum(["auto", "microsoft", "wps"]).optional(),
    };
    server.registerTool("office_status", { description: "Detect installed Microsoft Office and WPS applications", inputSchema: {} }, async () => {
      try { return result(await officeRun("status")); } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
    server.registerTool("office_open", { description: "Open a document in Microsoft Office or WPS and leave the application running", inputSchema: { ...officeCommon, path: z.string() }, annotations: { destructiveHint: false, readOnlyHint: false } }, async (args) => {
      try {
        const file = resolveOfficePath(args.path, officeRoots(), { mustExist: true });
        return result(await officeRun("open", { ...args, path: file, root: officeRoots()[0] }));
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
    server.registerTool("office_export_pdf", { description: "Open a document and export it to PDF through Microsoft Office or WPS in a private background instance; link prompts and recalculation stay off and leftover processes are killed", inputSchema: { ...officeCommon, path: z.string(), output: z.string().optional() }, annotations: { destructiveHint: false, readOnlyHint: false } }, async (args) => {
      try {
        const file = resolveOfficePath(args.path, officeRoots(), { mustExist: true });
        const output = args.output
          ? resolveOfficePath(args.output, officeRoots(), { mustExist: false })
          : file.replace(/\.[^.\\/]+$/u, ".pdf");
        if (!output.toLowerCase().endsWith(".pdf")) throw new Error("The PDF output path must end with .pdf");
        return result(await officeRun("export-pdf", { ...args, path: file, output, root: officeRoots()[0] }));
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
    server.registerTool("office_convert", { description: "Convert legacy .doc/.xls/.ppt documents to .docx/.xlsx/.pptx through installed Microsoft Office or WPS in a private background instance (never the user's open session); refuses to overwrite unless overwrite=true", inputSchema: { ...officeCommon, path: z.string(), output: z.string().optional(), overwrite: z.boolean().optional() }, annotations: { destructiveHint: false, readOnlyHint: false } }, async (args) => {
      try {
        const file = resolveOfficePath(args.path, officeRoots(), { mustExist: true });
        const target = officeConversionTarget(file);
        if (!target) throw new Error("office_convert supports only .doc, .xls, and .ppt source files");
        const output = args.output
          ? resolveOfficePath(args.output, officeRoots(), { mustExist: false })
          : path.join(path.dirname(file), `${path.basename(file, path.extname(file))}${target.extension}`);
        if (path.extname(output).toLowerCase() !== target.extension) throw new Error(`The output path must end with ${target.extension}`);
        if (existsSync(output) && args.overwrite !== true) throw new Error("Output already exists; set overwrite=true to replace it");
        return result(await officeRun("convert", { ...args, path: file, output, root: officeRoots()[0] }));
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
    server.registerTool("office_save", { description: "Save a document that is currently open in Microsoft Office or WPS", inputSchema: { ...officeCommon, path: z.string() }, annotations: { destructiveHint: false, readOnlyHint: false } }, async (args) => {
      try {
        const file = resolveOfficePath(args.path, officeRoots(), { mustExist: true });
        return result(await officeRun("save", { ...args, path: file, root: officeRoots()[0] }));
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
    server.registerTool("office_close", { description: "Close a document that is currently open in Microsoft Office or WPS", inputSchema: { ...officeCommon, path: z.string(), save: z.boolean().optional() }, annotations: { destructiveHint: true, readOnlyHint: false } }, async (args) => {
      try {
        const file = resolveOfficePath(args.path, officeRoots(), { mustExist: true });
        return result(await officeRun("close", { ...args, path: file, root: officeRoots()[0] }));
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
  }
  if (sheets) {
    const sheetCommon = { path: z.string().describe("工作区内的 xlsx/xlsm/xls/ods 路径") };
    server.registerTool("sheet_profile", {
      description: "Profile a workbook without loading it into memory: sheet names, header row, sampled column types, null counts and warnings. Use this before any large spreadsheet analysis.",
      inputSchema: { ...sheetCommon, sheet: z.string().optional(), maxRows: z.number().int().min(1).max(200).optional() },
    }, async (args) => {
      try { return result(await sheetRun(sheetRequest(args, "profile"))); } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
    server.registerTool("sheet_query", {
      description: "Read a bounded cell window (sheet plus A1 range) from a workbook with bounded rows. Use it for spot checks instead of dumping a whole sheet.",
      inputSchema: { ...sheetCommon, sheet: z.string().optional(), range: z.string().optional(), maxRows: z.number().int().min(1).optional(), limit: z.number().int().min(1).optional() },
    }, async (args) => {
      try { return result(await sheetRun(sheetRequest(args, "query"))); } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
    server.registerTool("sheet_aggregate", {
      description: "Aggregate a whole worksheet with read-only SQL over the table `data` (for example SELECT 部门, SUM(借方) FROM data GROUP BY 1). Only the result rows leave the engine, so million-row workbooks never enter the model context. Workbooks above the cell budget are read through the bundled duckdb excel extension, and are refused with guidance instead of crawling through Python when that extension is missing.",
      inputSchema: {
        ...sheetCommon,
        sheet: z.string().optional(),
        sql: z.string().optional().describe("只读 SELECT/WITH 查询，表名固定为 data；不填时返回前 limit 行样本"),
        limit: z.number().int().min(1).optional().describe("最多返回的行数"),
      },
    }, async (args) => {
      try { return result(await sheetRun(sheetRequest(args, "aggregate"))); } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
  }
  if (altium) {
    server.registerTool("altium_status", { description: "Detect Altium Designer and the bundled DelphiScript bridge", inputSchema: {} }, async () => {
      try { return result(altiumStatusValue()); } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
    server.registerTool("altium_install_scripts", { description: "Install or refresh the bundled Altium DelphiScript bridge", inputSchema: {} }, async () => {
      try {
        if (process.platform !== "win32") throw new Error("Altium Designer control is available only on Windows");
        await secureAltiumDirectory(altiumScriptRoot());
        const exchange = altiumExchangeDir();
        await secureAltiumDirectory(exchange);
        const lockPath = path.join(exchange, "request.lock");
        const lock = acquireAltiumLock(lockPath);
        try {
          writeFileSync(lock, JSON.stringify({ pid: process.pid, requestId: randomUUID(), phase: "prepared", startedAt: new Date().toISOString() }), {
            encoding: "utf8",
            mode: 0o600,
          });
          const scriptDir = ensureAltiumScripts({ force: true });
          return result({ ...altiumStatusValue(), scriptDir, installed: true });
        } finally {
          closeSync(lock);
          rmSync(lockPath, { force: true });
        }
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
    server.registerTool("altium_open_project", { description: "Open an Altium project in Altium Designer", inputSchema: { path: z.string() }, annotations: { destructiveHint: false, readOnlyHint: false } }, async (args) => {
      try {
        if (process.platform !== "win32") throw new Error("Altium Designer control is available only on Windows");
        const file = resolveOfficePath(args.path, officeRoots(), { mustExist: true });
        if (!/\.(?:PrjPcb|PrjScr|SchDoc|PcbDoc|SchLib|PcbLib)$/iu.test(file)) throw new Error("Unsupported Altium project or document extension");
        const executable = altiumFindExecutable();
        await launchAltium(executable, [file]);
        return result({ opened: file, executable });
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
    server.registerTool("altium_run_command", {
      description: "Run an audited Altium bridge command. Read commands are safe; write commands require confirm=true after user approval.",
      inputSchema: {
        command: z.string().describe("Bridge command name, for example get_project_info, get_project_components, get_erc_violations, run_output_jobs"),
        params: z.record(z.string(), z.unknown()).optional(),
        confirm: z.boolean().optional(),
      },
      annotations: { destructiveHint: true, readOnlyHint: false },
    }, async (args) => {
      try {
        const kind = altiumCommandKind(args.command);
        if (kind === "unsupported") throw new Error(`Unsupported Altium bridge command: ${args.command}`);
        if (["command", "confirm", "requestId"].some((key) => Object.hasOwn(args.params ?? {}, key))) {
          throw new Error("Altium params must not override command, confirm or requestId");
        }
        return result(await altiumRunCommand(args.command, { ...(args.params ?? {}), ...(args.confirm ? { confirm: true } : {}) }));
      } catch (error) { return fail(error instanceof Error ? error.message : String(error)); }
    });
  }
  server.registerTool("integration_status", { description: "Show enabled integration scopes without exposing credentials", inputSchema: {} }, async () => result({ scope, github: Boolean(github), cnb: Boolean(cnb), sentry: Boolean(sentry), feishu: Boolean(feishu), documents: Boolean(documents), office: Boolean(office), altium: Boolean(altium), sheets: Boolean(sheets), report: Boolean(report), writes: { feishu: enabled("ANYONG_FEISHU_WRITE_ENABLED"), weknoraIngest: enabled("ANYONG_WEKNORA_INGEST_ENABLED") } }));
  return server;
}

export async function startIntegrationsMcp(scope = env("ANYONG_INTEGRATIONS_SCOPE", "all")) {
  const server = createServer(scope);
  await server.connect(new StdioServerTransport());
}

export {
  cnbGetBuildLogs,
  reportEvidenceFiles,
  reportGenerateDocx,
  reportPath,
  reportPythonCommand,
  reportScanSources,
  reportSections,
  reportSpec,
  sheetRequest,
  sheetRun,
  cnbGetBuilds,
  officeRun,
  extractDocument,
  feishuSendNotification,
  githubListIssues,
  githubGetPullFiles,
  githubSearchCode,
  ingestWeKnora,
  sentryListIssues,
};

if (path.resolve(process.argv[1] ?? "") === path.resolve(fileURLToPath(import.meta.url))) {
  await startIntegrationsMcp(process.argv.find((arg) => arg.startsWith("--scope="))?.slice("--scope=".length) || env("ANYONG_INTEGRATIONS_SCOPE", "all"));
}
