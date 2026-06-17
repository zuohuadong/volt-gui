import type {
  DataProvider,
  BaseRecord,
  GetListParams,
  GetListResult,
  GetOneParams,
  GetOneResult,
  CreateParams,
  CreateResult,
  UpdateParams,
  UpdateResult,
  DeleteParams,
  DeleteResult,
} from "@svadmin/core";
import { app } from "./bridge";
import type { MCPServerInput, MemoryView, ProviderView, ResourceRecord, SettingsView } from "./types";

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

// Helper: coerce an array of unknown into BaseRecord[] with stable ids.
function asRecords(value: unknown, idPrefix: string): BaseRecord[] {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      return { id: String(record.id ?? record.name ?? record.path ?? `${idPrefix}-${index}`), ...record } as BaseRecord;
    }
    return { id: `${idPrefix}-${index}`, value: item } as BaseRecord;
  });
}

function asRecordData(data: unknown): Record<string, unknown> {
  return typeof data === "object" && data !== null ? (data as Record<string, unknown>) : {};
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean);
  if (typeof value === "string") return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
  return [];
}

function providerFromData(data: unknown, previous?: BaseRecord): ProviderView {
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

function mcpInputFromData(data: unknown, previous?: BaseRecord): MCPServerInput {
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

function modelRefs(settings: SettingsView): BaseRecord[] {
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
      } as BaseRecord;
    }),
  );
}

function memoryEntries(memory: MemoryView): BaseRecord[] {
  const facts = memory.facts.map(
    (fact) =>
      ({
        id: fact.name,
        name: fact.name,
        title: fact.title ?? fact.name,
        description: fact.description,
        type: fact.type,
        body: fact.body,
      }) as BaseRecord,
  );
  const docs = memory.docs.map(
    (doc) =>
      ({
        id: `doc:${doc.scope}`,
        name: doc.path,
        scope: doc.scope,
        body: doc.body,
        type: "doc",
      }) as BaseRecord,
  );
  return [...facts, ...docs];
}

// In-memory task queue for the Work dashboard. Backend integration can replace this later.
let taskRecords: BaseRecord[] = [
  { id: "task-work-dashboard", title: "Wire Work dashboard tasks", status: "ready", owner: "Workbench", mode: "work", priority: "high", summary: "Expose task queue controls from the svadmin-compatible resource layer." },
  { id: "task-runtime-smoke", title: "Run Wails runtime smoke", status: "blocked", owner: "Desktop", mode: "work", priority: "high", summary: "Requires a native Wails runtime session to verify bindings beyond browser mock." },
  { id: "task-code-diff-edges", title: "Review changed-file edge cases", status: "active", owner: "Code dock", mode: "code", priority: "medium", summary: "Rename, staged, binary, and truncated diffs still need richer parity." },
];

// Wails-backed DataProvider implementing the svadmin DataProvider contract.
// Wails bindings do not support pagination/filter/sort natively, so this
// adapter does client-side filtering on the returned arrays.
export const wailsDataProvider: DataProvider = {
  async getList<TData extends BaseRecord = BaseRecord>(params: GetListParams): Promise<GetListResult<TData>> {
    const resource = params.resource as WorkbenchResource;
    let data: BaseRecord[] = [];
    switch (resource) {
      case "models": {
        data = modelRefs(await app().Settings());
        break;
      }
      case "providers": {
        const settings = await app().Settings();
        data = asRecords(settings.providers, "provider");
        break;
      }
      case "mcpServers": {
        data = asRecords((await app().Capabilities()).servers, "mcp");
        break;
      }
      case "skills": {
        const skills = (await app().Capabilities()).skills ?? [];
        data = asRecords(skills, "skill");
        break;
      }
      case "permissions": {
        const settings = await app().Settings();
        data = [
          { id: "mode", name: "mode", value: settings.permissions.mode },
          { id: "allow", name: "allow", rules: settings.permissions.allow },
          { id: "ask", name: "ask", rules: settings.permissions.ask },
          { id: "deny", name: "deny", rules: settings.permissions.deny },
          { id: "sandbox", name: "sandbox", ...settings.sandbox },
        ];
        break;
      }
      case "desktopPrefs": {
        const settings = await app().Settings();
        data = [
          { id: "language", name: "language", value: settings.desktopLanguage || "en" },
          { id: "theme", name: "theme", value: settings.desktopTheme || "dark" },
          { id: "themeStyle", name: "themeStyle", value: settings.desktopThemeStyle || "graphite" },
          { id: "closeBehavior", name: "closeBehavior", value: settings.closeBehavior || "background" },
        ];
        break;
      }
      case "memory": {
        const memory = await app().Memory();
        data = memoryEntries(memory);
        break;
      }
      case "tasks": {
        data = taskRecords.map((task) => ({ ...task }));
        break;
      }
      case "sessions": {
        data = asRecords(await app().ListSessions(), "session");
        break;
      }
      case "topics": {
        data = asRecords(await app().ListTabs(), "tab");
        break;
      }
      default:
        data = [];
    }
    return { data: data as unknown as TData[], total: data.length };
  },

  async getOne<TData extends BaseRecord = BaseRecord>(params: GetOneParams): Promise<GetOneResult<TData>> {
    const result = await this.getList({ resource: params.resource });
    const record = result.data.find((item) => String(item.id) === String(params.id)) ?? ({ id: params.id } as BaseRecord);
    return { data: record as unknown as TData };
  },

  async create<TData extends BaseRecord = BaseRecord, TVariables = unknown>(params: CreateParams<TVariables>): Promise<CreateResult<TData>> {
    const resource = params.resource as WorkbenchResource;
    const data = params.variables;
    if (resource === "providers") {
      const provider = providerFromData(data);
      await app().SaveProvider(provider);
      const record = asRecordData(data);
      if (typeof record.apiKeyValue === "string") await app().SetProviderKey(provider.apiKeyEnv, record.apiKeyValue);
      return { data: { id: provider.name, ...provider } as unknown as TData };
    }
    if (resource === "mcpServers") {
      const input = mcpInputFromData(data);
      const tools = await app().AddMCPServer(input);
      return { data: { id: input.name, ...input, tools } as unknown as TData };
    }
    if (resource === "permissions") {
      const record = asRecordData(data);
      const list = String(record.list ?? "ask");
      const rule = String(record.rule ?? "");
      await app().AddPermissionRule(list, rule);
      return { data: { id: `${list}:${rule}`, list, rule } as unknown as TData };
    }
    if (resource === "memory") {
      const record = asRecordData(data);
      const scope = String(record.scope ?? "project");
      const note = String(record.note ?? record.description ?? record.body ?? "").trim();
      const path = await app().Remember(scope, note);
      return { data: { id: `doc:${scope}`, scope, path, note } as unknown as TData };
    }
    return { data: { id: crypto.randomUUID(), ...(typeof data === "object" && data ? (data as object) : { value: data }) } as unknown as TData };
  },

  async update<TData extends BaseRecord = BaseRecord, TVariables = unknown>(params: UpdateParams<TVariables>): Promise<UpdateResult<TData>> {
    const resource = params.resource as WorkbenchResource;
    const id = String(params.id);
    const data = params.variables;
    const previous = (await this.getOne({ resource: params.resource, id })).data;
    if (resource === "models") {
      const record = asRecordData(data);
      if (record.planner === true) await app().SetPlannerModel(id);
      if (record.planner === false) await app().SetPlannerModel("");
      if (record.default === true) await app().SetDefaultModel(id);
      return { data: { ...previous, ...record, id } as unknown as TData };
    }
    if (resource === "providers") {
      const provider = providerFromData(data, previous);
      await app().SaveProvider(provider);
      const recordData = asRecordData(data);
      if (typeof recordData.apiKeyValue === "string") await app().SetProviderKey(provider.apiKeyEnv, recordData.apiKeyValue);
      return { data: { id: provider.name, ...provider } as unknown as TData };
    }
    if (resource === "mcpServers") {
      const record = asRecordData(data);
      if (typeof record.enabled === "boolean") await app().SetMCPServerEnabled(id, record.enabled);
      if (record.retry === true) await app().RetryMCPServer(id);
      if (record.transport || record.command || record.url || record.tier || record.args) await app().UpdateMCPServer(id, mcpInputFromData(data, previous));
      return { data: { ...previous, ...record, id } as unknown as TData };
    }
    if (resource === "skills") {
      const record = asRecordData(data);
      if (typeof record.enabled === "boolean") await app().SetSkillEnabled(id, record.enabled);
      if (record.refresh === true) await app().RefreshSkills();
      return { data: { ...previous, ...record, id } as unknown as TData };
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
      return { data: { ...previous, ...record, id } as unknown as TData };
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
      return { data: { ...previous, value, id } as unknown as TData };
    }
    if (resource === "tasks") {
      const record = asRecordData(data);
      taskRecords = taskRecords.map((task) => (String(task.id) === id ? { ...task, ...record, id } : task));
      return { data: (taskRecords.find((task) => String(task.id) === id) ?? { id, ...record }) as unknown as TData };
    }
    return { data: { id, ...(typeof data === "object" && data ? (data as object) : { value: data }) } as unknown as TData };
  },

  async deleteOne<TData extends BaseRecord = BaseRecord, TVariables = unknown>(params: DeleteParams<TVariables>): Promise<DeleteResult<TData>> {
    const resource = params.resource as WorkbenchResource;
    const id = String(params.id);
    if (resource === "providers") await app().DeleteProvider(id);
    if (resource === "mcpServers") await app().RemoveMCPServer(id);
    if (resource === "memory") await app().Forget(id);
    if (resource === "permissions") {
      const [list, ...rest] = id.split(":");
      const rule = rest.join(":");
      if (list && rule) await app().RemovePermissionRule(list, rule);
    }
    return { data: { id } as unknown as TData };
  },

  getApiUrl: () => "wails://localhost",
};

// Thin convenience wrapper so workbench components can keep using the simple
// `list/getOne/create/update/delete` signatures while the real DataProvider
// contract lives in `wailsDataProvider` above. This keeps the svadmin
// DataProvider compatible for svadmin components (AdminApp, AutoTable, etc.)
// while the custom workbench components use the simpler API.
export const workbenchDataProvider = {
  async list(resource: WorkbenchResource): Promise<{ data: ResourceRecord[]; total: number }> {
    const result = await wailsDataProvider.getList({ resource });
    return { data: result.data as ResourceRecord[], total: result.total };
  },
  async getOne(resource: WorkbenchResource, id: string): Promise<ResourceRecord> {
    const result = await wailsDataProvider.getOne({ resource, id });
    return result.data as ResourceRecord;
  },
  async create(resource: WorkbenchResource, data: unknown): Promise<ResourceRecord> {
    const result = await wailsDataProvider.create({ resource, variables: data });
    return result.data as ResourceRecord;
  },
  async update(resource: WorkbenchResource, id: string, data: unknown): Promise<ResourceRecord> {
    const result = await wailsDataProvider.update({ resource, id, variables: data });
    return result.data as ResourceRecord;
  },
  async delete(resource: WorkbenchResource, id: string): Promise<void> {
    await wailsDataProvider.deleteOne({ resource, id });
  },
};
