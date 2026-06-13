<script lang="ts">
  import { onMount } from "svelte";
  import { ShieldCheck } from "@lucide/svelte";
  import ActivitySidebar from "./components/ActivitySidebar.svelte";
  import CodeDashboard from "./components/CodeDashboard.svelte";
  import Composer from "./components/Composer.svelte";
  import ResourcePanel from "./components/ResourcePanel.svelte";
  import RunModeBar from "./components/RunModeBar.svelte";
  import Transcript from "./components/Transcript.svelte";
  import WorkDashboard from "./components/WorkDashboard.svelte";
  import { app, onAgentEvent } from "./lib/bridge";
  import { wailsDataProvider, workbenchResources } from "./lib/resourceProvider";
  import type {
    ActivityMode,
    CommandInfo,
    ContextPanelInfo,
    EffortInfo,
    FilePreview,
    ModelInfo,
    QuestionAnswer,
    RunMode,
    TabMeta,
    TranscriptItem,
    WireApproval,
    WireAsk,
    WireEvent,
    WorkspaceChangesView,
  } from "./lib/types";

  const runModes: Array<{ id: RunMode; label: string; hint: string }> = [
    { id: "ask", label: "Ask", hint: "Ask before fallback approvals." },
    { id: "auto", label: "Auto", hint: "Use normal mode while allowing configured defaults." },
    { id: "yolo", label: "YOLO", hint: "Auto-approve ordinary tools; hard denies still apply." },
    { id: "plan", label: "Plan", hint: "Keep the next turn read-only until a plan is approved." },
    { id: "goal", label: "Goal", hint: "Continue a saved long-running objective." },
  ];

  let activityMode = $state<ActivityMode>("work");
  let runMode = $state<RunMode>("ask");
  let tabs = $state<TabMeta[]>([]);
  let models = $state<ModelInfo[]>([]);
  let effort = $state<EffortInfo>({ current: "auto", supported: ["auto"] });
  let commands = $state<CommandInfo[]>([]);
  let selectedModel = $state("");
  let input = $state("");
  let transcript = $state<TranscriptItem[]>([
    {
      id: "system-welcome",
      role: "system",
      body: "Workbench preview is ready. Work/Code activity mode is independent from Ask/Auto/YOLO/Plan/Goal run mode.",
    },
  ]);
  let resources = $state<Array<{ name: string; total: number }>>([]);
  let context = $state<ContextPanelInfo | undefined>();
  let changes = $state<WorkspaceChangesView | undefined>();
  let filePreview = $state<FilePreview | undefined>();
  let pendingApproval = $state<WireApproval | undefined>();
  let pendingAsk = $state<WireAsk | undefined>();
  let loading = $state(true);
  let sending = $state(false);

  const activeTab = $derived(tabs.find((tab) => tab.active) ?? tabs[0]);
  const modeLabel = $derived(`${activityMode.toUpperCase()} + ${runMode.toUpperCase()}`);

  onMount(() => {
    const unsubscribe = onAgentEvent(handleEvent);
    void refresh();
    return unsubscribe;
  });

  function updateLastAssistant(text: string) {
    let current: TranscriptItem | undefined;
    for (let index = transcript.length - 1; index >= 0; index -= 1) {
      const item = transcript[index];
      if (item.role === "assistant" && item.pending) {
        current = item;
        break;
      }
    }
    if (current) {
      current.body += text;
      return;
    }
    transcript.push({ id: `assistant-${Date.now()}`, role: "assistant", body: text, pending: true });
  }

  function handleEvent(event: WireEvent) {
    if (event.tabId && activeTab?.id && event.tabId !== activeTab.id) return;
    if (event.kind === "turn_started") {
      sending = true;
      pendingApproval = undefined;
      pendingAsk = undefined;
      transcript.push({ id: `assistant-${Date.now()}`, role: "assistant", body: "", pending: true });
    }
    if (event.kind === "reasoning" && event.reasoning) {
      transcript.push({ id: `reasoning-${Date.now()}`, role: "reasoning", title: "reasoning", body: event.reasoning, pending: true });
    }
    if ((event.kind === "text" || event.kind === "message") && event.text) updateLastAssistant(event.text);
    if (event.kind === "tool_dispatch" && event.tool) {
      transcript.push({
        id: `tool-${event.tool.id ?? Date.now()}`,
        role: "tool",
        title: event.tool.name,
        body: event.tool.args ?? "",
        pending: true,
        readOnly: event.tool.readOnly,
      });
    }
    if (event.kind === "tool_result" && event.tool) {
      const tool = transcript.find((item) => item.id === `tool-${event.tool?.id}`);
      if (tool) {
        tool.body += event.tool.output ? `\n${event.tool.output}` : "";
        tool.body += event.tool.err ? `\n${event.tool.err}` : "";
        tool.pending = false;
      }
    }
    if (event.kind === "approval_request" && event.approval) {
      pendingApproval = event.approval;
      sending = false;
    }
    if (event.kind === "ask_request" && event.ask) {
      pendingAsk = event.ask;
      sending = false;
    }
    if (event.kind === "usage" && event.usage) {
      transcript.push({
        id: `usage-${Date.now()}`,
        role: "notice",
        title: "usage",
        body: `${event.usage.totalTokens ?? 0} tokens`,
      });
    }
    if (event.kind === "notice" && event.text) {
      transcript.push({ id: `notice-${Date.now()}`, role: "notice", body: event.text });
    }
    if (event.kind === "turn_done") {
      sending = false;
      for (const item of transcript) item.pending = false;
      void refreshCodeDock();
    }
  }

  async function refresh() {
    loading = true;
    try {
      tabs = await app().ListTabs();
      const active = tabs.find((tab) => tab.active) ?? tabs[0];
      models = active ? await app().ModelsForTab(active.id) : [];
      selectedModel = models.find((model) => model.current)?.name ?? models[0]?.name ?? "";
      effort = active ? await app().EffortForTab(active.id) : { current: "auto", supported: ["auto"] };
      commands = await app().Commands();
      resources = await Promise.all(
        workbenchResources.slice(0, 8).map(async (name) => {
          const result = await wailsDataProvider.list(name);
          return { name, total: result.total };
        }),
      );
      await refreshCodeDock(active);
    } finally {
      loading = false;
    }
  }

  async function refreshCodeDock(tab = activeTab) {
    if (!tab) return;
    context = await app().ContextPanel(tab.id);
    changes = await app().WorkspaceChanges();
  }

  async function send() {
    const text = input.trim();
    if (!text || !activeTab) return;
    input = "";
    transcript.push({ id: `user-${Date.now()}`, role: "user", body: text });
    await app().SubmitDisplayToTab(activeTab.id, text, text);
  }

  async function cancel() {
    if (!activeTab) return;
    await app().CancelTab(activeTab.id);
  }

  async function switchTab(tab: TabMeta) {
    await app().SetActiveTab(tab.id);
    tabs = tabs.map((item) => ({ ...item, active: item.id === tab.id }));
    await refresh();
  }

  async function closeTab(tab: TabMeta) {
    await app().CloseTab(tab.id);
    await refresh();
  }

  async function switchModel(event: Event) {
    const next = (event.currentTarget as HTMLSelectElement).value;
    selectedModel = next;
    if (activeTab && next) await app().SetModelForTab(activeTab.id, next);
  }

  async function switchEffort(event: Event) {
    const next = (event.currentTarget as HTMLSelectElement).value;
    effort = { ...effort, current: next };
    if (activeTab && next) await app().SetEffortForTab(activeTab.id, next);
  }

  async function selectRunMode(next: RunMode) {
    runMode = next;
    if (!activeTab) return;
    const backendMode = next === "plan" ? "plan" : next === "yolo" ? "yolo" : "normal";
    await app().SetModeForTab(activeTab.id, backendMode);
    tabs = tabs.map((tab) => (tab.id === activeTab.id ? { ...tab, mode: backendMode } : tab));
  }

  async function answerApproval(allow: boolean, session: boolean, persist: boolean) {
    if (!activeTab || !pendingApproval) return;
    const approval = pendingApproval;
    pendingApproval = undefined;
    await app().ApproveTab(activeTab.id, approval.id, allow, session, persist);
  }

  async function answerAsk(answers: QuestionAnswer[]) {
    if (!activeTab || !pendingAsk) return;
    const ask = pendingAsk;
    pendingAsk = undefined;
    await app().AnswerQuestionForTab(activeTab.id, ask.id, answers);
  }

  async function previewFile(path: string) {
    filePreview = await app().ReadFile(path);
    activityMode = "code";
  }
</script>

<svelte:head>
  <title>VoltUI Workbench</title>
</svelte:head>

<main class="workbench" data-activity={activityMode}>
  <ActivitySidebar
    {activityMode}
    {tabs}
    {activeTab}
    {resources}
    onActivity={(mode) => (activityMode = mode)}
    onTab={switchTab}
    onCloseTab={closeTab}
  />

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
        <select aria-label="Effort" value={effort.current} onchange={switchEffort}>
          {#each effort.supported as level (level)}
            <option value={level}>{level}</option>
          {/each}
        </select>
        <span class="mode-chip"><ShieldCheck size={14} /> {modeLabel}</span>
      </div>
    </header>

    <RunModeBar {runModes} {runMode} onSelect={selectRunMode} />

    {#if activityMode === "work"}
      <WorkDashboard {activeTab} {resources} />
    {:else}
      <CodeDashboard {context} {changes} {filePreview} />
    {/if}

    <ResourcePanel {activityMode} {resources} />

    <Transcript
      items={transcript}
      {loading}
      {sending}
      approval={pendingApproval}
      ask={pendingAsk}
      onApprove={answerApproval}
      onAnswerAsk={answerAsk}
      onDismissAsk={() => (pendingAsk = undefined)}
    />

    <Composer
      {input}
      {activityMode}
      {runMode}
      {commands}
      {sending}
      onInput={(value) => (input = value)}
      onSend={send}
      onCancel={cancel}
      onPreviewFile={previewFile}
    />
  </section>
</main>
