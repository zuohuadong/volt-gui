<script lang="ts">
  import { onMount } from "svelte";
  import { Database, KeyRound, MemoryStick, Palette, Plus, RefreshCw, Save, Server, ShieldCheck, Trash2, Wrench } from "@lucide/svelte";
  import type { ActivityMode, ResourceRecord } from "../lib/types";
  import { wailsDataProvider, type WorkbenchResource } from "../lib/resourceProvider";

  const editableResources: WorkbenchResource[] = ["providers", "models", "mcpServers", "skills", "permissions", "desktopPrefs"];
  const icons = {
    providers: Server,
    models: Database,
    mcpServers: Wrench,
    skills: Wrench,
    permissions: ShieldCheck,
    desktopPrefs: Palette,
    memory: MemoryStick,
    updates: KeyRound,
  };

  let {
    activityMode,
    resources,
    onChanged,
  }: {
    activityMode: ActivityMode;
    resources: Array<{ name: string; total: number }>;
    onChanged: () => void;
  } = $props();

  let selected = $state<WorkbenchResource>("providers");
  let records = $state<ResourceRecord[]>([]);
  let providerDraft = $state({ name: "", kind: "openai", baseUrl: "", models: "", apiKeyEnv: "", apiKeyValue: "" });
  let serverDraft = $state({ name: "", transport: "stdio", command: "", args: "", url: "", tier: "lazy" });
  let permissionDraft = $state({ list: "ask", rule: "" });
  let busy = $state(false);
  let status = $state("");

  onMount(() => {
    void loadRecords();
  });

  function text(record: ResourceRecord, key: string, fallback = "") {
    const value = record[key];
    return typeof value === "string" ? value : fallback;
  }

  function bool(record: ResourceRecord, key: string) {
    return Boolean(record[key]);
  }

  function list(record: ResourceRecord, key: string) {
    const value = record[key];
    if (Array.isArray(value)) return value.map(String);
    if (typeof value === "string") return value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    return [];
  }

  function recordValue(id: string, fallback = "") {
    return text(records.find((record) => record.id === id) ?? { id, value: fallback }, "value", fallback);
  }

  function providerPayload() {
    const models = providerDraft.models.split(/[,\n]/).map((item) => item.trim()).filter(Boolean);
    return {
      name: providerDraft.name.trim(),
      kind: providerDraft.kind.trim() || "openai",
      baseUrl: providerDraft.baseUrl.trim(),
      models,
      default: models[0] ?? "",
      apiKeyEnv: providerDraft.apiKeyEnv.trim(),
      keySet: false,
      balanceUrl: "",
      contextWindow: 0,
      supportedEfforts: [],
      defaultEffort: "",
      apiKeyValue: providerDraft.apiKeyValue,
    };
  }

  function serverPayload() {
    return {
      name: serverDraft.name.trim(),
      transport: serverDraft.transport,
      command: serverDraft.command.trim(),
      args: serverDraft.args.split(/[,\n]/).map((item) => item.trim()).filter(Boolean),
      url: serverDraft.url.trim(),
      tier: serverDraft.tier.trim() || "lazy",
    };
  }

  async function loadRecords(resource = selected) {
    busy = true;
    try {
      const result = await wailsDataProvider.list(resource);
      records = result.data;
      status = `${resource}: ${result.total}`;
    } finally {
      busy = false;
    }
  }

  async function selectResource(resource: WorkbenchResource) {
    selected = resource;
    await loadRecords(resource);
  }

  async function mutate(label: string, action: () => Promise<unknown>) {
    busy = true;
    status = `${label}...`;
    try {
      await action();
      await loadRecords();
      await onChanged();
      status = `${label} saved`;
    } catch (error) {
      status = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }

  function editProvider(record: ResourceRecord) {
    providerDraft = {
      name: text(record, "name", record.id),
      kind: text(record, "kind", "openai"),
      baseUrl: text(record, "baseUrl"),
      models: list(record, "models").join(", "),
      apiKeyEnv: text(record, "apiKeyEnv"),
      apiKeyValue: "",
    };
  }

  function providerTemplate() {
    providerDraft = {
      name: "smoke",
      kind: "openai",
      baseUrl: "https://smoke.example/v1",
      models: "smoke-large, smoke-small",
      apiKeyEnv: "SMOKE_API_KEY",
      apiKeyValue: "test-key",
    };
  }

  function serverTemplate() {
    serverDraft = {
      name: "smoke-mcp",
      transport: "stdio",
      command: "smoke-mcp",
      args: "",
      url: "",
      tier: "lazy",
    };
  }

  function permissionTemplate() {
    permissionDraft = { list: "ask", rule: "bash(echo *)" };
  }

  async function saveProvider() {
    const payload = providerPayload();
    if (!payload.name || payload.models.length === 0) {
      status = "Provider name and model are required";
      return;
    }
    await mutate("provider", async () => {
      await wailsDataProvider.create("providers", payload);
    });
    providerDraft = { name: "", kind: "openai", baseUrl: "", models: "", apiKeyEnv: "", apiKeyValue: "" };
  }

  async function addServer() {
    const payload = serverPayload();
    if (!payload.name) {
      status = "MCP server name is required";
      return;
    }
    await mutate("mcp server", async () => {
      await wailsDataProvider.create("mcpServers", payload);
    });
    serverDraft = { name: "", transport: "stdio", command: "", args: "", url: "", tier: "lazy" };
  }

  async function addPermissionRule() {
    if (!permissionDraft.rule.trim()) return;
    await mutate("permission rule", async () => {
      await wailsDataProvider.create("permissions", permissionDraft);
    });
    permissionDraft = { ...permissionDraft, rule: "" };
  }
</script>

<section class="resource-panel" aria-label="Resource console">
  <div class="resource-panel__head">
    <div>
      <p>{activityMode === "work" ? "Work resources" : "Code resources"}</p>
      <h2>svadmin resource layer</h2>
    </div>
    <span>{status}</span>
  </div>
  <div class="resource-grid">
    {#each resources as resource (resource.name)}
      {@const Icon = icons[resource.name as keyof typeof icons] ?? Database}
      <button
        class={selected === resource.name ? "selected" : ""}
        data-resource={resource.name}
        type="button"
        onclick={() => editableResources.includes(resource.name as WorkbenchResource) && selectResource(resource.name as WorkbenchResource)}
        disabled={!editableResources.includes(resource.name as WorkbenchResource)}
      >
        <Icon size={16} />
        <span>{resource.name}</span>
        <strong>{resource.total}</strong>
      </button>
    {/each}
  </div>

  <div class="resource-console" data-testid="resource-console">
    <div class="resource-console__toolbar">
      <strong>{selected}</strong>
      <button type="button" disabled={busy} onclick={() => loadRecords()}><RefreshCw size={14} /> Refresh</button>
    </div>

    {#if selected === "providers"}
      <div class="resource-form" data-testid="provider-form">
        <input aria-label="Provider name" placeholder="provider" bind:value={providerDraft.name} />
        <input aria-label="Provider kind" placeholder="kind" bind:value={providerDraft.kind} />
        <input aria-label="Provider base URL" placeholder="base url" bind:value={providerDraft.baseUrl} />
        <input aria-label="Provider models" placeholder="model-a, model-b" bind:value={providerDraft.models} />
        <input aria-label="Provider key env" placeholder="API_KEY_ENV" bind:value={providerDraft.apiKeyEnv} />
        <input aria-label="Provider key value" placeholder="key value" bind:value={providerDraft.apiKeyValue} />
        <button type="button" disabled={busy} onclick={providerTemplate}>Template</button>
        <button type="button" disabled={busy} onclick={saveProvider}><Save size={14} /> Save</button>
      </div>
      <div class="resource-table">
        {#each records as record (record.id)}
          <article>
            <button type="button" onclick={() => editProvider(record)}>{text(record, "name", record.id)}</button>
            <span>{text(record, "kind")} · {list(record, "models").join(", ")}</span>
            <em>{bool(record, "keySet") ? "key set" : "no key"}</em>
            <button type="button" disabled={busy} onclick={() => mutate("delete provider", () => wailsDataProvider.delete("providers", record.id))}>
              <Trash2 size={14} />
            </button>
          </article>
        {/each}
      </div>
    {:else if selected === "models"}
      <div class="resource-table">
        {#each records as record (record.id)}
          <article>
            <strong>{record.id}</strong>
            <span>{bool(record, "default") && bool(record, "planner") ? "default + planner" : bool(record, "default") ? "default" : bool(record, "planner") ? "planner" : "available"}</span>
            <button type="button" disabled={busy || bool(record, "default")} onclick={() => mutate("default model", () => wailsDataProvider.update("models", record.id, { default: true }))}>Default</button>
            <button type="button" disabled={busy || bool(record, "planner")} onclick={() => mutate("planner model", () => wailsDataProvider.update("models", record.id, { planner: true }))}>Planner</button>
          </article>
        {/each}
      </div>
    {:else if selected === "mcpServers"}
      <div class="resource-form" data-testid="mcp-form">
        <input aria-label="MCP name" placeholder="server" bind:value={serverDraft.name} />
        <select aria-label="MCP transport" bind:value={serverDraft.transport}>
          <option value="stdio">stdio</option>
          <option value="http">http</option>
          <option value="sse">sse</option>
        </select>
        <input aria-label="MCP command" placeholder="command" bind:value={serverDraft.command} />
        <input aria-label="MCP args" placeholder="args" bind:value={serverDraft.args} />
        <input aria-label="MCP URL" placeholder="url" bind:value={serverDraft.url} />
        <button type="button" disabled={busy} onclick={serverTemplate}>Template</button>
        <button type="button" disabled={busy} onclick={addServer}><Plus size={14} /> Add</button>
      </div>
      <div class="resource-table">
        {#each records as record (record.id)}
          <article>
            <strong>{record.id}</strong>
            <span>{text(record, "status")} · {text(record, "transport")} · {String(record.tools ?? 0)} tools</span>
            <button type="button" disabled={busy} onclick={() => mutate("toggle mcp", () => wailsDataProvider.update("mcpServers", record.id, { enabled: text(record, "status") === "disabled" }))}>
              {text(record, "status") === "disabled" ? "Enable" : "Disable"}
            </button>
            <button type="button" disabled={busy} onclick={() => mutate("retry mcp", () => wailsDataProvider.update("mcpServers", record.id, { retry: true }))}>Retry</button>
          </article>
        {/each}
      </div>
    {:else if selected === "skills"}
      <div class="resource-console__toolbar">
        <button type="button" disabled={busy} onclick={() => mutate("refresh skills", () => wailsDataProvider.update("skills", "__refresh__", { refresh: true }))}>
          <RefreshCw size={14} /> Refresh skills
        </button>
      </div>
      <div class="resource-table">
        {#each records as record (record.id)}
          <article>
            <strong>{record.id}</strong>
            <span>{text(record, "scope")} · {text(record, "runAs")}</span>
            <button type="button" disabled={busy} onclick={() => mutate("toggle skill", () => wailsDataProvider.update("skills", record.id, { enabled: !bool(record, "enabled") }))}>
              {bool(record, "enabled") ? "Disable" : "Enable"}
            </button>
          </article>
        {/each}
      </div>
    {:else if selected === "permissions"}
      <div class="resource-form" data-testid="permission-form">
        <select aria-label="Permission mode" value={text(records.find((record) => record.id === "mode") ?? { id: "mode", value: "ask" }, "value", "ask")} onchange={(event) => mutate("permission mode", () => wailsDataProvider.update("permissions", "mode", { value: (event.currentTarget as HTMLSelectElement).value }))}>
          <option value="ask">ask</option>
          <option value="allow">allow</option>
          <option value="deny">deny</option>
        </select>
        <select aria-label="Permission list" bind:value={permissionDraft.list}>
          <option value="allow">allow</option>
          <option value="ask">ask</option>
          <option value="deny">deny</option>
        </select>
        <input aria-label="Permission rule" placeholder="tool(pattern)" bind:value={permissionDraft.rule} />
        <button type="button" disabled={busy} onclick={permissionTemplate}>Template</button>
        <button type="button" disabled={busy} onclick={addPermissionRule}><Plus size={14} /> Add rule</button>
      </div>
      <div class="resource-table">
        {#each records.filter((record) => record.id === "allow" || record.id === "ask" || record.id === "deny") as record (record.id)}
          <article>
            <strong>{record.id}</strong>
            <span>{list(record, "rules").join(", ") || "empty"}</span>
            {#each list(record, "rules") as rule (`${record.id}:${rule}`)}
              <button type="button" disabled={busy} onclick={() => mutate("remove rule", () => wailsDataProvider.delete("permissions", `${record.id}:${rule}`))}>
                <Trash2 size={14} /> {rule}
              </button>
            {/each}
          </article>
        {/each}
      </div>
    {:else if selected === "desktopPrefs"}
      <div class="resource-form" data-testid="desktop-prefs-form">
        <select aria-label="Desktop language" value={recordValue("language", "en")} onchange={(event) => mutate("desktop language", () => wailsDataProvider.update("desktopPrefs", "language", { value: (event.currentTarget as HTMLSelectElement).value }))}>
          <option value="en">English</option>
          <option value="zh">Chinese</option>
        </select>
        <select aria-label="Desktop theme" value={recordValue("theme", "dark")} onchange={(event) => mutate("desktop theme", () => wailsDataProvider.update("desktopPrefs", "theme", { value: (event.currentTarget as HTMLSelectElement).value }))}>
          <option value="dark">dark</option>
          <option value="light">light</option>
          <option value="system">system</option>
        </select>
        <select aria-label="Desktop theme style" value={recordValue("themeStyle", "graphite")} onchange={(event) => mutate("desktop style", () => wailsDataProvider.update("desktopPrefs", "themeStyle", { value: (event.currentTarget as HTMLSelectElement).value }))}>
          <option value="graphite">graphite</option>
          <option value="glacier">glacier</option>
          <option value="ember">ember</option>
          <option value="violet">violet</option>
        </select>
        <select aria-label="Close behavior" value={recordValue("closeBehavior", "background")} onchange={(event) => mutate("close behavior", () => wailsDataProvider.update("desktopPrefs", "closeBehavior", { value: (event.currentTarget as HTMLSelectElement).value }))}>
          <option value="background">background</option>
          <option value="quit">quit</option>
        </select>
      </div>
      <div class="resource-table">
        {#each records as record (record.id)}
          <article>
            <strong>{record.id}</strong>
            <span>{text(record, "value")}</span>
          </article>
        {/each}
      </div>
    {/if}
  </div>
</section>
