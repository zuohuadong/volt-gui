import { app } from "./bridge";
import type { ListParams, ListResult, MCPServerInput, MemoryView, ProviderView, ResourceRecord, SettingsView } from "./types";

export const workbenchResources = [
  "providers",
  "models",
  "mcpServers",
  "skills",
  "permissions",
  "desktopPrefs",
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

function asRecordData(data: unknown): Record<string, unknown> {
  return typeof data === "object" && data !== null ? data as Record<string, unknown> : {};
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function providerFromData(data: unknown, previous?: ResourceRecord): ProviderView {
  const record = { ...(previous ?? {}), ...asRecordData(data) };
  const name = String(record.name ?? record.id ?? "").trim();
  return {
    name,
    kind: String(record.kind ?? "openai").trim() || "openai",
    baseUrl: String(record.baseUrl ?? record.baseURL ?? ""),
    models: parseList(record.models).length > 0 ? parseList(record.models) : [String(record.default ?? "model").trim()].filter(Boolean),
    default: String(record.default ?? ""),
    apiKeyEnv: String(record.apiKeyEnv ?? ""),
    keySet: Boolean(record.keySet),
    balanceUrl: String(record.balanceUrl ?? ""),
    contextWindow: Number(record.contextWindow ?? 0),
    supportedEfforts: parseList(record.supportedEfforts),
    defaultEffort: String(record.defaultEffort ?? ""),
  };
}

function mcpInputFromData(data: unknown, previous?: ResourceRecord): MCPServerInput {
  const record = { ...(previous ?? {}), ...asRecordData(data) };
  const transport = String(record.transport ?? "stdio");
  return {
    name: String(record.name ?? record.id ?? "").trim(),
    transport,
    command: String(record.command ?? ""),
    args: parseList(record.args),
    url: String(record.url ?? ""),
    env: null,
    tier: String(record.tier ?? "lazy"),
  };
}

function modelRefs(settings: SettingsView): ResourceRecord[] {
  return settings.providers.flatMap((provider) =>
    provider.models.map((model) => {
      const ref = `${provider.name}/${model}`;
      return {
        id: ref,
        ref,
        provider: provider.name,
        model,
        default: settings.defaultModel === ref,
        planner: settings.plannerModel === ref,
      };
    }),
  );
}

function memoryEntries(memory: MemoryView): ResourceRecord[] {
  const facts = memory.facts.map((fact) => ({
    id: fact.name,
    name: fact.name,
    title: fact.title ?? fact.name,
    description: fact.description,
    type: fact.type,
    body: fact.body,
  }));
  const docs = memory.docs.map((doc) => ({
    id: `doc:${doc.scope}`,
    name: doc.path,
    scope: doc.scope,
    body: doc.body,
    type: "doc",
  }));
  return [...facts, ...docs];
}

export const wailsDataProvider: WorkbenchDataProvider = {
  async list(resource) {
    switch (resource) {
      case "models": {
        const settings = await app().Settings();
        const models = modelRefs(settings);
        return { data: models, total: models.length };
      }
      case "providers": {
        const settings = await app().Settings();
        const providers = asRecords(settings.providers, "provider");
        return { data: providers, total: providers.length };
      }
      case "mcpServers": {
        const capabilities = await app().Capabilities();
        const servers = asRecords(capabilities.servers, "mcp");
        return { data: servers, total: servers.length };
      }
      case "skills": {
        const capabilities = await app().Capabilities();
        const skills = capabilities.skills ?? [];
        return { data: asRecords(skills, "skill"), total: skills.length };
      }
      case "permissions": {
        const settings = await app().Settings();
        const records = [
          { id: "mode", name: "mode", value: settings.permissions.mode },
          { id: "allow", name: "allow", rules: settings.permissions.allow },
          { id: "ask", name: "ask", rules: settings.permissions.ask },
          { id: "deny", name: "deny", rules: settings.permissions.deny },
          { id: "sandbox", name: "sandbox", ...settings.sandbox },
        ];
        return { data: records, total: records.length };
      }
      case "desktopPrefs": {
        const settings = await app().Settings();
        const records = [
          { id: "language", name: "language", value: settings.desktopLanguage || "en" },
          { id: "theme", name: "theme", value: settings.desktopTheme || "dark" },
          { id: "themeStyle", name: "themeStyle", value: settings.desktopThemeStyle || "graphite" },
          { id: "closeBehavior", name: "closeBehavior", value: settings.closeBehavior || "background" },
        ];
        return { data: records, total: records.length };
      }
      case "memory": {
        const memory = await app().Memory();
        const entries = memoryEntries(memory);
        return { data: entries, total: memory.facts.length + memory.docs.length };
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
  async create(resource, data) {
    if (resource === "providers") {
      const provider = providerFromData(data);
      await app().SaveProvider(provider);
      const record = asRecordData(data);
      if (typeof record.apiKeyValue === "string") await app().SetProviderKey(provider.apiKeyEnv, record.apiKeyValue);
      return { id: provider.name, ...provider };
    }
    if (resource === "mcpServers") {
      const input = mcpInputFromData(data);
      const tools = await app().AddMCPServer(input);
      return { id: input.name, ...input, tools };
    }
    if (resource === "permissions") {
      const record = asRecordData(data);
      const list = String(record.list ?? "ask");
      const rule = String(record.rule ?? "");
      await app().AddPermissionRule(list, rule);
      return { id: `${list}:${rule}`, list, rule };
    }
    if (resource === "memory") {
      const record = asRecordData(data);
      const scope = String(record.scope ?? "project");
      const note = String(record.note ?? record.description ?? record.body ?? "").trim();
      const path = await app().Remember(scope, note);
      return { id: `doc:${scope}`, scope, path, note };
    }
    return { id: crypto.randomUUID(), ...(typeof data === "object" && data ? data : { value: data }) };
  },
  async update(resource, id, data) {
    const previous = await this.getOne(resource, id);
    if (resource === "models") {
      const record = asRecordData(data);
      if (record.planner === true) await app().SetPlannerModel(id);
      if (record.planner === false) await app().SetPlannerModel("");
      if (record.default === true) await app().SetDefaultModel(id);
      return { ...previous, ...record, id };
    }
    if (resource === "providers") {
      const provider = providerFromData(data, previous);
      await app().SaveProvider(provider);
      if (typeof asRecordData(data).apiKeyValue === "string") await app().SetProviderKey(provider.apiKeyEnv, String(asRecordData(data).apiKeyValue));
      return { id: provider.name, ...provider };
    }
    if (resource === "mcpServers") {
      const record = asRecordData(data);
      if (typeof record.enabled === "boolean") await app().SetMCPServerEnabled(id, record.enabled);
      if (record.retry === true) await app().RetryMCPServer(id);
      if (record.transport || record.command || record.url || record.tier || record.args) await app().UpdateMCPServer(id, mcpInputFromData(data, previous));
      return { ...previous, ...record, id };
    }
    if (resource === "skills") {
      const record = asRecordData(data);
      if (typeof record.enabled === "boolean") await app().SetSkillEnabled(id, record.enabled);
      if (record.refresh === true) await app().RefreshSkills();
      return { ...previous, ...record, id };
    }
    if (resource === "permissions") {
      const record = asRecordData(data);
      if (id === "mode" && typeof record.value === "string") await app().SetPermissionMode(record.value);
      if (id === "sandbox") {
        await app().SetSandbox(
          String(record.bash ?? previous.bash ?? "enforce"),
          Boolean(record.network ?? previous.network),
          String(record.workspaceRoot ?? previous.workspaceRoot ?? ""),
          parseList(record.allowWrite ?? previous.allowWrite),
        );
      }
      return { ...previous, ...record, id };
    }
    if (resource === "desktopPrefs") {
      const record = asRecordData(data);
      const value = String(record.value ?? "");
      if (id === "language") await app().SetDesktopLanguage(value);
      if (id === "theme" || id === "themeStyle") {
        const settings = await app().Settings();
        const theme = id === "theme" ? value : settings.desktopTheme || "dark";
        const style = id === "themeStyle" ? value : settings.desktopThemeStyle || "graphite";
        await app().SetDesktopAppearance(theme, style);
      }
      if (id === "closeBehavior") await app().SetCloseBehavior(value);
      return { ...previous, value, id };
    }
    return { id, ...(typeof data === "object" && data ? data : { value: data }) };
  },
  async delete(resource, id) {
    if (resource === "providers") await app().DeleteProvider(id);
    if (resource === "mcpServers") await app().RemoveMCPServer(id);
    if (resource === "memory") await app().Forget(id);
    if (resource === "permissions") {
      const [list, ...rest] = id.split(":");
      const rule = rest.join(":");
      if (list && rule) await app().RemovePermissionRule(list, rule);
    }
  },
};
