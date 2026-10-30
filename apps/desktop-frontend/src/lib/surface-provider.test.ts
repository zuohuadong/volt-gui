import { describe, expect, it } from "vitest";
import type { BaseRecord, GetListParams } from "@svadmin/core";
import type { DshClient } from "./dsh-client";
import { createDshSurfaceProvider, VOLT_SURFACE_POLICY } from "./surface-agent";

const client = {
  async listSessions() {
    return { items: [
      { sessionId: "s1", updatedAt: 2, running: true, blank: false, cwd: "/work", projections: { values: { title: "修复登录" } } },
      { sessionId: "s2", updatedAt: 1, running: false, blank: true, cwd: "" },
    ] };
  },
  async listWorkspaces() {
    return { items: [{ workspaceId: "w1", title: "主工作区", path: "/work", sessionIds: ["s1", "s2"] }], archivedSessionIds: [] };
  },
  async listSubagents() {
    return { entries: [
      { id: "c1", label: "评审", kind: "child", activity: "running", mode: "continuable" },
      { id: "c2", kind: "child", activity: "idle", mode: "continuable" },
    ] };
  },
  async listSkills() {
    return { skills: [{ name: "pdf", description: "读取 PDF", modelInvocable: true }] };
  },
  async listModelCatalog() {
    return { groups: [{ id: "xg-gomodel", name: "XG", models: [
      { id: "vlm", name: "VLM", description: "视觉模型", contextWindow: 128000 },
      { id: "fast", name: "Fast" },
    ] }], failures: [] };
  },
  async listAgentPresets() {
    return { presets: [{ id: "standard", trust: "system", isDefault: true, name: "Standard" }], authorable: true, hasDocument: false };
  },
  async permissionCatalog() {
    return { options: [{ value: "workspace-write" }, { value: "read-only", name: "只读" }] };
  },
} as unknown as DshClient;

async function records(resource: string): Promise<BaseRecord[]> {
  const provider = createDshSurfaceProvider(client, "s1");
  const result = await provider.getList({ resource, pagination: { pageSize: 50 } } as GetListParams);
  return result.data as BaseRecord[];
}

describe("DSH surface data provider", () => {
  it("keeps the policy aligned with every exposed field", async () => {
    for (const resource of ["sessions", "workspaces", "subagents", "skills", "models", "agentPresets", "permissionPresets"]) {
      const allowed = new Set(VOLT_SURFACE_POLICY.resources[resource]?.readFields ?? []);
      expect(allowed.size).toBeGreaterThan(0);
      const rows = await records(resource);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        for (const key of Object.keys(row)) expect(allowed.has(key)).toBe(true);
      }
    }
  });

  it("maps catalog resources into flat read-only records", async () => {
    expect(await records("models")).toEqual([
      { provider: "xg-gomodel", id: "vlm", name: "VLM", description: "视觉模型", contextWindow: 128000 },
      { provider: "xg-gomodel", id: "fast", name: "Fast" },
    ]);
    expect(await records("permissionPresets")).toEqual([
      { id: "workspace-write" },
      { id: "read-only", name: "只读" },
    ]);
    expect(await records("skills")).toEqual([{ name: "pdf", description: "读取 PDF", modelInvocable: true }]);
    expect(await records("agentPresets")).toEqual([
      { id: "standard", name: "Standard", trust: "system", isDefault: true },
    ]);
  });

  it("keeps session-scoped resources empty without an active session", async () => {
    const provider = createDshSurfaceProvider(client, "");
    expect((await provider.getList({ resource: "skills" } as GetListParams)).data).toEqual([]);
    expect((await provider.getList({ resource: "subagents" } as GetListParams)).data).toEqual([]);
  });

  it("rejects resources outside the policy", async () => {
    const provider = createDshSurfaceProvider(client, "s1");
    await expect(provider.getList({ resource: "credentials" } as GetListParams)).rejects.toThrow(/Unsupported/);
  });
});
