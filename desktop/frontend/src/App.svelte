<script lang="ts">
  import { onMount } from "svelte";
  import { Bot, Code2, Plus, ShieldCheck } from "@lucide/svelte";
  import CodeDashboard from "./components/CodeDashboard.svelte";
  import Composer from "./components/Composer.svelte";
  import Transcript from "./components/Transcript.svelte";
  import OIDCLoginOverlay from "./components/OIDCLoginOverlay.svelte";
  import { app, onAgentEvent, onProjectTreeChanged } from "./lib/bridge";
  import { t } from "./lib/i18n";
  import type {
    ActivityMode,
    BackendMode,
    CheckpointMeta,
    CommandInfo,
    ContextPanelInfo,
    EffortInfo,
    FilePreview,
    GoalInfo,
    HistoryMessage,
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


  // Cap the in-memory transcript to prevent unbounded growth during long sessions.
  // Older items are trimmed when the array exceeds this threshold.
  const MAX_TRANSCRIPT_ITEMS = 500;

  function welcomeTranscript(): TranscriptItem[] {
    return [
      {
        id: "system-welcome",
        role: "system",
        body: t.transcript.welcome,
      },
    ];
  }

  let activityMode = $state<ActivityMode>("work");
  let runMode = $state<RunMode>("ask");
  let runtimeMode = $state<BackendMode>("normal");
  let permissionMode = $state("ask");
  let runtimeBypass = $state(false);
  let tabs = $state<TabMeta[]>([]);
  let models = $state<ModelInfo[]>([]);
  let effort = $state<EffortInfo>({ current: "auto", supported: ["auto"] });
  let commands = $state<CommandInfo[]>([]);
  let selectedModel = $state("");
  let input = $state("");
  let transcript = $state<TranscriptItem[]>(welcomeTranscript());
  let projectTree = $state<ProjectNode[]>([]);
  let context = $state<ContextPanelInfo | undefined>();
  let goalInfo = $state<GoalInfo>({ objective: "", status: "idle" });
  let changes = $state<WorkspaceChangesView | undefined>();
  let checkpoints = $state<CheckpointMeta[]>([]);
  let filePreview = $state<FilePreview | undefined>();
  let diffPreview = $state<WorkspaceDiffView | undefined>();
  let pendingApproval = $state<WireApproval | undefined>();
  let pendingAsk = $state<WireAsk | undefined>();
  let loading = $state(true);
  let needsAuth = $state<boolean | null>(null);
  let sending = $state(false);
  let submittedDraft = $state<{ display: string; submission: string } | undefined>();
  let restoreDraftOnTurnDone = false;

  const activeTab = $derived(tabs.find((tab) => tab.active) ?? tabs[0]);
  const modeLabel = $derived(`${activityMode.toUpperCase()} + ${runMode.toUpperCase()}`);
  const runtimeLabel = $derived(`backend ${runtimeMode}${runtimeBypass ? " / bypass" : ""}`);
  const permissionLabel = $derived(runtimeBypass ? "permission runtime-bypass" : `permission ${permissionMode}`);

  onMount(() => {
    // Check auth gate first — if [auth] is configured and no valid token exists,
    // show the OIDC login overlay before anything else.
    app()
      .NeedsAuth()
      .then((auth) => {
        needsAuth = auth;
        if (!auth) void refresh();
      })
      .catch(() => {
        needsAuth = false;
        void refresh();
      });

    const unsubscribeEvents = onAgentEvent(handleEvent);
    const unsubscribeProjectTree = onProjectTreeChanged(() => {
      void refreshProjectTree();
    });
    return () => {
      unsubscribeEvents();
      unsubscribeProjectTree();
    };
  });

  // Debounce batch-appends of streaming text events to avoid re-render storms.
  let pendingTextBuffer = "";
  let textFlushScheduled = false;

  function scheduleTextFlush() {
    if (textFlushScheduled) return;
    textFlushScheduled = true;
    queueMicrotask(() => {
      textFlushScheduled = false;
      if (!pendingTextBuffer) return;
      updateLastAssistant(pendingTextBuffer);
      pendingTextBuffer = "";
    });
  }

  function appendTranscript(item: TranscriptItem) {
    transcript.push(item);
    if (transcript.length > MAX_TRANSCRIPT_ITEMS) {
      // Keep the most recent items; drop from the front.
      transcript.splice(0, transcript.length - MAX_TRANSCRIPT_ITEMS);
    }
  }

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
    appendTranscript({ id: `assistant-${Date.now()}`, role: "assistant", body: text, pending: true });
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
      appendTranscript({ id: `assistant-${Date.now()}`, role: "assistant", body: "", pending: true });
    }
    if (event.kind === "reasoning" && event.reasoning) {
      appendTranscript({ id: `reasoning-${Date.now()}`, role: "reasoning", title: t.transcript.reasoning, body: event.reasoning, pending: true });
    }
    if ((event.kind === "text" || event.kind === "message") && event.text) {
    pendingTextBuffer += event.text;
    scheduleTextFlush();
  }
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
      appendTranscript({
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
      appendTranscript({
        id: `usage-${Date.now()}`,
        role: "notice",
        title: "usage",
        body: `${event.usage.totalTokens ?? 0} ${t.transcript.tokens}`,
      });
    }
    if (event.kind === "notice" && event.text) {
      appendTranscript({ id: `notice-${Date.now()}`, role: "notice", body: event.text });
    }
    if (event.kind === "turn_done") {
      sending = false;
      for (const item of transcript) item.pending = false;
      if (restoreDraftOnTurnDone && submittedDraft) {
        if (!input.trim()) input = submittedDraft.display;
        appendTranscript({ id: `draft-${Date.now()}`, role: "notice", body: "Draft restored after cancellation." });
      }
      restoreDraftOnTurnDone = false;
      submittedDraft = undefined;
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
      runtimeMode = active?.mode ?? "normal";
      models = active ? await app().ModelsForTab(active.id) : [];
      selectedModel = models.find((model) => model.current)?.name ?? models[0]?.name ?? "";
      effort = active ? await app().EffortForTab(active.id) : { current: "auto", supported: ["auto"] };
      goalInfo = active ? await app().GoalForTab(active.id) : { objective: "", status: "idle" };
      commands = await app().Commands();
      await refreshRuntimeSettings();
      await refreshCodeDock(active);
      if (active) await hydrateHistory(active);
    } finally {
      loading = false;
    }
  }


  async function refreshRuntimeSettings() {
    const settings = await app().Settings();
    permissionMode = settings.permissions.mode || "ask";
    runtimeBypass = settings.bypass;
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
    const draft = { display: text, submission };
    submittedDraft = draft;
    restoreDraftOnTurnDone = false;
    input = "";
    appendTranscript({ id: `user-${Date.now()}`, role: "user", body: text });
    try {
      await app().SubmitDisplayToTab(activeTab.id, text, submission);
    } catch (error) {
      input = draft.display;
      submittedDraft = undefined;
      restoreDraftOnTurnDone = false;
      throw error;
    }
  }

  async function cancel() {
    if (!activeTab) return;
    restoreDraftOnTurnDone = Boolean(submittedDraft);
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
    if (next === "ask" || next === "plan") {
      await app().SetPermissionMode("ask");
    } else if (next === "auto") {
      await app().SetPermissionMode("allow");
    }
    runtimeMode = backendMode;
    tabs = tabs.map((tab) => (tab.id === activeTab.id ? { ...tab, mode: backendMode } : tab));
    await refreshRuntimeSettings();
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
    appendTranscript({
      id: `rewind-${Date.now()}`,
      role: "notice",
      title: "rewind",
      body: t.transcript.rewound.replace("{turn}", String(turn)).replace("{scope}", scope),
    });
  }
</script>
<svelte:head>
  <title>{t.app.title}</title>
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

{#if needsAuth}
  <OIDCLoginOverlay onComplete={() => { needsAuth = false; void refresh(); }} />
{:else if needsAuth === null}
  <div class="boot-screen">{t.app.loading}</div>
{:else}
  <main class="shell" data-mode={activityMode}>
    <!-- Icon sidebar (56px) -->
    <nav class="dock">
      <button
        class="dock__btn"
        class:is-active={activityMode === "work"}
        title={t.activity.work}
        aria-pressed={activityMode === "work"}
        onclick={() => (activityMode = "work")}
      >
        <Bot size={18} />
      </button>
      <button
        class="dock__btn"
        class:is-active={activityMode === "code"}
        title={t.activity.code}
        aria-pressed={activityMode === "code"}
        onclick={() => (activityMode = "code")}
      >
        <Code2 size={18} />
      </button>

      <div class="dock__divider"></div>

      <button class="dock__btn" title={t.activity.newSession} onclick={newTab}>
        <Plus size={18} />
      </button>

      <div class="dock__sessions">
        {#each tabs as tab (tab.id)}
          <button
            class="dock__session"
            class:is-active={tab.id === activeTab?.id}
            title={tab.topicTitle || tab.workspaceName || t.activity.untitled}
            onclick={() => switchTab(tab)}
          >
            {#if tab.running}
              <span class="dock__dot dock__dot--run"></span>
            {:else if tab.id === activeTab?.id}
              <span class="dock__dot"></span>
            {:else}
              <span class="dock__dot dock__dot--off"></span>
            {/if}
          </button>
        {/each}
      </div>
    </nav>

    <!-- Main stage -->
    <section class="stage">
      <!-- Minimal topbar -->
      <header class="bar">
        <div class="bar__left">
          <span class="bar__mode">{activityMode === "work" ? t.activity.work : t.activity.code}</span>
          <span class="bar__sep">·</span>
          <span class="bar__name">{activeTab?.topicTitle || activeTab?.workspaceName || t.common.global}</span>
        </div>
        <div class="bar__right">
          {#if activityMode === "work"}
            <select aria-label={t.common.model} value={selectedModel} onchange={switchModel}>
              {#each models as model (model.name)}
                <option value={model.name}>{model.label || model.name}</option>
              {/each}
            </select>
          {/if}
        </div>
      </header>

      <!-- Content area -->
      <div class="content">
        {#if activityMode === "code"}
          <!-- Code mode: split view -->
          <div class="code-split">
            <div class="code-pane code-pane--chat">
              {#if loading}
                <div class="content__loading">{t.app.loading}</div>
              {:else}
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
              {/if}
            </div>
            <div class="code-pane code-pane--files">
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
            </div>
          </div>
        {:else if loading}
          <div class="content__loading">{t.app.loading}</div>
        {:else}
          <!-- Work mode: pure chat -->
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
        {/if}
      </div>

      <!-- Composer at bottom -->
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
{/if}

<style>
  .shell {
    display: grid;
    grid-template-columns: 48px minmax(0, 1fr);
    height: 100vh;
    background: var(--bg);
    color: var(--fg);
  }

  /* === Icon dock === */
  .dock {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 10px 0;
    background: var(--panel-soft);
    border-right: 1px solid var(--line);
    overflow-y: auto;
  }
  .dock::-webkit-scrollbar { width: 0; }

  .dock__btn {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--fg-faint);
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
  }
  .dock__btn:hover { background: var(--line); color: var(--fg); }
  .dock__btn.is-active { background: var(--accent); color: white; }

  .dock__divider {
    width: 24px;
    height: 1px;
    margin: 6px 0;
    background: var(--line);
  }

  .dock__sessions {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    flex: 1;
    padding-top: 4px;
  }

  .dock__session {
    display: grid;
    place-items: center;
    width: 36px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    cursor: pointer;
    transition: background 0.12s;
  }
  .dock__session:hover { background: var(--line); }
  .dock__session.is-active { background: var(--line); }

  .dock__dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }
  .dock__dot--off { background: var(--fg-faint); opacity: 0.4; }
  .dock__dot--run {
    background: var(--accent);
    animation: pulse 1.2s ease-in-out infinite;
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }

  /* === Main stage === */
  .stage {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    height: 40px;
    flex-shrink: 0;
    border-bottom: 1px solid var(--line);
    background: var(--panel);
    font-size: 13px;
  }
  .bar__left { display: flex; align-items: center; gap: 6px; }
  .bar__mode { font-weight: 600; }
  .bar__sep { color: var(--fg-faint); }
  .bar__name { color: var(--fg-faint); }
  .bar__right select {
    font-size: 12px;
    padding: 3px 8px;
    border: 1px solid var(--line);
    border-radius: 6px;
    background: var(--bg);
    color: var(--fg);
    outline: none;
    cursor: pointer;
  }

  .content {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .content__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--fg-faint);
    font-size: 14px;
  }

  /* Code mode split */
  .code-split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }
  .code-pane {
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }
  .code-pane--files {
    border-left: 1px solid var(--line);
    background: var(--panel);
  }

  .boot-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    color: var(--fg-faint);
    font-size: 14px;
  }

  @media (max-width: 768px) {
    .code-split { grid-template-columns: 1fr; }
    .code-pane--files { display: none; }
  }
</style>