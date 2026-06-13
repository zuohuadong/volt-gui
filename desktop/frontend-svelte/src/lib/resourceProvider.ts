import { app } from "./bridge";
import type { ListParams, ListResult, ResourceRecord } from "./types";

export const workbenchResources = [
  "providers",
  "models",
  "mcpServers",
  "skills",
  "permissions",
  "workspaces",
  "sessions",
  "topics",
  "tasks",
  "memory",
  "checkpoints",
  "updates",
] as const;

export type WorkbenchResource = (typeof workbenchResources)[number];

export interface WorkbenchDataProvider {
  list(resource: WorkbenchResource, params?: ListParams): Promise<ListResult>;
  getOne(resource: WorkbenchResource, id: string): Promise<ResourceRecord>;
  create(resource: WorkbenchResource, data: unknown): Promise<ResourceRecord>;
  update(resource: WorkbenchResource, id: string, data: unknown): Promise<ResourceRecord>;
  delete(resource: WorkbenchResource, id: string): Promise<void>;
}

function asRecords(value: unknown, idPrefix: string): ResourceRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return { id: String(record.id ?? record.name ?? record.path ?? `${idPrefix}-${index}`), ...record };
    }
    return { id: `${idPrefix}-${index}`, value: item };
  });
}

export const wailsDataProvider: WorkbenchDataProvider = {
  async list(resource) {
    switch (resource) {
      case "models": {
        const tabs = await app().ListTabs();
        const active = tabs.find((tab) => tab.active) ?? tabs[0];
        const models = active ? await app().ModelsForTab(active.id) : [];
        return { data: asRecords(models, "model"), total: models.length };
      }
      case "skills": {
        const capabilities = await app().Capabilities();
        const skills = (capabilities as { skills?: unknown[] }).skills ?? [];
        return { data: asRecords(skills, "skill"), total: skills.length };
      }
      case "memory": {
        const memory = await app().Memory();
        const entries = (memory as { entries?: unknown[] }).entries ?? [];
        return { data: asRecords(entries, "memory"), total: entries.length };
      }
      case "sessions":
      case "topics": {
        const tabs = await app().ListTabs();
        return { data: asRecords(tabs, "tab"), total: tabs.length };
      }
      default:
        return { data: [], total: 0 };
    }
  },
  async getOne(resource, id) {
    const result = await this.list(resource);
    return result.data.find((record) => record.id === id) ?? { id };
  },
  async create(_resource, data) {
    return { id: crypto.randomUUID(), ...(typeof data === "object" && data ? data : { value: data }) };
  },
  async update(_resource, id, data) {
    return { id, ...(typeof data === "object" && data ? data : { value: data }) };
  },
  async delete(_resource, _id) {},
};
