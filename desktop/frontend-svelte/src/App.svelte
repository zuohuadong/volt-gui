<script lang="ts">
  import { onMount } from "svelte";
  import { ShieldCheck } from "@lucide/svelte";
  import ActivitySidebar from "./components/ActivitySidebar.svelte";
  import CodeDashboard from "./components/CodeDashboard.svelte";
  import Composer from "./components/Composer.svelte";
  import ResourcePanel from "./components/ResourcePanel.svelte";
  import RunModeBar from "./components/RunModeBar.svelte";
  import Transcript from "./components/Transcript.svelte";
  import UpdateBanner from "./components/UpdateBanner.svelte";
  import WorkDashboard from "./components/WorkDashboard.svelte";
  import { app, onAgentEvent, onProjectTreeChanged } from "./lib/bridge";
  import { wailsDataProvider, workbenchResources } from "./lib/resourceProvider";
  import type {
    ActivityMode,
    CheckpointMeta,
    CommandInfo,
    ContextPanelInfo,
    EffortInfo,
    FilePreview,
    GoalInfo,
    HistoryMessage,
    MemoryView,
    ModelInfo,
    ProjectNode,
    QuestionAnswer,
    RunMode,
    TabMeta,
    TranscriptItem,
    WireApproval,
    WireAsk,
    WireEvent,
    WorkspaceDiffView,
    WorkspaceChangesView,
  } from "./lib/types";

  const runModes: Array<{ id: RunMode; label: string; hint: string }> = [
    { id: "ask", label: "Ask", hint: "Ask before fallback approvals." },
    { id: "auto", label: "Auto", hint: "Use normal mode while allowing configured defaults." },
    { id: "yolo", label: "YOLO", hint: "Auto-approve ordinary tools; hard denies still apply." },
    { id: "plan", label: "Plan", hint: "Keep the next turn read-only until a plan is approved." },
    { id: "goal", label: "Goal", hint: "Continue a saved long-running objective." },
  ];

  function welcomeTranscript(): TranscriptItem[] {
    return [
      {
        id: "system-welcome",
        role: "system",
        body: "Workbench preview is ready. Work/Code activity mode is independent from Ask/Auto/YOLO/Plan/Goal run mode.",
      },
    ];
  }

  let activityMode = $state<ActivityMode>("work");
  let runMode = $state<RunMode>("ask");
  let tabs = $state<TabMeta[]>([]);
  let models = $state<ModelInfo[]>([]);
  let effort = $state<EffortInfo>({ current: "auto", supported: ["auto"] });
  let commands = $state<CommandInfo[]>([]);
  let selectedModel = $state("");
  let input = $state("");
  let transcript = $state<TranscriptItem[]>(welcomeTranscript());
  let resources = $state<Array<{ name: string; total: number }>>([]);
  let projectTree = $state<ProjectNode[]>([]);
  let context = $state<ContextPanelInfo | undefined>();
  let goalInfo = $state<GoalInfo>({ objective: "", status: "idle" });
  let memoryView = $state<MemoryView>({ docs: [], facts: [], scopes: [], storeDir: "", available: false });
  let changes = $state<WorkspaceChangesView | undefined>();
  let checkpoints = $state<CheckpointMeta[]>([]);
  let filePreview = $state<FilePreview | undefined>();
  let diffPreview = $state<WorkspaceDiffView | undefined>();
  let pendingApproval = $state<WireApproval | undefined>();
  let pendingAsk = $state<WireAsk | undefined>();
  let loading = $state(true);
  let sending = $state(false);

  const activeTab = $derived(tabs.find((tab) => tab.active) ?? tabs[0]);
  const modeLabel = $derived(`${activityMode.toUpperCase()} + ${runMode.toUpperCase()}`);

  onMount(() => {
    const unsubscribeEvents = onAgentEvent(handleEvent);
    const unsubscribeProjectTree = onProjectTreeChanged(() => {
      void refreshProjectTree();
    });
    void refresh();
    return () => {
      unsubscribeEvents();
      unsubscribeProjectTree();
    };
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

  function toolTranscriptId(id?: string) {
    return `tool-${id ?? Date.now()}`;
  }

  function historyToTranscript(messages: HistoryMessage[]): TranscriptItem[] {
    const visible = messages.filter((message) => {
      const hasContent = message.content.trim() !== "";
      const hasReasoning = (message.reasoning ?? "").trim() !== "";
      return (message.role === "user" && hasContent) || (message.role === "assistant" && (hasContent || hasReasoning));
    });
    if (!visible.length) return welcomeTranscript();
    return visible.map((message, index) => ({
      id: `history-${index}`,
      role: message.role === "user" ? "user" : "assistant",
      body: message.content,
      title: message.reasoning ? "assistant + reasoning" : undefined,
      pending: false,
    }));
  }

  async function hydrateHistory(tab: TabMeta) {
    const history = await app().HistoryForTab(tab.id);
    transcript = historyToTranscript(history);
    pendingApproval = undefined;
    pendingAsk = undefined;
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
      const id = toolTranscriptId(event.tool.id);
      const existing = transcript.find((item) => item.id === id);
      if (existing) {
        existing.title = event.tool.name;
        existing.body = event.tool.args ?? existing.body;
        existing.pending = true;
        existing.readOnly = event.tool.readOnly;
        existing.parentId = event.tool.parentId ? toolTranscriptId(event.tool.parentId) : undefined;
        return;
      }
      transcript.push({
        id,
        role: "tool",
        title: event.tool.name,
        body: event.tool.args ?? "",
        pending: true,
        readOnly: event.tool.readOnly,
        parentId: event.tool.parentId ? toolTranscriptId(event.tool.parentId) : undefined,
      });
    }
    if (event.kind === "tool_result" && event.tool) {
      const tool = transcript.find((item) => item.id === toolTranscriptId(event.tool?.id));
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
      if (activeTab) void app().GoalForTab(activeTab.id).then((next) => (goalInfo = next));
    }
  }

  async function refresh() {
    loading = true;
    try {
      tabs = await app().ListTabs();
      projectTree = await app().ListProjectTree();
      const active = tabs.find((tab) => tab.active) ?? tabs[0];
      models = active ? await app().ModelsForTab(active.id) : [];
      selectedModel = models.find((model) => model.current)?.name ?? models[0]?.name ?? "";
      effort = active ? await app().EffortForTab(active.id) : { current: "auto", supported: ["auto"] };
      goalInfo = active ? await app().GoalForTab(active.id) : { objective: "", status: "idle" };
      commands = await app().Commands();
      await refreshMemory();
      await refreshResources();
      await refreshCodeDock(active);
      if (active) await hydrateHistory(active);
    } finally {
      loading = false;
    }
  }

  async function refreshResources() {
    resources = await Promise.all(
      workbenchResources.map(async (name) => {
        const result = await wailsDataProvider.list(name);
        return { name, total: result.total };
      }),
    );
  }

  async function refreshMemory() {
    memoryView = await app().Memory();
  }

  async function refreshCodeDock(tab = activeTab) {
    if (!tab) return;
    context = await app().ContextPanel(tab.id);
    changes = await app().WorkspaceChanges();
    checkpoints = await app().CheckpointsForTab(tab.id);
  }

  async function refreshProjectTree() {
    projectTree = await app().ListProjectTree();
  }

  async function send(displayText?: string, submitText?: string) {
    const text = (displayText ?? input).trim();
    const submission = (submitText ?? text).trim();
    if (!text || !submission || !activeTab) return;
    input = "";
    transcript.push({ id: `user-${Date.now()}`, role: "user", body: text });
    await app().SubmitDisplayToTab(activeTab.id, text, submission);
  }

  async function cancel() {
    if (!activeTab) return;
    await app().CancelTab(activeTab.id);
  }

  function focusComposer() {
    const composer = document.querySelector<HTMLTextAreaElement>("[data-composer-input]");
    composer?.focus();
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    const isPrimary = event.metaKey || event.ctrlKey;
    if (isPrimary && event.key === "1") {
      event.preventDefault();
      activityMode = "work";
      return;
    }
    if (isPrimary && event.key === "2") {
      event.preventDefault();
      activityMode = "code";
      return;
    }
    if (isPrimary && event.key.toLowerCase() === "k") {
      event.preventDefault();
      focusComposer();
      return;
    }
    if (event.key !== "Escape" || event.defaultPrevented) return;
    if (sending) {
      event.preventDefault();
      void cancel();
      return;
    }
    if (pendingApproval) {
      event.preventDefault();
      void answerApproval(false, false, false);
      return;
    }
    if (pendingAsk) {
      event.preventDefault();
      pendingAsk = undefined;
    }
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

  async function newTab() {
    const topic = await app().CreateTopic("global", "", "");
    const tab = await app().OpenGlobalTab(topic.id);
    tabs = [...tabs.map((item) => ({ ...item, active: false })), { ...tab, active: true }];
    await refresh();
  }

  async function openTopic(node: ProjectNode) {
    if (!node.topicId) return;
    if (node.kind === "global_topic") {
      await app().OpenGlobalTab(node.topicId);
      activityMode = "work";
    } else if (node.root) {
      await app().OpenProjectTab(node.root, node.topicId);
      activityMode = "code";
    }
    await refresh();
  }

  async function newTopic(node: ProjectNode) {
    const global = node.kind === "global_folder";
    const workspaceRoot = global ? "" : (node.root ?? "");
    const topic = await app().CreateTopic(global ? "global" : "project", workspaceRoot, "");
    if (global) {
      await app().OpenGlobalTab(topic.id);
      activityMode = "work";
    } else {
      await app().OpenProjectTab(workspaceRoot, topic.id);
      activityMode = "code";
    }
    await refresh();
  }

  async function renameProject(node: ProjectNode, title: string) {
    await app().RenameProject(node.kind === "global_folder" ? "" : (node.root ?? ""), title);
    await refreshProjectTree();
  }

  async function setProjectColor(node: ProjectNode, color: string) {
    await app().SetProjectColor(node.kind === "global_folder" ? "" : (node.root ?? ""), color);
    await refresh();
  }

  async function moveProject(node: ProjectNode, direction: "up" | "down") {
    if (!node.root) return;
    const projects = projectTree.filter((item) => item.kind === "project");
    const index = projects.findIndex((item) => item.root === node.root);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= projects.length) return;
    const nextProjects = projects.slice();
    const current = nextProjects[index];
    nextProjects[index] = nextProjects[nextIndex];
    nextProjects[nextIndex] = current;
    await app().ReorderProjects(nextProjects.map((item) => item.root ?? ""));
    await refreshProjectTree();
  }

  async function renameTopic(node: ProjectNode, title: string) {
    if (!node.topicId) return;
    await app().RenameTopic(node.topicId, title);
    await refresh();
  }

  async function trashTopic(node: ProjectNode) {
    if (!node.topicId) return;
    await app().TrashTopic(node.topicId);
    await refresh();
  }

  async function moveTab(tab: TabMeta, direction: "up" | "down") {
    const index = tabs.findIndex((item) => item.id === tab.id);
    const nextIndex = direction === "up" ? index - 1 : index + 1;
    if (index < 0 || nextIndex < 0 || nextIndex >= tabs.length) return;
    const nextTabs = tabs.slice();
    const current = nextTabs[index];
    nextTabs[index] = nextTabs[nextIndex];
    nextTabs[nextIndex] = current;
    tabs = nextTabs;
    await app().ReorderTabs(nextTabs.map((item) => item.id));
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

  async function startGoal(objective: string) {
    if (!activeTab) return;
    runMode = "goal";
    await app().SetModeForTab(activeTab.id, "normal");
    await app().StartGoalForTab(activeTab.id, objective);
    goalInfo = await app().GoalForTab(activeTab.id);
  }

  async function continueGoal() {
    if (!activeTab) return;
    runMode = "goal";
    await app().SetModeForTab(activeTab.id, "normal");
    await app().ContinueGoalForTab(activeTab.id);
    goalInfo = await app().GoalForTab(activeTab.id);
  }

  async function clearGoal() {
    if (!activeTab) return;
    await app().ClearGoalForTab(activeTab.id);
    goalInfo = await app().GoalForTab(activeTab.id);
  }

  async function remember(scope: string, note: string) {
    await app().Remember(scope, note);
    await refreshMemory();
    await refreshResources();
  }

  async function forgetMemory(name: string) {
    await app().Forget(name);
    await refreshMemory();
    await refreshResources();
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
    diffPreview = undefined;
    activityMode = "code";
  }

  async function previewChange(path: string) {
    const [diff, preview] = await Promise.all([app().WorkspaceDiff(path), app().ReadFile(path)]);
    diffPreview = diff;
    filePreview = preview;
    activityMode = "code";
  }

  async function rewind(turn: number, scope: string) {
    const tab = activeTab;
    if (!tab) return;
    await app().Rewind(turn, scope);
    if (scope === "code" || scope === "both") {
      filePreview = undefined;
      diffPreview = undefined;
    }
    await hydrateHistory(tab);
    await refreshCodeDock(tab);
    transcript.push({
      id: `rewind-${Date.now()}`,
      role: "notice",
      title: "rewind",
      body: `Rewound to turn ${turn} (${scope}); history and code state refreshed.`,
    });
  }
</script>

<svelte:head>
  <title>VoltUI Workbench</title>
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

<main class="workbench" data-activity={activityMode}>
  <ActivitySidebar
    {activityMode}
    {tabs}
    {activeTab}
    {projectTree}
    {resources}
    onActivity={(mode) => (activityMode = mode)}
    onTab={switchTab}
    onCloseTab={closeTab}
    onNewTab={newTab}
    onMoveTab={moveTab}
    onOpenTopic={openTopic}
    onNewTopic={newTopic}
    onRenameProject={renameProject}
    onSetProjectColor={setProjectColor}
    onMoveProject={moveProject}
    onRenameTopic={renameTopic}
    onTrashTopic={trashTopic}
  />

  <section class="main-stage">
    <UpdateBanner />

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
      <WorkDashboard
        {activeTab}
        {resources}
        {goalInfo}
        {memoryView}
        onStartGoal={startGoal}
        onContinueGoal={continueGoal}
        onClearGoal={clearGoal}
        onRemember={remember}
        onForgetMemory={forgetMemory}
      />
    {:else}
      <CodeDashboard
        {context}
        {changes}
        {checkpoints}
        {filePreview}
        {diffPreview}
        onPreviewFile={previewFile}
        onPreviewChange={previewChange}
        onRewind={rewind}
        onRefreshContext={() => activeTab && refreshCodeDock(activeTab)}
      />
    {/if}

    <ResourcePanel {activityMode} {resources} onChanged={refreshResources} />

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
