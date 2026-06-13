<script lang="ts">
  import { onMount } from "svelte";
  import { Activity, Bot, Brain, Code2, Database, FolderGit2, Play, Send, ShieldCheck } from "@lucide/svelte";
  import { app, onAgentEvent } from "./lib/bridge";
  import { wailsDataProvider, workbenchResources } from "./lib/resourceProvider";
  import type { ActivityMode, ModelInfo, RunMode, TabMeta, TranscriptItem } from "./lib/types";

  const runModes: Array<{ id: RunMode; label: string }> = [
    { id: "ask", label: "Ask" },
    { id: "auto", label: "Auto" },
    { id: "yolo", label: "YOLO" },
    { id: "plan", label: "Plan" },
    { id: "goal", label: "Goal" },
  ];

  let activityMode = $state<ActivityMode>("work");
  let runMode = $state<RunMode>("ask");
  let tabs = $state<TabMeta[]>([]);
  let models = $state<ModelInfo[]>([]);
  let selectedModel = $state("");
  let input = $state("");
  let transcript = $state<TranscriptItem[]>([
    {
      id: "system-welcome",
      role: "system",
      body: "Workbench preview is ready. Switch Work/Code without changing the run mode.",
    },
  ]);
  let resources = $state<Array<{ name: string; total: number }>>([]);
  let loading = $state(true);
  let sending = $state(false);

  const activeTab = $derived(tabs.find((tab) => tab.active) ?? tabs[0]);
  const modeLabel = $derived(`${activityMode.toUpperCase()} + ${runMode.toUpperCase()}`);

  onMount(() => {
    const unsubscribe = onAgentEvent((event) => {
      if (event.kind === "turn_started") {
        sending = true;
        transcript.push({ id: `assistant-${Date.now()}`, role: "assistant", body: "", pending: true });
      }
      if (event.kind === "text" && event.text) {
        let current: TranscriptItem | undefined;
        for (let index = transcript.length - 1; index >= 0; index -= 1) {
          const item = transcript[index];
          if (item.role === "assistant" && item.pending) {
            current = item;
            break;
          }
        }
        if (current) current.body += event.text;
      }
      if (event.kind === "tool_dispatch" && event.tool) {
        transcript.push({
          id: `tool-${event.tool.id ?? Date.now()}`,
          role: "tool",
          body: `${event.tool.name}${event.tool.args ? ` ${event.tool.args}` : ""}`,
          pending: true,
        });
      }
      if (event.kind === "tool_result" && event.tool) {
        const tool = transcript.find((item) => item.id === `tool-${event.tool?.id}`);
        if (tool) {
          tool.body += event.tool.output ? `\n${event.tool.output}` : "";
          tool.pending = false;
        }
      }
      if (event.kind === "turn_done") {
        sending = false;
        for (const item of transcript) item.pending = false;
      }
    });
    void refresh();
    return unsubscribe;
  });

  async function refresh() {
    loading = true;
    try {
      tabs = await app().ListTabs();
      const active = tabs.find((tab) => tab.active) ?? tabs[0];
      models = active ? await app().ModelsForTab(active.id) : [];
      selectedModel = models.find((model) => model.current)?.name ?? models[0]?.name ?? "";
      resources = await Promise.all(
        workbenchResources.slice(0, 6).map(async (name) => {
          const result = await wailsDataProvider.list(name);
          return { name, total: result.total };
        }),
      );
    } finally {
      loading = false;
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || !activeTab) return;
    input = "";
    transcript.push({ id: `user-${Date.now()}`, role: "user", body: text });
    await app().SubmitToTab(activeTab.id, text);
  }

  async function switchModel(event: Event) {
    const next = (event.currentTarget as HTMLSelectElement).value;
    selectedModel = next;
    if (activeTab && next) await app().SetModelForTab(activeTab.id, next);
  }
</script>

<svelte:head>
  <title>VoltUI Workbench</title>
</svelte:head>

<main class="workbench" data-activity={activityMode}>
  <aside class="sidebar">
    <div class="brand">
      <div class="brand__mark"><Activity size={18} /></div>
      <div>
        <strong>VoltUI</strong>
        <span>Workbench</span>
      </div>
    </div>

    <div class="activity-switch" aria-label="Activity mode">
      <button class:active={activityMode === "work"} type="button" onclick={() => (activityMode = "work")}>
        <Bot size={16} />
        Work
      </button>
      <button class:active={activityMode === "code"} type="button" onclick={() => (activityMode = "code")}>
        <Code2 size={16} />
        Code
      </button>
    </div>

    <section>
      <h2>Sessions</h2>
      <div class="nav-list">
        {#each tabs as tab (tab.id)}
          <button class:active={tab.id === activeTab?.id} type="button" onclick={async () => { await app().SetActiveTab(tab.id); tabs = tabs.map((item) => ({ ...item, active: item.id === tab.id })); }}>
            <FolderGit2 size={15} />
            <span>{tab.topicTitle || tab.workspaceName || "Untitled"}</span>
          </button>
        {/each}
      </div>
    </section>

    <section>
      <h2>Resources</h2>
      <div class="resource-list">
        {#each resources as resource (resource.name)}
          <span><Database size={13} /> {resource.name} <em>{resource.total}</em></span>
        {/each}
      </div>
    </section>
  </aside>

  <section class="main-stage">
    <header class="topbar">
      <div>
        <p>{activeTab?.workspaceName || "Global"}</p>
        <h1>{activityMode === "work" ? "Work dashboard" : "Code workspace"}</h1>
      </div>
      <div class="topbar__controls">
        <select aria-label="Model" value={selectedModel} onchange={switchModel}>
          {#each models as model (model.name)}
            <option value={model.name}>{model.label || model.name}</option>
          {/each}
        </select>
        <span class="mode-chip"><ShieldCheck size={14} /> {modeLabel}</span>
      </div>
    </header>

    <div class="run-modes" aria-label="Run mode">
      {#each runModes as mode (mode.id)}
        <button class:active={runMode === mode.id} type="button" onclick={() => (runMode = mode.id)}>
          {mode.label}
        </button>
      {/each}
    </div>

    {#if activityMode === "work"}
      <section class="dashboard-grid">
        <article>
          <Brain size={20} />
          <h2>Goals and tasks</h2>
          <p>Track long-running objectives, reminders, memory, and operation resources here.</p>
        </article>
        <article>
          <Database size={20} />
          <h2>Resource console</h2>
          <p>svadmin-compatible resources back providers, models, MCP servers, skills, permissions, and memory.</p>
        </article>
      </section>
    {:else}
      <section class="dashboard-grid">
        <article>
          <Code2 size={20} />
          <h2>Repository context</h2>
          <p>Code mode prioritizes files, changed diffs, checkpoints, shell/tool trace, and approvals.</p>
        </article>
        <article>
          <Play size={20} />
          <h2>Execution trace</h2>
          <p>Tool calls and nested sub-agent calls stay visible while the transcript streams.</p>
        </article>
      </section>
    {/if}

    <section class="transcript" aria-busy={sending || loading}>
      {#each transcript as item (item.id)}
        <article class={`message message--${item.role}`} class:pending={item.pending}>
          <span>{item.role}</span>
          <p>{item.body}</p>
        </article>
      {/each}
    </section>

    <form class="composer" onsubmit={(event) => { event.preventDefault(); void send(); }}>
      <textarea bind:value={input} placeholder={`Send a ${activityMode} request...`} rows="3"></textarea>
      <button type="submit" disabled={!input.trim() || sending}>
        <Send size={16} />
        Send
      </button>
    </form>
  </section>
</main>
