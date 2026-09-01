import { describe, expect, it } from "vitest";

import { DshClient, type PromptContentPart } from "./dsh-client";

function createClient() {
  const calls: Array<{ method: string; payload: unknown }> = [];
  const client = new DshClient({
    async dshRequest(method, payload) {
      calls.push({ method, payload });
      return { result: { ok: true, value: {} } };
    },
    async dshRespond() { return {}; },
    onDshFrame() { return () => undefined; },
  });
  return { calls, client };
}

describe("DshClient management RPC", () => {
  it("maps session management actions to official DSH methods", async () => {
    const { calls, client } = createClient();

    await client.rename("session-1", "新标题");
    await client.fork("session-1");
    await client.archiveSession("session-1");

    expect(calls).toEqual([
      { method: "session.rename", payload: { sessionId: "session-1", title: "新标题" } },
      { method: "session.fork", payload: { sessionId: "session-1" } },
      { method: "workspace.archiveSession", payload: { sessionId: "session-1" } },
    ]);
  });

  it("maps Agent preset actions to official DSH methods", async () => {
    const { calls, client } = createClient();

    await client.listAgentPresets();
    await client.selectAgentPreset("session-1", "reviewer");
    await client.readAgentPreset("reviewer");
    await client.openAgentPresetDocument("reviewer");

    expect(calls).toEqual([
      { method: "agentPreset.list", payload: {} },
      { method: "agentPreset.select", payload: { sessionId: "session-1", agentPreset: "reviewer" } },
      { method: "agentPreset.read", payload: { agentPreset: "reviewer" } },
      { method: "agentPreset.openDocument", payload: { agentPreset: "reviewer" } },
    ]);
  });

  it("maps workspace management actions to official DSH methods", async () => {
    const { calls, client } = createClient();

    await client.renameWorkspace("workspace-1", "产品仓库");
    await client.openPath("D:\\workspace\\product");
    await client.deleteWorkspace("workspace-1");
    await client.describeHost();
    await client.listDirectory("D:\\workspace");
    await client.createDirectory("D:\\workspace", "new-project");

    expect(calls).toEqual([
      { method: "workspace.rename", payload: { workspaceId: "workspace-1", title: "产品仓库" } },
      { method: "host.openPath", payload: { path: "D:\\workspace\\product" } },
      { method: "workspace.delete", payload: { workspaceId: "workspace-1" } },
      { method: "host.describe", payload: {} },
      { method: "host.listDirectory", payload: { path: "D:\\workspace" } },
      { method: "host.createDirectory", payload: { path: "D:\\workspace", name: "new-project" } },
    ]);
  });

  it("supports official model discovery and image prompt content", async () => {
    const { calls, client } = createClient();
    await client.listModelCatalog();
    await client.discoverModels({ settingsNs: "llm-openai", baseURL: "https://example.invalid", apiKey: "secret" });
    await client.prompt("session-1", [{ type: "text", text: "分析这张图" }, { type: "image", mediaType: "image/png", data: "AA==", name: "diagram.png" }], "steer");
    expect(calls).toEqual([
      { method: "llm.models", payload: {} },
      { method: "llm.discoverModels", payload: { settingsNs: "llm-openai", baseURL: "https://example.invalid", apiKey: "secret" } },
      { method: "session.prompt", payload: { sessionId: "session-1", mode: "steer", content: [{ type: "text", text: "分析这张图" }, { type: "image", mediaType: "image/png", data: "AA==", name: "diagram.png" }], clientTimeZone: Intl.DateTimeFormat("zh-CN").resolvedOptions().timeZone } },
    ]);
  });

  it("snapshots reactive prompt content before crossing the transport boundary", async () => {
    const { calls, client } = createClient();
    const reactiveContent = new Proxy([{ type: "image", mediaType: "image/png", data: "AA==", name: "x.png" } satisfies PromptContentPart], {});
    await client.prompt("session-1", reactiveContent);
    const payload = calls[0].payload as { content: unknown[] };
    expect(payload.content).toEqual([{ type: "image", mediaType: "image/png", data: "AA==", name: "x.png" }]);
    expect(Object.getPrototypeOf(payload.content)).toBe(Array.prototype);
  });

  it("snapshots reactive credential references before Electron IPC", async () => {
    const { calls, client } = createClient();
    const reactiveRefs = new Proxy(["XG_GOMODEL_API_KEY"], {});
    await client.describeCredentials(reactiveRefs);
    const payload = calls[0].payload as { refs: string[] };
    expect(payload).toEqual({ refs: ["XG_GOMODEL_API_KEY"] });
    expect(Object.getPrototypeOf(payload)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(payload.refs)).toBe(Array.prototype);
  });

  it("maps goals, subagents, settings, credentials and providers", async () => {
    const { calls, client } = createClient();
    const ref = { id: "goal-1", revision: 2 };

    await client.createGoal("session-1", "完成迁移", 12);
    await client.pauseGoal("session-1", ref);
    await client.listSubagents("session-1");
    await client.subagentHistory("session-1", "child-1", "continuable");
    await client.promptSubagent("session-1", "child-1", "继续检查");
    await client.interruptSubagent("session-1", "child-1");
    await client.describeSettings();
    await client.updateSettings("llm-deepseek", { apiKeyEnv: "DEEPSEEK_API_KEY" }, 3);
    await client.describeCredentials(["DEEPSEEK_API_KEY"]);
    await client.setCredential("DEEPSEEK_API_KEY", "secret");
    await client.unsetCredential("DEEPSEEK_API_KEY");
    await client.listProviders();

    expect(calls).toEqual([
      { method: "goal.create", payload: { sessionId: "session-1", objective: "完成迁移", maxGoalRounds: 12 } },
      { method: "goal.pause", payload: { sessionId: "session-1", ref } },
      { method: "subagent.list", payload: { parentSessionId: "session-1" } },
      { method: "subagent.history", payload: { parentSessionId: "session-1", childSessionId: "child-1", mode: "continuable", maxMessages: 80 } },
      { method: "subagent.prompt", payload: { parentSessionId: "session-1", childSessionId: "child-1", mode: "continuable", content: [{ type: "text", text: "继续检查" }], clientTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone } },
      { method: "subagent.interrupt", payload: { parentSessionId: "session-1", childSessionId: "child-1", mode: "continuable" } },
      { method: "settings.describe", payload: {} },
      { method: "settings.update", payload: { ns: "llm-deepseek", patch: { apiKeyEnv: "DEEPSEEK_API_KEY" }, expectedRevision: 3 } },
      { method: "credentials.describe", payload: { refs: ["DEEPSEEK_API_KEY"] } },
      { method: "credentials.set", payload: { ref: "DEEPSEEK_API_KEY", value: "secret" } },
      { method: "credentials.unset", payload: { ref: "DEEPSEEK_API_KEY" } },
      { method: "llm.providers", payload: {} },
    ]);
  });

  it("maps official reference and plugin inventory remotes", async () => {
    const { calls, client } = createClient();
    await client.listFileReferences("session-1", "src/App");
    await client.listSessionReferenceCandidates("session-1", "迁移");
    await client.listPluginInventory();
    expect(calls).toEqual([
      { method: "fileReferences/list", payload: { args: { agentId: "session-1", query: "src/App" } } },
      { method: "sessionReferenceResolver/candidates", payload: { args: { agentId: "session-1", query: "迁移" } } },
      { method: "pluginInventory/list", payload: { args: {} } },
    ]);
  });
});
