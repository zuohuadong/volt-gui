import { app, BrowserWindow, dialog, ipcMain, Menu, session, shell } from "electron";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  bundledDshModelEnvironment,
  migrateLegacyDshCredentials,
  OfficialDshRuntime,
  provisionBundledDshCredential,
  resolveOfficialDshBin,
  resolveOfficialDshVersion,
  rethrowUnlessBrokenPipe,
  startOfficialDshWithRetry,
} from "./official-dsh-runtime.js";
import { resolveElectronProfile } from "./electron-profile.js";
import { DshRemoteClient, type DshRemoteEvent } from "./dsh-remote-client.js";
import { isAllowedExternalUrl, isAllowedNavigationUrl, isTrustedIpcSenderUrl } from "./renderer-security.js";
import { applyAssistantStreamFrame, normalizeSessionSnapshot, type AssistantAttempt, type HistoryEntry } from "./session-follow.js";
import { createSingleFlight } from "./single-flight.js";
import { SmbMountManager } from "./smb-mounts.js";
import { DesktopErrorCode, desktopError, desktopErrorMessage } from "./desktop-error.ts";

const electronProfile = resolveElectronProfile();
app.setName(electronProfile.executableName);
const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const desktopRoot = path.resolve(moduleDir, "..");
const gotSingleInstanceLock = app.requestSingleInstanceLock();

function desktopAppVersion(): string {
  if (app.isPackaged) return app.getVersion();
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(desktopRoot, "package.json"), "utf8")) as { version?: unknown };
    if (typeof packageJson.version === "string" && packageJson.version.trim()) return packageJson.version.trim();
  } catch (error) {
    console.warn("[Electron] Failed to read the desktop package version", error);
  }
  return app.getVersion();
}

const allowedDshMethods = new Set([
  "session.list", "session.search", "session.create", "session.history", "session.prompt",
  "session.cancel", "session.models", "session.selectModel", "session.rename", "session.fork",
  "session.updateQueue", "workspace.list", "workspace.create",
  "workspace.rename", "workspace.delete", "workspace.insertBefore", "workspace.insertSessionBefore",
  "workspace.archiveSession", "host.describe", "host.listDirectory", "host.createDirectory", "host.openPath",
  "agentPreset.list", "agentPreset.select", "agentPreset.read", "agentPreset.copy", "agentPreset.openDocument", "agentPreset.remove",
  "subagent.list", "subagent.history", "subagent.prompt", "subagent.interrupt",
  "goal.create", "goal.edit", "goal.pause",
  "goal.resume", "goal.complete", "goal.clear", "settings.describe", "settings.openDocument",
  "settings.update", "credentials.describe",
  "credentials.set", "credentials.unset", "llm.providers", "llm.models", "llm.discoverModels", "skill.list",
  "fileReferences/list", "sessionReferenceResolver/candidates", "pluginInventory/list",
]);

process.stdout.on("error", rethrowUnlessBrokenPipe);
process.stderr.on("error", rethrowUnlessBrokenPipe);

let mainWindow: BrowserWindow | null = null;
let dshRuntime: OfficialDshRuntime | null = null;
let dshClient: DshRemoteClient | null = null;
let quitting = false;
let stoppingRuntime: OfficialDshRuntime | null = null;
let dshEventController: AbortController | null = null;
const pendingRemoteEvents = new Map<string, { sessionId: string; kind: "approval" | "question"; clientId: string }>();
const sessionFollowControllers = new Map<string, AbortController>();
let smbMountManager: SmbMountManager | null = null;
let runtimeStartPromise: Promise<void> | null = null;
let runtimeStartController: AbortController | null = null;
let desktopBootstrap = {
  dshReady: false,
  productName: electronProfile.productName,
  version: desktopAppVersion(),
  workspace: os.homedir(),
  startupError: "",
};

app.setAppUserModelId(electronProfile.appId);
Menu.setApplicationMenu(null);

function canonicalWorkspace(candidate: string | undefined): string {
  const requested = candidate?.trim() || os.homedir();
  try {
    const canonical = fs.realpathSync(path.resolve(requested));
    if (fs.statSync(canonical).isDirectory()) return canonical;
  } catch (error) {
    console.warn(`[Electron] DSH workspace is unavailable: ${requested}`, error);
  }
  return fs.realpathSync(os.homedir());
}

function profilePatchPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "profiles", "anyong.yml")
    : path.resolve(desktopRoot, "..", "..", "profiles", "anyong.yml");
}

function dshHomePath(): string {
  return process.env.DSH_HOME?.trim() || path.join(app.getPath("userData"), "dsh");
}

function legacyDshHomePaths(): string[] {
  const appData = app.getPath("appData");
  return [
    path.join(appData, "voltui", "dsh"),
    path.join(appData, "@voltui", "desktop-electron", "dsh"),
    path.join(appData, "@anyong", "desktop-electron", "dsh"),
  ];
}

function smbConfigPath(): string {
  return path.join(app.getPath("userData"), "smb-mounts.json");
}

function requireSmbManager(): SmbMountManager {
  if (!smbMountManager) smbMountManager = new SmbMountManager({ configPath: smbConfigPath() });
  return smbMountManager;
}

function nodeRuntimePath(): string {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "node-runtime")
    : path.join(desktopRoot, ".node-runtime");
  return path.join(root, process.platform === "win32" ? "node.exe" : "node");
}

function browserSkillCliPath(): string {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "browser-skill-runtime")
    : path.join(desktopRoot, ".browser-skill-runtime");
  return path.join(root, process.platform === "win32" ? "bsk.exe" : "bsk");
}

function officeCliEntryPath(): string {
  const runtimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "dsh-runtime")
    : path.join(desktopRoot, ".dsh-runtime");
  return path.join(runtimeRoot, "node_modules", "@officecli", "officecli", "officecli.js");
}

function integrationsMcpScriptPath(): string {
  const runtimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "dsh-runtime")
    : path.join(desktopRoot, ".dsh-runtime");
  return path.join(runtimeRoot, "scripts", "anyong-integrations-mcp.mjs");
}

function browserSkillPluginPackagePath(): string {
  const runtimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "dsh-runtime")
    : path.join(desktopRoot, ".dsh-runtime");
  return path.join(runtimeRoot, "node_modules", "@wxg-prc-cpg", "browser-skill-dsh-plugin");
}

function weknoraPluginPackagePath(): string {
  const runtimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "dsh-runtime")
    : path.join(desktopRoot, ".dsh-runtime");
  return path.join(runtimeRoot, "node_modules", "@wxg-prc-cpg", "dsh-weknora");
}

function intranetAuthPluginPackagePath(): string {
  const runtimeRoot = app.isPackaged
    ? path.join(process.resourcesPath, "dsh-runtime")
    : path.join(desktopRoot, ".dsh-runtime");
  return path.join(runtimeRoot, "node_modules", "@voltui", "dsh-intranet-auth");
}

function frontendIndexPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "frontend", "index.html")
    : path.resolve(desktopRoot, "..", "desktop-frontend", "dist", "index.html");
}

function frontendEntryUrl(): string {
  return pathToFileURL(frontendIndexPath()).href;
}

function assertTrustedIpcSender(event: Electron.IpcMainInvokeEvent): void {
  const senderUrl = event.senderFrame?.url;
  if (!mainWindow || mainWindow.isDestroyed()
    || event.sender !== mainWindow.webContents
    || event.senderFrame !== mainWindow.webContents.mainFrame
    || !senderUrl
    || !isTrustedIpcSenderUrl(senderUrl, frontendEntryUrl())) {
    throw desktopError(DesktopErrorCode.UNTRUSTED_IPC, "拒绝来自非受信任前端入口的桌面 IPC 请求");
  }
}

type TrustedIpcHandler = (event: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown;

function handleTrustedIpc(channel: string, handler: TrustedIpcHandler): void {
  ipcMain.handle(channel, (event, ...args) => {
    assertTrustedIpcSender(event);
    return handler(event, ...args);
  });
}

function bundledModelCredentialsPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "bundled.env")
    : path.join(desktopRoot, "build", "bundled.env");
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1440,
    height: 940,
    minWidth: 960,
    minHeight: 640,
    title: electronProfile.productName,
    backgroundColor: "#f4f5f7",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: app.isPackaged
        ? path.join(process.resourcesPath, "app.asar", "dist", "preload.cjs")
        : path.join(moduleDir, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  window.removeMenu();
  window.setMenuBarVisibility(false);
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isAllowedExternalUrl(url)) {
      void shell.openExternal(url).catch((error) => console.warn("[Electron] 无法打开外部链接", error));
    }
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, targetUrl) => {
    if (!isAllowedNavigationUrl(targetUrl, frontendEntryUrl(), dshRuntime?.url)) event.preventDefault();
  });
  window.once("ready-to-show", () => {
    window.show();
    window.focus();
  });
  window.webContents.once("did-fail-load", (_event, code, description) => {
    console.error(`[Electron] DSH Web failed to load (${code}): ${description}`);
    window.show();
  });
  window.on("closed", () => {
    mainWindow = null;
  });
  void window.loadFile(frontendIndexPath());
  return window;
}

function configureBrowserPermissions(): void {
  session.defaultSession.setPermissionCheckHandler(() => false);
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
}

async function startDesktop(signal: AbortSignal): Promise<void> {
  if (quitting) throw desktopError(DesktopErrorCode.DSH_STOPPED, "桌面正在退出");
  if (dshRuntime) throw desktopError(DesktopErrorCode.DSH_STOPPED, "上一个官方 DSH 运行时尚未停止");
  const workspace = canonicalWorkspace(process.env.DSH_WORKSPACE || process.env.INIT_CWD);
  const dshHome = dshHomePath();
  const bundledCredentialsPath = bundledModelCredentialsPath();
  const modelEnvironment = bundledDshModelEnvironment(bundledCredentialsPath);
  const credentialMigration = migrateLegacyDshCredentials(dshHome, legacyDshHomePaths());
  for (const warning of credentialMigration.warnings) console.warn(`[Electron] ${warning}`);
  if (credentialMigration.migratedFrom) {
    console.log(`[Electron] 已迁移旧版官方 DSH 凭据: ${credentialMigration.migratedFrom}`);
  }
  desktopBootstrap = { ...desktopBootstrap, workspace, startupError: "" };
  let runtime!: OfficialDshRuntime;
  runtime = new OfficialDshRuntime({
    dshBin: resolveOfficialDshBin(app.isPackaged ? process.resourcesPath : undefined),
    dshHome,
    patchFile: profilePatchPath(),
    workspace,
    bundledBrowserSkillPackageDir: browserSkillPluginPackagePath(),
    bundledProfilePlugins: [{
      packageName: "@wxg-prc-cpg/dsh-weknora",
      packageDir: weknoraPluginPackagePath(),
    }, {
      packageName: "@voltui/dsh-intranet-auth",
      packageDir: intranetAuthPluginPackagePath(),
    }],
    executable: nodeRuntimePath(),
    executableArgs: ["--expose-internals"],
    signal,
    environment: {
      ...modelEnvironment,
      ANYONG_BSK_PATH: browserSkillCliPath(),
      ANYONG_OFFICECLI_COMMAND: nodeRuntimePath(),
      ANYONG_OFFICECLI_ARGS_JSON: JSON.stringify([officeCliEntryPath(), "mcp"]),
      ANYONG_INTEGRATIONS_MCP_COMMAND: nodeRuntimePath(),
      ANYONG_INTEGRATIONS_MCP_SCRIPT: integrationsMcpScriptPath(),
      // 内置网关凭据只允许从官方 DSH credentials service 解析，禁止继承用户系统环境变量。
      XG_GOMODEL_API_KEY: "",
    },
    onExit: (code, signal) => {
      if (quitting || stoppingRuntime === runtime || dshRuntime !== runtime) return;
      dshEventController?.abort();
      for (const controller of sessionFollowControllers.values()) controller.abort(desktopError(DesktopErrorCode.DSH_STOPPED, "官方 DSH 已停止"));
      sessionFollowControllers.clear();
      pendingRemoteEvents.clear();
      dshClient = null;
      console.error(`[Electron] Official DSH exited unexpectedly: code=${code} signal=${signal}`);
      const message = desktopErrorMessage(DesktopErrorCode.DSH_STOPPED, `官方 DSH 已停止：code=${code} signal=${signal}`);
      desktopBootstrap = { ...desktopBootstrap, dshReady: false, startupError: message };
      mainWindow?.webContents.send("desktop:runtime-error", message);
    },
  });
  dshRuntime = runtime;
  try {
    const dshUrl = await startOfficialDshWithRetry(runtime, 500, signal);
    if (quitting) throw desktopError(DesktopErrorCode.DSH_STOPPED, "桌面正在退出");
    const authenticatedClient = new DshRemoteClient(dshUrl);
    await authenticatedClient.authenticate(signal);
    if (quitting) throw desktopError(DesktopErrorCode.DSH_STOPPED, "桌面正在退出");
    dshClient = authenticatedClient;
    try {
      const bundledCredential = await provisionBundledDshCredential(authenticatedClient, bundledCredentialsPath, signal);
      if (bundledCredential.provisioned) console.log("[Electron] 已将构建期内置模型凭据写入官方 DSH credentials service");
    } catch (error) {
      signal.throwIfAborted();
      throw desktopError(DesktopErrorCode.CREDENTIAL_PROVISION_FAILED, "内置模型凭据无法写入官方 DSH credentials service", { cause: error });
    }
    if (quitting) throw desktopError(DesktopErrorCode.DSH_STOPPED, "桌面正在退出");
    desktopBootstrap = { ...desktopBootstrap, dshReady: true, startupError: "" };
    startDshEventBridge(authenticatedClient);
    mainWindow?.webContents.send("desktop:runtime-ready");
  } catch (error) {
    dshClient = null;
    await stopDesktopRuntime(runtime);
    throw error;
  }
}

async function stopDesktopRuntime(runtime: OfficialDshRuntime): Promise<void> {
  stoppingRuntime = runtime;
  await runtime.stop();
  // 停止失败时必须保留所有权，重试不能绕过旧进程。
  if (dshRuntime === runtime) dshRuntime = null;
  if (stoppingRuntime === runtime) stoppingRuntime = null;
}

function beginDesktopStart(): Promise<void> {
  if (runtimeStartPromise) return runtimeStartPromise;
  const controller = new AbortController();
  runtimeStartController = controller;
  desktopBootstrap = { ...desktopBootstrap, dshReady: false, startupError: "" };
  runtimeStartPromise = startDesktop(controller.signal)
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error("[Electron] Failed to start official DSH:", error);
      desktopBootstrap = { ...desktopBootstrap, dshReady: false, startupError: message };
      mainWindow?.webContents.send("desktop:runtime-error", message);
    })
    .finally(() => {
      runtimeStartPromise = null;
      if (runtimeStartController === controller) runtimeStartController = null;
    });
  return runtimeStartPromise;
}

const restartDesktopRuntime = createSingleFlight(async (): Promise<typeof desktopBootstrap> => {
  if (quitting) throw desktopError(DesktopErrorCode.DSH_STOPPED, "桌面正在退出");
  if (runtimeStartPromise) await runtimeStartPromise;
  if (quitting) throw desktopError(DesktopErrorCode.DSH_STOPPED, "桌面正在退出");
  desktopBootstrap = { ...desktopBootstrap, dshReady: false };
  dshEventController?.abort();
  dshEventController = null;
  for (const controller of sessionFollowControllers.values()) controller.abort();
  sessionFollowControllers.clear();
  dshClient = null;
  pendingRemoteEvents.clear();
  const runtime = dshRuntime;
  if (runtime) {
    try {
      await stopDesktopRuntime(runtime);
    } catch (error) {
      reportRuntimeError(error);
      throw error;
    }
  }
  await beginDesktopStart();
  return desktopBootstrap;
});

function recordValue(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

function mapLegacyDshRequest(method: string, payload: unknown): { endpoint: string; args: Record<string, unknown> } {
  const request = recordValue(payload);
  if (method === "session.list") return { endpoint: "session/list", args: { _request: request } };
  if (method === "session.history") {
    return { endpoint: "session/follow", args: { request: { address: { kind: "session", sessionId: String(request.sessionId ?? "") }, maxMessages: Number(request.maxMessages ?? 80), assistantStream: true } } };
  }
  if (method === "subagent.history") {
    return {
      endpoint: "session/follow",
      args: {
        request: {
          address: { kind: "subagent", parentSessionId: String(request.parentSessionId ?? ""), childSessionId: String(request.childSessionId ?? ""), mode: request.mode === "one-shot" ? "one-shot" : "continuable" },
          maxMessages: Number(request.maxMessages ?? 80), assistantStream: true,
        },
      },
    };
  }
  if (method === "workspace.list") return { endpoint: "workspace/follow", args: {} };
  if (method === "session.models") return { endpoint: "session/modelCatalog", args: {} };
  if (method === "llm.models") return { endpoint: "session/modelCatalog", args: {} };
  if (method === "llm.providers") return { endpoint: "llm/listConfigurableProviders", args: {} };
  if (method === "host.listDirectory") return { endpoint: "directoryPicker/list", args: request };
  if (method === "host.createDirectory") return { endpoint: "directoryPicker/createDirectory", args: request };
  if (method === "host.openPath") return { endpoint: "session/openWorkspacePath", args: { request } };
  if (method === "skill.list") return { endpoint: "skills/list", args: { request } };
  if (method === "fileReferences/list") return { endpoint: "fileReferences/list", args: { agentId: request.args && typeof request.args === "object" ? (request.args as Record<string, unknown>).agentId : "", query: request.args && typeof request.args === "object" ? (request.args as Record<string, unknown>).query : "" } };
  if (method === "sessionReferenceResolver/candidates") return { endpoint: "sessionReferenceResolver/candidates", args: { agentId: request.args && typeof request.args === "object" ? (request.args as Record<string, unknown>).agentId : "", query: request.args && typeof request.args === "object" ? (request.args as Record<string, unknown>).query : "" } };
  if (method === "pluginInventory/list") return { endpoint: "pluginInventory/list", args: {} };
  if (method.startsWith("agentPreset.")) {
    const suffix = method.slice("agentPreset.".length);
    if (suffix === "list") return { endpoint: "agentPresets/list", args: {} };
    if (suffix === "select") return { endpoint: "agentPresets/select", args: { agentId: request.sessionId, agentPreset: request.agentPreset } };
    if (suffix === "read") return { endpoint: "agentPresets/read", args: { agentPreset: request.agentPreset } };
    if (suffix === "copy") return { endpoint: "agentPresets/copy", args: { from: request.from, id: request.agentPreset, name: request.name } };
    if (suffix === "remove") return { endpoint: "agentPresets/deletePreset", args: { id: request.agentPreset } };
    if (suffix === "openDocument") return { endpoint: "settings/openAgentPresetDirectory", args: { agentPreset: request.agentPreset } };
  }
  if (method.startsWith("goal.")) {
    const suffix = method.slice("goal.".length);
    const { sessionId, objective, maxGoalRounds, ref, ...rest } = request;
    const args: Record<string, unknown> = { agentId: sessionId, ...rest };
    if (suffix === "create" || suffix === "edit") args.request = { ...(objective === undefined ? {} : { objective }), ...(maxGoalRounds === undefined ? {} : { maxGoalRounds }) };
    if (ref !== undefined) args.ref = ref;
    return { endpoint: `goals/${suffix}`, args };
  }
  if (method.startsWith("subagent.")) {
    const suffix = method.slice("subagent.".length);
    if (suffix === "list") return { endpoint: "subagents/list", args: { parentSessionId: request.parentSessionId } };
    if (suffix === "prompt") return { endpoint: "subagents/prompt", args: { request: { requestId: randomUUID(), parentSessionId: request.parentSessionId, childSessionId: request.childSessionId, mode: request.mode, content: request.content, clientTimeZone: request.clientTimeZone } } };
    if (suffix === "interrupt") return { endpoint: "subagents/interruptByParent", args: { childSessionId: request.childSessionId, parentSessionId: request.parentSessionId, mode: request.mode } };
  }
  if (method === "session.prompt") return { endpoint: "session/prompt", args: { request: { ...request, requestId: randomUUID() } } };
  if (method === "credentials.describe") return { endpoint: "credentials/describe", args: request };
  if (method === "credentials.set") return { endpoint: "credentials/set", args: request };
  if (method === "credentials.unset") return { endpoint: "credentials/unset", args: request };
  if (method === "settings.openDocument") return { endpoint: "settings/openSettingsDocument", args: {} };
  if (method.startsWith("settings.")) return { endpoint: `settings/${method.slice("settings.".length)}`, args: request };
  if (method === "llm.discoverModels") {
    const { settingsNs, ...discovery } = request;
    return { endpoint: "llm/discoverModels", args: { settingsNs, request: discovery } };
  }
  if (method === "session.updateQueue") return { endpoint: "session/updateQueue", args: { request } };
  if (method === "session.cancel") return { endpoint: "session/cancel", args: { request } };
  if (method.startsWith("session.")) return { endpoint: `session/${method.slice("session.".length)}`, args: { request } };
  if (method.startsWith("workspace.")) return { endpoint: `workspace/${method.slice("workspace.".length)}`, args: { request } };
  throw desktopError(DesktopErrorCode.DSH_METHOD_UNSUPPORTED, `不支持的 DSH 方法：${method}`);
}

async function readSessionHistoryAndFollow(args: Record<string, unknown>): Promise<{ events: Array<{ event: unknown }>; hasMore: boolean }> {
  const client = dshClient;
  if (!client) throw desktopError(DesktopErrorCode.DSH_NOT_STARTED, "官方 DSH 尚未启动");
  const request = recordValue(args.request);
  const key = JSON.stringify(request.address ?? {});
  sessionFollowControllers.get(key)?.abort();
  const controller = new AbortController();
  sessionFollowControllers.set(key, controller);
  return new Promise((resolve, reject) => {
    let opened = false;
    let cursor = -1;
    let activeAttempt: AssistantAttempt | undefined;
    const address = recordValue(request.address);
    const sessionId = String(address.kind === "subagent" ? address.childSessionId ?? "" : address.sessionId ?? "");
    const sendEntry = (entry: HistoryEntry) => {
      mainWindow?.webContents.send("desktop:dsh-frame", { rpcId: randomUUID(), payload: { type: "session/event", sessionId, event: entry.event } });
    };
    const rejectSuperseded = () => {
      if (opened) return;
      const reason = controller.signal.reason;
      reject(reason instanceof Error && reason.message.startsWith("VOLT_")
        ? reason
        : desktopError(DesktopErrorCode.DSH_FOLLOW_REPLACED, "DSH Session follow 已被较新的历史请求替换"));
    };
    controller.signal.addEventListener("abort", rejectSuperseded, { once: true });
    void (async () => {
      try {
        while (!controller.signal.aborted && dshClient === client) {
          try {
            for await (const item of client.openStream("session/follow", args, controller.signal)) {
              const frame = recordValue(item);
              if (frame.type === "snapshot") {
                const normalized = normalizeSessionSnapshot(frame);
                activeAttempt = normalized.activeAttempt;
                if (!opened) {
                  opened = true;
                  cursor = normalized.cursor;
                  resolve(normalized.history);
                } else {
                  for (const entry of normalized.history.events) {
                    const seq = Number(recordValue(entry.event).seq ?? -1);
                    if (seq > cursor) sendEntry(entry);
                  }
                  cursor = Math.max(cursor, normalized.cursor);
                }
                continue;
              }
              if (frame.type === "event" && frame.event) {
                const event = recordValue(frame.event);
                const seq = Number(event.seq ?? -1);
                if (seq > cursor) {
                  cursor = seq;
                  sendEntry({ event });
                }
                continue;
              }
              if (frame.type === "assistant-stream") {
                const applied = applyAssistantStreamFrame(frame.frame, activeAttempt);
                activeAttempt = applied.activeAttempt;
                if (applied.entry) sendEntry(applied.entry);
              }
            }
            if (!opened) throw desktopError(DesktopErrorCode.DSH_FOLLOW_EMPTY, "DSH Session follow 未返回快照");
          } catch (error) {
            if (controller.signal.aborted || dshClient !== client) return;
            if (!opened) throw error;
            console.warn("[Electron] DSH Session follow disconnected; reconnecting", error);
          }
          if (!controller.signal.aborted && dshClient === client) await new Promise<void>((done) => setTimeout(done, 500));
        }
      } catch (error) {
        if (!controller.signal.aborted) reject(error);
      } finally {
        if (!opened) reject(desktopError(DesktopErrorCode.DSH_STOPPED, "DSH Session follow 在首帧前已停止"));
        controller.signal.removeEventListener("abort", rejectSuperseded);
        if (sessionFollowControllers.get(key) === controller) sessionFollowControllers.delete(key);
      }
    })();
  });
}

function transformRemoteEvent(event: DshRemoteEvent): Record<string, unknown> | undefined {
  if (event.type === "ready") return undefined;
  if (event.type === "waterfall") {
    if (event.event === "approval/request") {
      const request = event.request;
      pendingRemoteEvents.set(event.eventId, { sessionId: event.agentId, kind: "approval", clientId: dshClient?.currentEventClientId ?? "" });
      return { rpcId: event.eventId, payload: { type: "approval/requested", sessionId: event.agentId, approvalId: event.eventId, toolName: String(request.toolName ?? ""), callId: request.callId, reason: request.reason } };
    }
    if (event.event === "user-questions/request") {
      pendingRemoteEvents.set(event.eventId, { sessionId: event.agentId, kind: "question", clientId: dshClient?.currentEventClientId ?? "" });
      return { rpcId: event.eventId, payload: { type: "question/requested", sessionId: event.agentId, questions: Array.isArray(event.request.questions) ? event.request.questions : [] } };
    }
    return undefined;
  }
  if (event.type === "cancel") {
    const pending = pendingRemoteEvents.get(event.eventId);
    pendingRemoteEvents.delete(event.eventId);
    if (!pending) return undefined;
    return { rpcId: event.eventId, payload: { type: `${pending.kind}/resolved`, sessionId: pending.sessionId } };
  }
  if (event.event === "api-session/added") return { rpcId: randomUUID(), payload: { type: "host/session-added" } };
  if (event.event === "api-session/removed") return { rpcId: randomUUID(), payload: { type: "host/session-removed", sessionId: String(event.args[0] ?? "") } };
  if (event.event === "api-session/status") return { rpcId: randomUUID(), payload: { type: "host/session-status", sessionId: String(event.args[0] ?? ""), running: event.args[1] === true } };
  if (event.event === "api-session/error") return { rpcId: randomUUID(), payload: { type: "host/agent-error", sessionId: String(event.args[0] ?? ""), message: String(event.args[1] ?? "") } };
  if (event.event === "api-session/activity" || event.event === "settings/document-updated" || event.event === "agent-preset/selected" || event.event === "llm/adapters-updated") return { rpcId: randomUUID(), payload: { type: "host/session-status" } };
  return undefined;
}

handleTrustedIpc("desktop:bootstrap", () => desktopBootstrap);
handleTrustedIpc("desktop:retry-runtime", () => restartDesktopRuntime());
handleTrustedIpc("desktop:dsh-request", async (_event, method: unknown, payload: unknown) => {
  if (!dshClient) throw desktopError(DesktopErrorCode.DSH_NOT_STARTED, "官方 DSH 尚未启动");
  if (typeof method !== "string") throw desktopError(DesktopErrorCode.DSH_METHOD_INVALID, "DSH 方法名无效");
  if (!allowedDshMethods.has(method)) {
    throw desktopError(DesktopErrorCode.DSH_METHOD_DENIED, `不允许的 DSH 方法：${method}`);
  }
  if (method === "host.describe") {
    const listed = recordValue(await dshClient.call("session/list", { _request: {} }));
    const catalog = recordValue(await dshClient.call("session/modelCatalog", {}));
    const selected = recordValue(catalog.default);
    const items = Array.isArray(listed.items) ? listed.items : [];
    return { result: { ok: true, value: { version: resolveOfficialDshVersion(app.isPackaged ? process.resourcesPath : undefined), cwd: desktopBootstrap.workspace, provider: selected.provider, model: selected.model, attachedSessions: items.length, home: dshClient.currentHostHome || os.homedir(), canOpenPath: true } } };
  }
  const mapped = mapLegacyDshRequest(method, payload);
  let value: unknown;
  if (mapped.endpoint === "session/follow" || mapped.endpoint === "workspace/follow") {
    value = mapped.endpoint === "session/follow"
      ? await readSessionHistoryAndFollow(mapped.args)
      : recordValue(await dshClient.readFirstStreamItem(mapped.endpoint, mapped.args)).value;
  } else {
    value = await dshClient.call(mapped.endpoint, mapped.args);
    if (method === "credentials.describe") value = { credentials: value };
    if (method === "llm.providers") value = { providers: Array.isArray(value) ? value : [] };
    if (method === "host.createDirectory") value = { path: value };
    if (method === "agentPreset.list") value = { ...recordValue(value), hasDocument: recordValue(value).authorable === true };
    if (method === "agentPreset.select") value = { agentPreset: value };
    if (method === "agentPreset.copy") value = { agentPreset: recordValue(payload).agentPreset };
    if (method === "goal.clear") value = { cleared: true };
    if (["goal.edit", "goal.pause", "goal.resume", "goal.complete"].includes(method)) {
      const goal = recordValue(value);
      value = { ref: { id: goal.id, revision: goal.revision } };
    }
    if (method === "session.models") {
      const item = recordValue(await dshClient.call("session/list", { _request: {} }));
      const sessions = Array.isArray(item.items) ? item.items.map(recordValue) : [];
      const selected = sessions.find((entry) => recordValue(entry).sessionId === recordValue(payload).sessionId);
      const projection = recordValue(recordValue(selected).projections).values;
      const modelProjection = recordValue(recordValue(projection).modelSelection);
      const catalog = recordValue(value);
      const current = recordValue(modelProjection.next ?? modelProjection.lastUsed ?? catalog.default);
      const routableProviders = Array.isArray(catalog.routableProviders) ? catalog.routableProviders : [];
      value = { current, groups: catalog.groups ?? [], failures: catalog.failures ?? [], routable: routableProviders.includes(current.provider) };
    }
  }
  return { result: { ok: true, value } };
});
handleTrustedIpc("desktop:dsh-respond", async (_event, message: unknown) => {
  if (!dshClient) throw desktopError(DesktopErrorCode.DSH_NOT_STARTED, "官方 DSH 尚未启动");
  if (!message || typeof message !== "object") throw desktopError(DesktopErrorCode.DSH_RESPONSE_INVALID, "DSH 响应格式无效");
  const responseMessage = message as Record<string, unknown>;
  if (responseMessage.type !== "client-response" || typeof responseMessage.rpcId !== "string" || !responseMessage.rpcId) {
    throw desktopError(DesktopErrorCode.DSH_RESPONSE_INVALID, "DSH 响应关联信息无效");
  }
  const result = recordValue(responseMessage.result);
  const value = recordValue(result.value);
  const outcome = value.outcome !== undefined ? { kind: "result", value: value.outcome } : { kind: "result", value: value.answer };
  const pending = pendingRemoteEvents.get(responseMessage.rpcId);
  if (!pending) throw desktopError(DesktopErrorCode.DSH_REQUEST_FAILED, "DSH 请求已取消或来自旧连接");
  await dshClient.respondEvent(responseMessage.rpcId, outcome, pending.clientId);
  pendingRemoteEvents.delete(responseMessage.rpcId);
  return { result: { ok: true, value: { accepted: true } } };
});
handleTrustedIpc("desktop:minimize", () => mainWindow?.minimize());
handleTrustedIpc("desktop:maximize", () => {
  if (!mainWindow) return false;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
  return mainWindow.isMaximized();
});
handleTrustedIpc("desktop:close", () => mainWindow?.close());
handleTrustedIpc("desktop:open-external", async (_event, value: unknown) => {
  if (typeof value !== "string") throw desktopError(DesktopErrorCode.EXTERNAL_URL_INVALID, "外部链接格式无效");
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw desktopError(DesktopErrorCode.EXTERNAL_URL_INVALID, "外部链接格式无效");
  }
  if (!isAllowedExternalUrl(url.toString())) throw desktopError(DesktopErrorCode.EXTERNAL_URL_DENIED, "仅允许打开不含凭据的 HTTP(S) 链接");
  await shell.openExternal(url.toString());
  return { opened: true as const };
});
handleTrustedIpc("desktop:pick-workspace", async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, { properties: ["openDirectory"] });
  return result.canceled ? null : result.filePaths[0] ?? null;
});
handleTrustedIpc("desktop:export-session", async (_event, sessionId: unknown) => {
  if (!dshClient) throw desktopError(DesktopErrorCode.DSH_NOT_STARTED, "官方 DSH 尚未启动");
  if (typeof sessionId !== "string" || !sessionId.trim() || sessionId.length > 256) throw desktopError(DesktopErrorCode.SESSION_ID_INVALID, "会话 ID 无效");
  const filename = `dsh-session-${sessionId.replace(/[^A-Za-z0-9_-]/gu, "_")}.zip`;
  const saveOptions = { defaultPath: path.join(app.getPath("downloads"), filename), filters: [{ name: "ZIP archive", extensions: ["zip"] }] };
  const selected = mainWindow
    ? await dialog.showSaveDialog(mainWindow, saveOptions)
    : await dialog.showSaveDialog(saveOptions);
  if (selected.canceled || !selected.filePath) return { saved: false as const };
  await dshClient.exportSession(sessionId, selected.filePath);
  return { saved: true as const, path: selected.filePath };
});
handleTrustedIpc("desktop:smb-list", async () => requireSmbManager().list());
handleTrustedIpc("desktop:smb-mount", async (_event, request: unknown) => {
  if (!request || typeof request !== "object") throw desktopError(DesktopErrorCode.SMB_INVALID_REQUEST, "SMB 配置格式无效");
  return requireSmbManager().mount(request as Parameters<SmbMountManager["mount"]>[0]);
});
handleTrustedIpc("desktop:smb-unmount", async (_event, id: unknown) => {
  if (typeof id !== "string") throw desktopError(DesktopErrorCode.SMB_INVALID_ID, "SMB 配置 ID 无效");
  return requireSmbManager().unmount(id);
});
handleTrustedIpc("desktop:smb-remove", async (_event, id: unknown) => {
  if (typeof id !== "string") throw desktopError(DesktopErrorCode.SMB_INVALID_ID, "SMB 配置 ID 无效");
  return requireSmbManager().remove(id);
});
handleTrustedIpc("desktop:smb-open", async (_event, localPath: unknown) => {
  if (typeof localPath !== "string" || !/^[A-Z]:$/iu.test(localPath.trim())) throw desktopError(DesktopErrorCode.SMB_INVALID_DRIVE, "本地路径必须是 Windows 盘符");
  if (process.platform !== "win32") return { opened: false as const, error: desktopErrorMessage(DesktopErrorCode.SMB_UNSUPPORTED_OPEN, "当前平台不支持打开 SMB 盘符") };
  const configuredPath = await requireSmbManager().resolveOpenPath(localPath);
  const error = await shell.openPath(configuredPath);
  return error ? { opened: false as const, error } : { opened: true as const };
});

function startDshEventBridge(client: DshRemoteClient): void {
  dshEventController?.abort();
  const controller = new AbortController();
  dshEventController = controller;
  let generationClientId = "";
  void client.runEvents((event) => {
    if (event.type === "ready") {
      if (generationClientId && generationClientId !== event.clientId) {
        for (const [eventId, pending] of pendingRemoteEvents) {
          mainWindow?.webContents.send("desktop:dsh-frame", { rpcId: eventId, payload: { type: `${pending.kind}/resolved`, sessionId: pending.sessionId } });
        }
        pendingRemoteEvents.clear();
      }
      generationClientId = event.clientId;
      return;
    }
    const frame = transformRemoteEvent(event);
    if (frame) mainWindow?.webContents.send("desktop:dsh-frame", frame);
  }, controller.signal).catch(reportRuntimeError);
  void runPersistentStream(client, "session/control", {}, (item) => {
    const frame = recordValue(item);
    if (frame.type === "queue") mainWindow?.webContents.send("desktop:dsh-frame", { rpcId: randomUUID(), payload: { type: "session/queue", sessionId: frame.sessionId, items: frame.items } });
    else if (frame.type === "jobs") mainWindow?.webContents.send("desktop:dsh-frame", { rpcId: randomUUID(), payload: { type: "session/jobs", sessionId: frame.sessionId, jobs: frame.jobs } });
    else if (frame.type === "projection") mainWindow?.webContents.send("desktop:dsh-frame", { rpcId: randomUUID(), payload: { type: "session/projection", sessionId: frame.sessionId, key: frame.key, value: frame.value, seq: frame.seq } });
  }, controller.signal);
  void runPersistentStream(client, "workspace/follow", {}, (item) => {
    const frame = recordValue(item);
    if (frame.type === "remove") mainWindow?.webContents.send("desktop:dsh-frame", { rpcId: randomUUID(), payload: { type: "host/workspace-removed", workspaceId: frame.workspaceId } });
    else if (frame.type !== "baseline") mainWindow?.webContents.send("desktop:dsh-frame", { rpcId: randomUUID(), payload: { type: "host/workspace-changed" } });
  }, controller.signal);
}

async function runPersistentStream(
  client: DshRemoteClient,
  endpoint: string,
  args: Record<string, unknown>,
  onItem: (item: unknown) => void,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    try {
      for await (const item of client.openStream(endpoint, args, signal)) onItem(item);
    } catch (error) {
      if (signal.aborted) return;
      console.warn(`[Electron] DSH Remote stream ${endpoint} disconnected`, error);
    }
    if (!signal.aborted) await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
}

function reportRuntimeError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  desktopBootstrap = { ...desktopBootstrap, startupError: message };
  mainWindow?.webContents.send("desktop:runtime-error", message);
}

if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (quitting) return;
    if (!mainWindow) {
      if (!app.isReady()) return;
      mainWindow = createWindow();
    }
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    configureBrowserPermissions();
    void requireSmbManager().mountAuto().catch((error) => console.warn("[Electron] SMB 自动挂载失败", error));
    mainWindow = createWindow();
    void beginDesktopStart();
  });

  app.on("activate", () => {
    if (quitting) return;
    if (BrowserWindow.getAllWindows().length > 0) return;
    mainWindow = createWindow();
  });
}

app.on("before-quit", (event) => {
  if (quitting) {
    event.preventDefault();
    return;
  }
  if (!dshRuntime && !runtimeStartPromise) return;
  event.preventDefault();
  quitting = true;
  desktopBootstrap = { ...desktopBootstrap, dshReady: false };
  dshClient = null;
  runtimeStartController?.abort(desktopError(DesktopErrorCode.DSH_STOPPED, "桌面正在退出"));
  dshEventController?.abort();
  for (const controller of sessionFollowControllers.values()) controller.abort();
  void (async () => {
    try {
      await runtimeStartPromise;
      if (dshRuntime) await stopDesktopRuntime(dshRuntime);
      quitting = false;
      app.quit();
    } catch (error) {
      quitting = false;
      // 最后一个窗口已关闭时也必须保留停止失败的恢复入口。
      if (!mainWindow || mainWindow.isDestroyed()) mainWindow = createWindow();
      reportRuntimeError(error);
    }
  })();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
