<script lang="ts">
  import { onMount } from "svelte";
  import {
    BookOpen,
    Bot,
    Code2,
    Folder,
    GitBranch,
    Gauge,
    List,
    PanelLeft,
    Plus,
    RotateCcw,
    Sparkles,
    Wrench,
    Zap,
  } from "@lucide/svelte";
  import CodeDashboard from "./components/CodeDashboard.svelte";
  import Composer from "./components/Composer.svelte";
  import Transcript from "./components/Transcript.svelte";
  import OIDCLoginOverlay from "./components/OIDCLoginOverlay.svelte";
  import { app, onAgentEvent, onProjectTreeChanged } from "./lib/bridge";
  import { t } from "./lib/i18n";
  import type {
    ActivityMode,
    CheckpointMeta,
    CommandInfo,
    ContextPanelInfo,
    FilePreview,
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
  let tabs = $state<TabMeta[]>([]);
  let models = $state<ModelInfo[]>([]);
  let commands = $state<CommandInfo[]>([]);
  let selectedModel = $state("");
  let input = $state("");
  let transcript = $state<TranscriptItem[]>(welcomeTranscript());
  let projectTree = $state<ProjectNode[]>([]);
  let context = $state<ContextPanelInfo | undefined>();
  let changes = $state<WorkspaceChangesView | undefined>();
  let checkpoints = $state<CheckpointMeta[]>([]);
  let filePreview = $state<FilePreview | undefined>();
  let diffPreview = $state<WorkspaceDiffView | undefined>();
  let pendingApproval = $state<WireApproval | undefined>();
  let pendingAsk = $state<WireAsk | undefined>();
  let loading = $state(true);
  let needsAuth = $state<boolean | null>(null);
  let sending = $state(false);
  let sidebarCollapsed = $state(false);
  let sortTasksByRecent = $state(false);
  let codeInspectorOpen = $state(false);
  let submittedDraft = $state<{ display: string; submission: string } | undefined>();
  let restoreDraftOnTurnDone = false;

  const activeTab = $derived(tabs.find((tab) => tab.active) ?? tabs[0]);
  const activeTaskKey = $derived(activeTab?.topicId || activeTab?.id || "");
  const hasConversation = $derived(transcript.some((item) => item.id !== "system-welcome" && item.role !== "system"));
  const showTranscript = $derived(hasConversation || sending || Boolean(pendingApproval) || Boolean(pendingAsk));
  const landing = $derived(activityMode === "code" ? t.home.code : t.home.work);
  const changedCount = $derived(changes?.files.length ?? 0);
  const contextPercent = $derived(context ? Math.min(100, Math.round((context.usedTokens / Math.max(context.windowTokens, 1)) * 100)) : 0);
  const projectGroups = $derived(
    projectTree
      .filter((node) => node.children?.length)
      .map((node) => ({ ...node, children: sortNodes(node.children ?? []) })),
  );
  const standaloneTopics = $derived(sortNodes(projectTree.filter((node) => node.kind === "global_topic" || node.kind === "topic")));
  const visibleTasks = $derived(standaloneTopics.length ? standaloneTopics : tabs.map(tabToProjectNode));

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

  function tabToProjectNode(tab: TabMeta): ProjectNode {
    return {
      key: tab.id,
      kind: tab.scope === "project" ? "topic" : "global_topic",
      label: tab.topicTitle || tab.workspaceName || t.activity.untitled,
      root: tab.workspaceRoot,
      topicId: tab.topicId,
      open: tab.active,
      running: tab.running,
    };
  }

  function sortNodes(nodes: ProjectNode[]) {
    if (!sortTasksByRecent) return nodes;
    return nodes.slice().sort((left, right) => (right.lastActivityAt ?? 0) - (left.lastActivityAt ?? 0));
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
      commands = await app().Commands();
      if (active) await refreshCodeDock(active);
      if (active) await hydrateHistory(active);
    } finally {
      loading = false;
    }
  }


  async function refreshProjectTree() {
    projectTree = await app().ListProjectTree();
  }

  async function refreshCodeDock(tab = activeTab) {
    if (!tab) return;
    context = await app().ContextPanel(tab.id);
    changes = await app().WorkspaceChanges();
    checkpoints = await app().CheckpointsForTab(tab.id);
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

  function commandPrompt(name: string) {
    const command = commands.find((item) => item.name.toLowerCase() === name.toLowerCase());
    input = command ? `/${command.name} ` : "";
    focusComposer();
  }

  function useQuickPrompt(text: string) {
    input = text;
    focusComposer();
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

  async function openTask(node: ProjectNode) {
    if (node.topicId) {
      await openTopic(node);
      return;
    }
    const tab = tabs.find((item) => item.id === node.key);
    if (tab) await switchTab(tab);
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

  async function switchModel(event: Event) {
    const next = (event.currentTarget as HTMLSelectElement).value;
    selectedModel = next;
    if (activeTab && next) await app().SetModelForTab(activeTab.id, next);
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

  async function openCodeInspector() {
    activityMode = "code";
    codeInspectorOpen = true;
    await refreshCodeDock();
  }

  async function previewFile(path: string) {
    filePreview = await app().ReadFile(path);
    diffPreview = undefined;
    activityMode = "code";
    codeInspectorOpen = true;
  }

  async function previewChange(path: string) {
    const [diff, preview] = await Promise.all([app().WorkspaceDiff(path), app().ReadFile(path)]);
    diffPreview = diff;
    filePreview = preview;
    activityMode = "code";
    codeInspectorOpen = true;
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
  <main class={["shell", sidebarCollapsed && "is-sidebar-collapsed"]} data-mode={activityMode}>
    <aside class="sidebar">
      <header class="sidebar__chrome">
        <div class="window-dots" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="mode-switch" role="tablist" aria-label="Activity mode">
          <button
            class={["mode-switch__item", activityMode === "work" && "is-active"]}
            type="button"
            role="tab"
            aria-selected={activityMode === "work"}
            onclick={() => (activityMode = "work")}
          >
            <BookOpen size={16} />
            {t.activity.work}
          </button>
          <button
            class={["mode-switch__item", activityMode === "code" && "is-active"]}
            type="button"
            role="tab"
            aria-selected={activityMode === "code"}
            onclick={() => (activityMode = "code")}
          >
            <Code2 size={16} />
            {t.activity.code}
          </button>
        </div>
        <button class="sidebar__icon" type="button" aria-label={t.home.sidebar} title={t.home.sidebar} onclick={() => (sidebarCollapsed = !sidebarCollapsed)}>
          <PanelLeft size={17} />
        </button>
      </header>

      <nav class="primary-actions" aria-label="Primary actions">
        <button class="primary-actions__new" type="button" onclick={newTab}>
          <Plus size={17} />
          <span>{t.activity.newSession}</span>
          <kbd>⌃⌘N</kbd>
        </button>
        <button type="button" onclick={() => commandPrompt("skills")}>
          <Wrench size={17} />
          <span>{t.home.skills}</span>
        </button>
        <button type="button" onclick={() => commandPrompt("automation")}>
          <Zap size={17} />
          <span>{t.home.automation}</span>
        </button>
      </nav>

      <section class="task-list" aria-label={t.home.taskList}>
        <div class="task-list__head">
          <span>{t.home.taskList}</span>
          <div>
            <button type="button" aria-label={t.home.expand} title={t.home.expand} onclick={() => (sidebarCollapsed = false)}>
              <Sparkles size={15} />
            </button>
            <button type="button" aria-label={t.home.sort} title={t.home.sort} onclick={() => (sortTasksByRecent = !sortTasksByRecent)}>
              <List size={16} />
            </button>
          </div>
        </div>

        <div class="task-list__body">
          {#if projectGroups.length}
            {#each projectGroups as group (group.key)}
              <section class="task-group">
                <div class="task-group__label">
                  <Folder size={15} />
                  <span>{group.label || t.common.global}</span>
                  <button type="button" aria-label={t.activity.newTopic} onclick={() => newTopic(group)}>
                    <Plus size={14} />
                  </button>
                </div>
                {#each group.children ?? [] as topic (topic.key)}
                  <button
                    class={["task-row", (topic.topicId || topic.key) === activeTaskKey && "is-active"]}
                    type="button"
                    onclick={() => openTask(topic)}
                  >
                    <span>{topic.label || t.activity.untitled}</span>
                    {#if topic.running}<i>{t.activity.running}</i>{/if}
                  </button>
                {/each}
              </section>
            {/each}
          {:else if visibleTasks.length}
            {#each visibleTasks as topic (topic.key)}
              <button
                class={["task-row", (topic.topicId || topic.key) === activeTaskKey && "is-active"]}
                type="button"
                onclick={() => openTask(topic)}
              >
                <span>{topic.label || t.activity.untitled}</span>
                {#if topic.running}<i>{t.activity.running}</i>{/if}
              </button>
            {/each}
          {:else}
            <p class="task-list__empty">{t.work.noTasks}</p>
          {/if}
        </div>
      </section>

      <footer class="sidebar__user">
        <span class="sidebar__avatar"><Bot size={17} /></span>
        <strong>{t.home.user}</strong>
        <em>{t.home.free}</em>
      </footer>
    </aside>

    <section class="stage">
      <div class="window-drag-region" aria-hidden="true"></div>
      <div class="stage__surface">
        {#if loading}
          <div class="content__loading">{t.app.loading}</div>
        {:else if showTranscript}
          <section class="conversation-view">
            <header class="conversation-header">
              <div>
                <strong>{activeTab?.topicTitle || t.activity.untitled}</strong>
                <span>{activeTab?.workspaceName || t.common.global}</span>
              </div>
              <button type="button" onclick={() => (activityMode = "code")}>
                <Code2 size={15} />
                {t.home.openInCode}
              </button>
            </header>
            <div class="conversation">
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
            </div>
          </section>
        {:else}
          <section class="home">
            <h1>
              {#if activityMode === "code"}
                <Code2 size={38} />
              {:else}
                <BookOpen size={34} />
              {/if}
              {landing.title}
              <span>{t.home.beta}</span>
            </h1>
            <div class="home__composer">
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
                {models}
                {selectedModel}
                onModelChange={switchModel}
              />
              <div class="home__context">
                <button type="button" onclick={focusComposer}>
                  <PanelLeft size={16} />
                  {t.home.local}
                </button>
                <button type="button" onclick={() => (activityMode = "code")}>
                  <Folder size={16} />
                  {activeTab?.workspaceName || t.common.global}
                </button>
                {#if activityMode === "code"}
                  <button type="button" onclick={focusComposer}>
                    <GitBranch size={16} />
                    main
                  </button>
                {/if}
              </div>
            </div>
            <div class="home__quick">
              {#each landing.quick as quick (quick.label)}
                <button type="button" onclick={() => useQuickPrompt(quick.prompt)}>
                  {#if quick.icon === "bot"}
                    <Bot size={16} />
                  {:else if quick.icon === "list"}
                    <List size={16} />
                  {:else if quick.icon === "folder"}
                    <Folder size={16} />
                  {:else if quick.icon === "code"}
                    <Code2 size={16} />
                  {:else}
                    <Sparkles size={16} />
                  {/if}
                  {quick.label}
                </button>
              {/each}
            </div>
            {#if activityMode === "code"}
              <div class="code-tools" aria-label={t.home.codeTools.title}>
                <button type="button" onclick={openCodeInspector}>
                  <Gauge size={17} />
                  <span>{t.home.codeTools.context}</span>
                  <em>{context ? `${contextPercent}%` : "-"}</em>
                </button>
                <button type="button" onclick={openCodeInspector}>
                  <Folder size={17} />
                  <span>{t.code.fileTree}</span>
                  <em>{t.common.ready}</em>
                </button>
                <button type="button" onclick={openCodeInspector}>
                  <GitBranch size={17} />
                  <span>{t.code.changes}</span>
                  <em>{changedCount}</em>
                </button>
                <button type="button" onclick={openCodeInspector}>
                  <RotateCcw size={17} />
                  <span>{t.code.checkpoints}</span>
                  <em>{checkpoints.length}</em>
                </button>
              </div>
            {/if}
          </section>
        {/if}
      </div>

      {#if activityMode === "code" && codeInspectorOpen}
        <aside class="code-inspector" aria-label={t.home.codeTools.title}>
          <header>
            <strong>{t.home.codeTools.title}</strong>
            <button type="button" onclick={() => (codeInspectorOpen = false)} aria-label={t.common.close}>
              ×
            </button>
          </header>
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
        </aside>
      {/if}

      {#if showTranscript}
        <div class="stage__composer">
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
            {models}
            {selectedModel}
            onModelChange={switchModel}
          />
        </div>
      {/if}
    </section>
  </main>
{/if}

<style>
  .shell {
    --sidebar-width: clamp(292px, 20vw, 386px);
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    height: 100vh;
    padding: 0;
    color: #202124;
    background: #f0f0f0;
  }

  .shell.is-sidebar-collapsed {
    --sidebar-width: 72px;
  }

  .shell.is-sidebar-collapsed .sidebar {
    padding-inline: 10px;
  }

  .shell.is-sidebar-collapsed .window-dots,
  .shell.is-sidebar-collapsed .mode-switch,
  .shell.is-sidebar-collapsed .primary-actions span,
  .shell.is-sidebar-collapsed .primary-actions kbd,
  .shell.is-sidebar-collapsed .task-list,
  .shell.is-sidebar-collapsed .sidebar__user strong,
  .shell.is-sidebar-collapsed .sidebar__user em {
    display: none;
  }

  .shell.is-sidebar-collapsed .sidebar__chrome {
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .shell.is-sidebar-collapsed .primary-actions {
    margin-top: 38px;
  }

  .shell.is-sidebar-collapsed .primary-actions button,
  .shell.is-sidebar-collapsed .sidebar__user {
    display: grid;
    grid-template-columns: 1fr;
    justify-items: center;
  }

  .shell.is-sidebar-collapsed .stage__composer {
    left: max(32px, calc(var(--sidebar-width) + 10vw));
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 19px 14px 14px;
    background: #eeeeee;
    border-right: 1px solid #dfdfdf;
  }

  .sidebar__chrome {
    --wails-draggable: drag;
    display: grid;
    grid-template-columns: 78px 1fr 34px;
    align-items: center;
    gap: 10px;
    min-height: 34px;
  }

  .window-dots {
    display: flex;
    gap: 12px;
    padding-left: 16px;
  }

  .window-dots span {
    width: 17px;
    height: 17px;
    background: #d1d1d1;
    border-radius: 50%;
  }

  .mode-switch {
    --wails-draggable: no-drag;
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    padding: 3px;
    background: #e2e2e2;
    border-radius: 9px;
  }

  .mode-switch__item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    height: 34px;
    padding: 0 11px;
    color: #333333;
    background: transparent;
    border: 0;
    border-radius: 7px;
    font-size: 16px;
    font-weight: 520;
  }

  .mode-switch__item.is-active {
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .sidebar__icon {
    --wails-draggable: no-drag;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    color: #424242;
    background: transparent;
    border: none;
    border-radius: 7px;
  }

  .sidebar__icon:hover,
  .primary-actions button:hover,
  .task-list__head button:hover {
    background: #dedede;
  }

  .primary-actions {
    display: grid;
    gap: 8px;
    margin-top: 43px;
  }

  .primary-actions button {
    --wails-draggable: no-drag;
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    min-height: 40px;
    padding: 0 10px;
    color: #2f2f2f;
    background: transparent;
    border: 0;
    border-radius: 7px;
    font-size: 16px;
    font-weight: 470;
    text-align: left;
  }

  .primary-actions__new {
    background: #dedede !important;
  }

  .primary-actions kbd {
    color: #7c7c7c;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
  }

  .task-list {
    display: flex;
    flex-direction: column;
    min-height: 0;
    flex: 1;
    margin-top: 30px;
  }

  .task-list__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 34px;
    padding: 0 8px;
    color: #6a6a6a;
    font-size: 16px;
    font-weight: 520;
  }

  .task-list__head div {
    display: flex;
    gap: 8px;
  }

  .task-list__head button,
  .task-group__label button {
    --wails-draggable: no-drag;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    color: #777777;
    border: none;
    border-radius: 6px;
    background: transparent;
  }

  .task-list__body {
    display: grid;
    gap: 12px;
    min-height: 0;
    overflow: auto;
    padding: 4px 0 10px;
  }

  .task-group {
    display: grid;
    gap: 6px;
  }

  .task-group__label {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 8px;
    color: #707070;
    font-size: 15px;
  }

  .task-group__label span,
  .task-row span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-row {
    --wails-draggable: no-drag;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-height: 34px;
    margin-left: 26px;
    padding: 0 10px;
    color: #333333;
    background: transparent;
    border: 0;
    border-radius: 7px;
    font-size: 15px;
    text-align: left;
  }

  .task-row:hover,
  .task-row.is-active {
    background: #e1e1e1;
  }

  .task-row i {
    color: #8a8a8a;
    font-size: 12px;
    font-style: normal;
  }

  .task-list__empty {
    margin: 12px 8px;
    color: #8a8a8a;
    font-size: 14px;
  }

  .sidebar__user {
    display: grid;
    grid-template-columns: 34px minmax(0, auto) auto;
    align-items: center;
    gap: 10px;
    min-height: 42px;
    color: #3f3f3f;
    font-size: 15px;
  }

  .sidebar__avatar {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    color: #5b28cf;
    background: #b89cff;
    border-radius: 8px;
  }

  .sidebar__user strong {
    overflow: hidden;
    font-weight: 560;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar__user em {
    padding: 2px 6px;
    color: #4a4a4a;
    background: #ffffff;
    border: 1px solid #dddddd;
    border-radius: 5px;
    font-size: 12px;
    font-style: normal;
  }

  .stage {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 10px 10px 10px 0;
    background: #f0f0f0;
  }

  .window-drag-region {
    --wails-draggable: drag;
    position: absolute;
    top: 10px;
    right: 10px;
    left: 0;
    z-index: 2;
    height: 44px;
  }

  .stage__surface {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    background: #ffffff;
    border: 1px solid #dedede;
    border-radius: 18px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  }

  .stage__surface,
  .home,
  .conversation-view,
  .conversation,
  .stage__composer,
  .home__composer,
  button,
  :global(select),
  :global(textarea),
  :global(input) {
    --wails-draggable: no-drag;
  }

  .content__loading {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    color: var(--fg-faint);
    font-size: 14px;
  }

  .home {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
    padding: clamp(28px, 7vh, 74px) clamp(18px, 3vw, 36px) 112px;
  }

  .home h1 {
    display: flex;
    align-items: center;
    gap: 14px;
    margin: 0 0 clamp(30px, 6vh, 60px);
    color: #1f1f1f;
    font-size: clamp(32px, 3.2vw, 46px);
    font-weight: 650;
    letter-spacing: 0;
  }

  .home h1 span {
    align-self: flex-start;
    margin-top: 3px;
    padding: 2px 7px;
    color: #777777;
    background: #eeeeee;
    border: 1px solid #d7d7d7;
    border-radius: 5px;
    font-size: 14px;
    font-weight: 600;
  }

  .home__composer {
    width: min(1028px, max(560px, 72%));
    overflow: hidden;
    background: #f4f4f4;
    border-radius: 15px;
  }

  .home__context {
    display: flex;
    gap: 26px;
    min-height: 54px;
    padding: 0 24px;
  }

  .home__context button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    color: #3e3e3e;
    background: transparent;
    border: 0;
    font-size: 15px;
    font-weight: 540;
  }

  .home__quick {
    display: grid;
    grid-template-columns: repeat(4, minmax(132px, max-content));
    justify-content: center;
    gap: 10px;
    margin-top: 40px;
  }

  .home__quick button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 62px;
    padding: 0 22px;
    color: #333333;
    background: #ffffff;
    border: 1px solid #e3e3e3;
    border-radius: 17px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    font-size: 16px;
    font-weight: 560;
  }

  .code-tools {
    display: grid;
    grid-template-columns: repeat(4, minmax(128px, 1fr));
    gap: 10px;
    width: min(860px, max(520px, 62%));
    margin-top: 18px;
  }

  .code-tools button {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-height: 42px;
    padding: 0 12px;
    color: #3c3c3c;
    background: #fafafa;
    border: 1px solid #e5e5e5;
    border-radius: 12px;
    font-size: 14px;
    text-align: left;
  }

  .code-tools button:hover {
    background: #f3f3f3;
    border-color: #d8d8d8;
  }

  .code-tools span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .code-tools em {
    color: #6f6f6f;
    font-style: normal;
  }

  .home__quick button:hover {
    background: #f8f8f8;
    border-color: #d4d4d4;
  }

  .conversation {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 24px 48px 220px;
  }

  .conversation-view {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .conversation-header {
    --wails-draggable: drag;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 54px;
    padding: 0 22px;
    border-bottom: 1px solid #eeeeee;
  }

  .conversation-header div {
    display: flex;
    align-items: center;
    gap: 9px;
    min-width: 0;
  }

  .conversation-header strong {
    overflow: hidden;
    color: #242424;
    font-size: 16px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conversation-header span {
    overflow: hidden;
    color: #8a8a8a;
    font-size: 14px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conversation-header button {
    --wails-draggable: no-drag;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    padding: 0 12px;
    color: #303030;
    background: #ffffff;
    border: 1px solid #e5e5e5;
    border-radius: 9px;
    font-size: 14px;
  }

  .stage__composer {
    position: absolute;
    right: max(32px, calc(6vw + 40px));
    bottom: 32px;
    left: max(32px, calc(var(--sidebar-width) + 10vw + 40px));
    z-index: 4;
    max-width: 1100px;
  }

  .code-inspector {
    --wails-draggable: no-drag;
    position: absolute;
    top: 24px;
    right: 24px;
    bottom: 24px;
    z-index: 5;
    display: flex;
    flex-direction: column;
    width: min(520px, calc(100% - var(--sidebar-width) - 64px));
    min-width: 360px;
    overflow: hidden;
    background: #ffffff;
    border: 1px solid #dedede;
    border-radius: 16px;
    box-shadow: 0 18px 60px rgba(0, 0, 0, 0.12);
  }

  .code-inspector header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 46px;
    padding: 0 14px 0 18px;
    border-bottom: 1px solid #ededed;
  }

  .code-inspector header strong {
    font-size: 15px;
    font-weight: 620;
  }

  .code-inspector header button {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    color: #666666;
    background: #f4f4f4;
    border: 0;
    border-radius: 8px;
    font-size: 20px;
  }

  .code-inspector :global(.code-layout) {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 14px;
  }

  .code-inspector :global(.dashboard-grid) {
    grid-template-columns: 1fr;
  }

  .code-inspector :global(.code-dock) {
    box-shadow: none;
  }

  .home__composer :global(.composer),
  .stage__composer :global(.composer) {
    min-height: 160px;
    background: #ffffff;
    border: 1px solid #e2e2e2;
    border-radius: 15px;
    box-shadow: none;
  }

  .home__composer :global(.composer) {
    border-radius: 15px 15px 0 0;
  }

  .home__composer :global(.composer textarea),
  .stage__composer :global(.composer textarea) {
    min-height: 88px;
    color: #242424;
    font-size: 16px;
  }

  .home__composer :global(.composer button[type="submit"]),
  .stage__composer :global(.composer button[type="submit"]) {
    width: 39px;
    height: 39px;
    justify-content: center;
    padding: 0;
    color: #7a6edb;
    background: #ded8ff;
    border-radius: 11px;
  }

  .home__composer :global(.composer button[type="submit"] span),
  .stage__composer :global(.composer button[type="submit"] span) {
    display: none;
  }

  .boot-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    color: var(--fg-faint);
    font-size: 14px;
  }

  @media (max-width: 980px) {
    .shell {
      --sidebar-width: 292px;
    }

    .stage__composer {
      left: calc(var(--sidebar-width) + 28px);
      right: 24px;
    }

    .home__composer,
    .code-tools {
      width: min(760px, 86%);
    }

    .home__quick,
    .code-tools {
      grid-template-columns: repeat(2, minmax(150px, 1fr));
    }
  }

  @media (max-width: 768px) {
    .shell {
      grid-template-columns: 1fr;
    }

    .sidebar {
      display: none;
    }

    .stage {
      padding: 8px;
    }

    .stage__composer {
      left: 20px;
      right: 20px;
      bottom: 20px;
    }

    .conversation {
      padding: 18px 18px 200px;
    }

    .conversation-header {
      padding: 0 14px;
    }

    .home {
      padding: 32px 14px 90px;
    }

    .home__composer {
      width: 100%;
    }

    .home__quick,
    .code-tools {
      width: 100%;
      grid-template-columns: 1fr 1fr;
    }

    .code-inspector {
      right: 12px;
      left: 12px;
      bottom: 12px;
      width: auto;
      min-width: 0;
    }

    .home h1 {
      margin-bottom: 34px;
      font-size: 30px;
    }

  }

  @media (max-width: 520px) {
    .home h1 {
      align-items: flex-start;
      flex-wrap: wrap;
      justify-content: center;
      text-align: center;
    }

    .home__quick,
    .code-tools {
      grid-template-columns: 1fr;
    }
  }
</style>
