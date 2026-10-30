import { randomUUID } from "node:crypto";
import { fileUploadRequest } from "./file-upload-request.ts";
import { permissionCommandRequest } from "./permission-request.ts";
import { subagentAddress } from "./subagent-routing.ts";
import { sessionHistoryRequest } from "./session-follow.ts";

// 前台可用方法白名单与端点映射必须在同一处维护：白名单里有、映射里没有，
// 用户只会看到“不支持的 DSH 方法”（issue #294 的 speech/catalog 就是这样坏的）。
export const allowedDshMethods: ReadonlySet<string> = new Set([
  "session.list", "session.search", "session.create", "session.history", "session.prompt",
  "session.cancel", "session.models", "session.selectModel", "session.rename", "session.fork",
  "session.attachment", "session.updateQueue", "workspace.list", "workspace.create",
  "fileUploads.upload",
  "commands.execute", "permissionPresets.catalog",
  "workspace.rename", "workspace.delete", "workspace.insertBefore", "workspace.insertSessionBefore",
  "workspace.archiveSession", "workspace.unarchiveSession", "host.describe", "host.listDirectory", "host.createDirectory", "host.openPath",
  "agentPreset.list", "agentPreset.select", "agentPreset.read", "agentPreset.copy", "agentPreset.openDocument", "agentPreset.remove",
  "subagent.list", "subagent.history", "subagent.prompt", "subagent.interrupt",
  "goal.create", "goal.edit", "goal.pause",
  "goal.resume", "goal.complete", "goal.clear", "settings.describe", "settings.openDocument",
  "settings.update", "credentials.describe",
  "credentials.set", "credentials.unset", "llm.providers", "llm.models", "llm.discoverModels", "skill.list",
  "fileReferences/list", "sessionReferenceResolver/candidates", "pluginInventory/list",
  "weknora/test",
  "speech/catalog", "speech/prepare", "speech/cancelPreparation", "speech/transcribe",
  "mcpApps.request",
]);

// 由 IPC handler 在映射前直接处理、不需要端点的三个方法。
export const handlerOnlyDshMethods = new Set(["host.describe", "subagent.list", "mcpApps.request"]);

export function recordValue(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  return payload as Record<string, unknown>;
}

function mapLegacyDshRequest(method: string, payload: unknown): { endpoint: string; args: Record<string, unknown> } {
  const request = recordValue(payload);
  if (method === "session.list") return { endpoint: "session/list", args: { _request: request } };
  if (method === "session.history") return sessionHistoryRequest(request);
  if (method === "subagent.history") {
    return {
      endpoint: "session/follow",
      args: {
        request: {
          address: subagentAddress(request),
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
  if (method === "weknora/test") return { endpoint: "weknora/test", args: {} };
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
    if (suffix === "prompt") return { endpoint: "subagents/prompt", args: { request: { requestId: randomUUID(), parentSessionId: request.parentSessionId, childSessionId: request.childSessionId, mode: request.mode, delivery: "queue", content: request.content, clientTimeZone: request.clientTimeZone } } };
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
  if (method === "session.attachment") return { endpoint: "session/attachment", args: { request } };
  if (method === "fileUploads.upload") return fileUploadRequest(request);
  if (method === "commands.execute") return permissionCommandRequest(request);
  if (method === "permissionPresets.catalog") return { endpoint: "permissionPresets/catalog", args: {} };
  if (method === "session.updateQueue") return { endpoint: "session/updateQueue", args: { request } };
  if (method === "session.cancel") return { endpoint: "session/cancel", args: { request } };
  // 语音能力由官方 speech-to-text 插件提供，方法名与远端端点同名，参数形状由前台
  // 按官方契约构造；白名单放行后必须在这里透传，否则会落到下面的“不支持的 DSH 方法”
  // 报错（issue #294：设置页读语音模型状态直接失败）。
  if (method.startsWith("speech/")) return { endpoint: method, args: request };
  if (method.startsWith("session.")) return { endpoint: `session/${method.slice("session.".length)}`, args: { request } };
  if (method.startsWith("workspace.")) return { endpoint: `workspace/${method.slice("workspace.".length)}`, args: { request } };
  throw new Error(`不支持的 DSH 方法：${method}`);
}

export { mapLegacyDshRequest };
