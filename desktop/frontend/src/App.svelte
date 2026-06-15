<script lang="ts">
  import { onMount, tick } from "svelte";
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
    SquarePen,
    Trash2,
    Wrench,
    Zap,
  } from "@lucide/svelte";
  import CodeDashboard from "./components/CodeDashboard.svelte";
  import Composer from "./components/Composer.svelte";
  import Transcript from "./components/Transcript.svelte";
  import OIDCLoginOverlay from "./components/OIDCLoginOverlay.svelte";
  import { app, onAgentEvent, onProjectTreeChanged } from "./lib/bridge";
  import { lang, t } from "./lib/i18n";
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
  type WorkLayer = "today" | "capabilities";

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
  let workLayer = $state<WorkLayer>("today");
  let nowMs = $state(Date.now());
  let submittedDraft = $state<{ display: string; submission: string } | undefined>();
  let restoreDraftOnTurnDone = false;

  const activeTab = $derived(tabs.find((tab) => tab.active) ?? tabs[0]);
  const activeTaskKey = $derived(activeTab?.topicId || activeTab?.id || "");
  const hasConversation = $derived(transcript.some((item) => item.id !== "system-welcome" && item.role !== "system"));
  const showTranscript = $derived(hasConversation || sending || Boolean(pendingApproval) || Boolean(pendingAsk));
  const landing = $derived(activityMode === "code" ? t.home.code : t.home.work);
  const changedCount = $derived(changes?.files.length ?? 0);
  const clock = $derived(new Date(nowMs));
  const clockLabel = $derived(formatClock(clock));
  const monthLabel = $derived(formatMonth(clock));
  const calendarCells = $derived(buildCalendar(clock));
  const builtinCommands = $derived(commands.filter((command) => command.kind === "builtin"));
  const skillCommands = $derived(commands.filter((command) => command.kind === "skill"));
  const customCommands = $derived(commands.filter((command) => command.kind === "custom"));
  const mcpCommands = $derived(commands.filter((command) => command.kind === "mcp"));
  const extensionCommands = $derived([...customCommands, ...mcpCommands]);
  const reasonixCommandNames = ["memory", "remember", "mcp", "hooks", "skill", "model", "effort", "compact"];
  const reasonixCommands = $derived(reasonixCommandNames.map((name) => builtinCommands.find((command) => command.name === name)).filter(Boolean) as CommandInfo[]);
  const contextPercent = $derived(context ? Math.min(100, Math.round((context.usedTokens / Math.max(context.windowTokens, 1)) * 100)) : 0);
  const projectGroups = $derived(
    projectTree
      .filter((node) => node.children?.length)
      .map((node) => ({ ...node, children: sortNodes(node.children ?? []) })),
  );
  const standaloneTopics = $derived(sortNodes(projectTree.filter((node) => node.kind === "global_topic" || node.kind === "topic")));
  const visibleTasks = $derived(standaloneTopics.length ? standaloneTopics : tabs.map(tabToProjectNode));
  const sidebarProjectFolders = [
    { name: "个人...", hint: "New proj..." },
    { name: "svadmin", hint: "" },
    { name: "Ether Orient", hint: "" },
    { name: "game", hint: "" },
    { name: "mediagroup", hint: "" },
  ];

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

    const tick = window.setInterval(() => {
      nowMs = Date.now();
    }, 1000);
    const unsubscribeEvents = onAgentEvent(handleEvent);
    const unsubscribeProjectTree = onProjectTreeChanged(() => {
      void refreshProjectTree();
    });
    return () => {
      window.clearInterval(tick);
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

  function formatClock(value: Date) {
    return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(value);
  }

  function formatMonth(value: Date) {
    return new Intl.DateTimeFormat(lang === "zh" ? "zh-CN" : "en-US", {
      year: "numeric",
      month: "long",
    }).format(value);
  }

  function buildCalendar(value: Date) {
    const year = value.getFullYear();
    const month = value.getMonth();
    const firstDay = new Date(year, month, 1);
    const startOffset = firstDay.getDay();
    const startTime = new Date(year, month, 1 - startOffset).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    return Array.from({ length: 35 }, (_, index) => {
      const date = new Date(startTime + index * dayMs);
      return {
        key: date.toISOString(),
        day: date.getDate(),
        current: date.getMonth() === month,
        today: date.toDateString() === value.toDateString(),
      };
    });
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

  async function useWorkbenchCommand(name: string) {
    workLayer = "today";
    const command = commands.find((item) => item.name.toLowerCase() === name.toLowerCase());
    input = command ? `/${command.name} ` : `/${name} `;
    await tick();
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
    workLayer = "today";
    tabs = [...tabs.map((item) => ({ ...item, active: false })), { ...tab, active: true }];
    await refresh();
  }

  async function openTopic(node: ProjectNode) {
    if (!node.topicId) return;
    if (node.kind === "global_topic") {
      await app().OpenGlobalTab(node.topicId);
      activityMode = "work";
      workLayer = "today";
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

  async function renameTask(node: ProjectNode) {
    if (!node.topicId) return;
    const current = node.label || t.activity.untitled;
    const next = window.prompt("编辑会话名称", current)?.trim();
    if (!next || next === current) return;
    await app().RenameTopic(node.topicId, next);
    await refresh();
  }

  async function deleteTask(node: ProjectNode) {
    if (!node.topicId) return;
    const name = node.label || t.activity.untitled;
    if (!window.confirm(`删除会话“${name}”？`)) return;
    await app().TrashTopic(node.topicId);
    await refresh();
  }

  async function newTopic(node: ProjectNode) {
    const global = node.kind === "global_folder";
    const workspaceRoot = global ? "" : (node.root ?? "");
    const topic = await app().CreateTopic(global ? "global" : "project", workspaceRoot, "");
    if (global) {
      await app().OpenGlobalTab(topic.id);
      activityMode = "work";
      workLayer = "today";
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
        <button type="button" onclick={() => { activityMode = "work"; workLayer = "capabilities"; }}>
          <Wrench size={17} />
          <span>{t.home.work.workbench.capabilityCenter}</span>
        </button>
      </nav>

      <section class="task-list project-list" aria-label="项目与对话管理">
        <div class="project-list__title">项目</div>
        <button class="project-list__folder is-current" type="button" onclick={() => (sidebarCollapsed = false)}>
          <Folder size={15} />
          <span>{activeTab?.workspaceName || "volt-gui"}</span>
        </button>

        <div class="project-list__threads">
          {#if projectGroups.length}
            {#each projectGroups as group (group.key)}
              {#each group.children ?? [] as topic (topic.key)}
                <article class={(topic.topicId || topic.key) === activeTaskKey ? "is-active" : ""}>
                  <button class="project-list__thread" type="button" onclick={() => openTask(topic)}>
                    <span>{topic.label || t.activity.untitled}</span>
                    {#if topic.running}<i aria-label={t.activity.running}></i>{/if}
                  </button>
                  <div>
                    <button type="button" aria-label="编辑会话" title="编辑会话" onclick={(event) => { event.stopPropagation(); void renameTask(topic); }}><SquarePen size={13} /></button>
                    <button type="button" aria-label="删除会话" title="删除会话" onclick={(event) => { event.stopPropagation(); void deleteTask(topic); }}><Trash2 size={13} /></button>
                  </div>
                </article>
              {/each}
            {/each}
          {:else if visibleTasks.length}
            {#each visibleTasks as topic (topic.key)}
              <article class={(topic.topicId || topic.key) === activeTaskKey ? "is-active" : ""}>
                <button class="project-list__thread" type="button" onclick={() => openTask(topic)}>
                  <span>{topic.label || t.activity.untitled}</span>
                  {#if topic.running}<i aria-label={t.activity.running}></i>{/if}
                </button>
                <div>
                  <button type="button" aria-label="编辑会话" title="编辑会话" onclick={(event) => { event.stopPropagation(); void renameTask(topic); }}><SquarePen size={13} /></button>
                  <button type="button" aria-label="删除会话" title="删除会话" onclick={(event) => { event.stopPropagation(); void deleteTask(topic); }}><Trash2 size={13} /></button>
                </div>
              </article>
            {/each}
          {:else}
            <p class="task-list__empty">{t.work.noTasks}</p>
          {/if}
        </div>

        <div class="project-list__folders">
          {#each sidebarProjectFolders as project (project.name)}
            <button type="button" onclick={() => (sidebarCollapsed = false)}>
              <Folder size={15} />
              <span>{project.name}</span>
              {#if project.hint}<em>{project.hint}</em>{/if}
            </button>
          {/each}
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
        {:else if activityMode === "work"}
          <section class="workbench">
            <header class="workbench__top">
              <div>
                <span>{t.home.work.workbench.eyebrow}</span>
                <h1>{t.home.work.workbench.title}</h1>
              </div>
              <div class="workbench__layers" role="tablist" aria-label={t.home.work.workbench.layers}>
                <button class={workLayer === "today" ? "is-active" : ""} type="button" role="tab" aria-selected={workLayer === "today"} onclick={() => (workLayer = "today")}>
                  {t.home.work.workbench.today}
                </button>
                <button class={workLayer === "capabilities" ? "is-active" : ""} type="button" role="tab" aria-selected={workLayer === "capabilities"} onclick={() => (workLayer = "capabilities")}>
                  {t.home.work.workbench.capabilities}
                </button>
              </div>
              <div class="workbench__actions">
                <button type="button" onclick={newTab}>
                  <Plus size={14} />
                  {t.activity.newSession}
                </button>
                <button type="button" onclick={() => (activityMode = "code")}>
                  <Code2 size={14} />
                  {t.activity.code}
                </button>
              </div>
            </header>

            {#if workLayer === "today"}
              <div class="workbench-grid">
                <section class="work-card work-card--clock">
                  <span>{t.home.work.workbench.focusTime}</span>
                  <strong>{clockLabel}</strong>
                  <p>{activeTab?.topicTitle || t.transcript.welcome}</p>
                </section>

                <section class="work-card work-card--actions">
                  <header>
                    <strong>{t.home.work.workbench.actions}</strong>
                    <span>{t.home.work.workbench.actionsHint}</span>
                  </header>
                  <div class="action-grid">
                    <button type="button" onclick={focusComposer}>
                      <Sparkles size={15} />
                      {t.home.work.workbench.aiChat}
                    </button>
                    <button type="button" onclick={() => useQuickPrompt(t.home.work.workbench.researchPrompt)}>
                      <Gauge size={15} />
                      {t.home.work.workbench.research}
                    </button>
                    <button type="button" onclick={() => useQuickPrompt(t.home.work.workbench.automationPrompt)}>
                      <Zap size={15} />
                      {t.home.automation}
                    </button>
                    <button type="button" onclick={() => (workLayer = "capabilities")}>
                      <Wrench size={15} />
                      {t.home.work.workbench.capabilityCenter}
                    </button>
                  </div>
                </section>

                <section class="work-card work-card--calendar">
                  <header>
                    <strong>{monthLabel}</strong>
                    <span>{t.home.work.workbench.calendar}</span>
                  </header>
                  <div class="mini-calendar">
                    {#each t.home.work.workbench.weekdays as day (day)}
                      <span class="mini-calendar__week">{day}</span>
                    {/each}
                    {#each calendarCells as day (day.key)}
                      <span class={["mini-calendar__day", !day.current && "is-muted", day.today && "is-today"]}>{day.day}</span>
                    {/each}
                  </div>
                </section>

                <section class="work-card work-card--tasks">
                  <header>
                    <strong>{t.home.work.workbench.taskBoard}</strong>
                    <span>
                      {t.home.work.workbench.taskStats
                        .replace("{running}", String(tabs.filter((tab) => tab.running).length))
                        .replace("{changes}", String(changedCount))}
                    </span>
                  </header>
                  <div class="task-board">
                    {#if visibleTasks.length}
                      {#each visibleTasks.slice(0, 6) as task (task.key)}
                        <button class={["work-task", (task.topicId || task.key) === activeTaskKey && "is-active"]} type="button" onclick={() => openTask(task)}>
                          <i></i>
                          <span>{task.label || t.activity.untitled}</span>
                          {#if task.running}<em>{t.activity.running}</em>{/if}
                        </button>
                      {/each}
                    {:else}
                      <p>{t.work.noTasks}</p>
                    {/if}
                  </div>
                </section>

                <section class="work-card work-card--assistant">
                  <div class="assistant-empty">
                    <span><Bot size={22} /></span>
                    <strong>{t.home.work.workbench.assistantTitle}</strong>
                    <p>{t.home.work.workbench.assistantHint}</p>
                  </div>
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
                </section>
              </div>
            {:else}
              <section class="capability-page">
                <div class="capability-page__intro">
                  <span>{t.home.work.workbench.capabilityEyebrow}</span>
                  <strong>{t.home.work.workbench.capabilityTitle}</strong>
                  <p>{t.home.work.workbench.capabilityHint}</p>
                </div>

                <div class="capability-grid">
                  <article class="cap-card cap-card--engine">
                    <header>
                      <strong>{t.home.work.workbench.engine}</strong>
                      <span>{selectedModel || t.common.ready}</span>
                    </header>
                    <div class="engine-metrics">
                      <span>{t.common.model}<strong>{selectedModel || "-"}</strong></span>
                      <span>{t.home.codeTools.context}<strong>{context ? `${contextPercent}%` : "-"}</strong></span>
                      <span>{t.code.changes}<strong>{changedCount}</strong></span>
                    </div>
                    <div class="cap-actions">
                      <button type="button" onclick={() => useWorkbenchCommand("model")}>/{reasonixCommands.find((command) => command.name === "model")?.name ?? "model"}</button>
                      <button type="button" onclick={() => useWorkbenchCommand("effort")}>/{reasonixCommands.find((command) => command.name === "effort")?.name ?? "effort"}</button>
                      <button type="button" onclick={openCodeInspector}>{t.home.codeTools.title}</button>
                    </div>
                  </article>

                  <article class="cap-card">
                    <header>
                      <strong>{t.home.work.workbench.reasonixCore}</strong>
                      <span>{reasonixCommands.length}</span>
                    </header>
                    <div class="command-list">
                      {#each reasonixCommands as command (command.name)}
                        <button type="button" onclick={() => useWorkbenchCommand(command.name)}>
                          <span>/{command.name}</span>
                          <em>{command.description}</em>
                        </button>
                      {/each}
                    </div>
                  </article>

                  <article class="cap-card">
                    <header>
                      <strong>{t.home.skills}</strong>
                      <span>{skillCommands.length}</span>
                    </header>
                    <div class="command-list">
                      {#if skillCommands.length}
                        {#each skillCommands.slice(0, 6) as command (command.name)}
                          <button type="button" onclick={() => useWorkbenchCommand(command.name)}>
                            <span>/{command.name}</span>
                            <em>{command.description}</em>
                          </button>
                        {/each}
                      {:else}
                        <p>{t.home.work.workbench.noSkills}</p>
                      {/if}
                    </div>
                    <button class="cap-card__footer" type="button" onclick={() => useWorkbenchCommand("skill")}>{t.home.work.workbench.manageSkills}</button>
                  </article>

                  <article class="cap-card">
                    <header>
                      <strong>{t.home.work.workbench.extensions}</strong>
                      <span>{extensionCommands.length}</span>
                    </header>
                    <div class="command-list">
                      {#each extensionCommands.slice(0, 6) as command (command.name)}
                        <button type="button" onclick={() => useWorkbenchCommand(command.name)}>
                          <span>/{command.name}</span>
                          <em>{command.description}</em>
                        </button>
                      {/each}
                      {#if extensionCommands.length === 0}
                        <p>{t.home.work.workbench.noExtensions}</p>
                      {/if}
                    </div>
                    <button class="cap-card__footer" type="button" onclick={() => useWorkbenchCommand("mcp")}>{t.home.work.workbench.manageMcp}</button>
                  </article>
                </div>
              </section>
            {/if}
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
    --sidebar-width: clamp(220px, 15vw, 280px);
    --content-width: clamp(620px, 52vw, 900px);
    --document-width: clamp(620px, 58vw, 860px);
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
    left: 50%;
  }

  .sidebar {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding: 14px 12px 12px;
    background: #eeeeee;
    border-right: 1px solid #dfdfdf;
  }

  .sidebar__chrome {
    --wails-draggable: drag;
    display: grid;
    grid-template-columns: 62px auto 28px;
    align-items: center;
    gap: 8px;
    min-height: 28px;
  }

  .window-dots {
    display: flex;
    gap: 8px;
    padding-left: 8px;
  }

  .window-dots span {
    width: 10px;
    height: 10px;
    background: #d1d1d1;
    border-radius: 50%;
  }

  .mode-switch {
    --wails-draggable: no-drag;
    display: inline-grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
    width: 132px;
    padding: 2px;
    background: #e2e2e2;
    border-radius: 8px;
  }

  .mode-switch__item {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    flex: 1 0 0;
    height: 26px;
    min-width: 0;
    padding: 0 7px;
    color: #333333;
    background: transparent;
    border: 0;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 520;
    line-height: 1;
    word-break: keep-all;
    white-space: nowrap;
    writing-mode: horizontal-tb;
  }

  .mode-switch__item :global(svg) {
    flex: 0 0 auto;
    width: 12px;
    height: 12px;
  }

  .mode-switch__item.is-active {
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  }

  .sidebar__icon {
    --wails-draggable: no-drag;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    color: #424242;
    background: transparent;
    border: none;
    border-radius: 7px;
  }

  .sidebar__icon:hover,
  .primary-actions button:hover {
    background: #dedede;
  }

  .primary-actions {
    display: grid;
    gap: 6px;
    margin-top: 30px;
  }

  .primary-actions button {
    --wails-draggable: no-drag;
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) auto;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 8px;
    color: #2f2f2f;
    background: transparent;
    border: 0;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 470;
    text-align: left;
  }

  .primary-actions__new {
    background: #dedede !important;
  }

  .primary-actions kbd {
    color: #7c7c7c;
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
  }

  .task-list {
    display: grid;
    align-content: start;
    min-height: 0;
    flex: 1;
    gap: 2px;
    margin-top: 24px;
  }

  .project-list__title {
    padding: 0 8px 8px;
    color: #888888;
    font-size: 12px;
    font-weight: 520;
  }

  .project-list__folder,
  .project-list__folders button {
    --wails-draggable: no-drag;
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    min-height: 30px;
    padding: 0 8px;
    color: #6a6a6a;
    background: transparent;
    border: 0;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 480;
    text-align: left;
  }

  .project-list__folder:hover,
  .project-list__folders button:hover {
    color: #333333;
    background: #e7e7e7;
  }

  .project-list__folder :global(svg),
  .project-list__folders :global(svg) {
    color: #737373;
  }

  .project-list__folder span,
  .project-list__folders span,
  .project-list__thread span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .project-list__threads,
  .project-list__folders {
    display: grid;
    gap: 1px;
  }

  .project-list__threads {
    margin: 2px 0 10px;
  }

  .project-list__threads article {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    min-width: 0;
    min-height: 31px;
    padding: 0 4px 0 0;
    border-radius: 8px;
  }

  .project-list__threads article:hover,
  .project-list__threads article.is-active {
    background: #e1e1e1;
  }

  .project-list__thread {
    --wails-draggable: no-drag;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 31px;
    padding: 0 6px 0 33px;
    color: #292929;
    background: transparent;
    border: 0;
    font-size: 13px;
    font-weight: 560;
    text-align: left;
  }

  .project-list__thread i {
    width: 9px;
    height: 9px;
    border: 1.5px solid #7c7c7c;
    border-top-color: transparent;
    border-radius: 999px;
  }

  .project-list__threads article > div {
    display: inline-flex;
    gap: 1px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .project-list__threads article:hover > div,
  .project-list__threads article:focus-within > div,
  .project-list__threads article.is-active > div {
    opacity: 1;
  }

  .project-list__threads article > div button {
    --wails-draggable: no-drag;
    display: grid;
    place-items: center;
    width: 25px;
    height: 25px;
    color: #777777;
    background: transparent;
    border: 0;
    border-radius: 7px;
  }

  .project-list__threads article > div button:hover {
    color: #333333;
    background: #d5d5d5;
  }

  .project-list__folders em {
    overflow: hidden;
    color: #a3a3a3;
    font-size: 12px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .task-list__empty {
    margin: 10px 7px;
    color: #8a8a8a;
    font-size: 12px;
  }

  .sidebar__user {
    display: grid;
    grid-template-columns: 30px minmax(0, auto) auto;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    color: #3f3f3f;
    font-size: 13px;
  }

  .sidebar__avatar {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
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
    font-size: 11px;
    font-style: normal;
  }

  .stage {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    padding: 8px 8px 8px 0;
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
    border-radius: 16px;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
  }

  .stage__surface,
  .workbench,
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

  .workbench {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 18px;
    background: #ffffff;
  }

  .workbench__top {
    --wails-draggable: drag;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 42px;
    margin-bottom: 12px;
  }

  .workbench__top span {
    color: #9a6a3a;
    font-size: 12px;
    font-weight: 650;
  }

  .workbench__top h1 {
    margin: 2px 0 0;
    color: #222222;
    font-size: 18px;
    font-weight: 680;
  }

  .workbench__layers {
    --wails-draggable: no-drag;
    display: inline-grid;
    grid-template-columns: repeat(2, minmax(72px, 1fr));
    gap: 2px;
    padding: 3px;
    background: #f0f1f3;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
  }

  .workbench__layers button {
    min-height: 28px;
    padding: 0 10px;
    color: #6c737f;
    background: transparent;
    border: 0;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 620;
  }

  .workbench__layers button.is-active {
    color: #242424;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  }

  .workbench__actions {
    --wails-draggable: no-drag;
    display: flex;
    gap: 8px;
  }

  .workbench__actions button {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 30px;
    padding: 0 10px;
    color: #2563eb;
    background: #eef5ff;
    border: 1px solid #e2ecff;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 620;
  }

  .workbench-grid {
    display: grid;
    grid-template-columns: minmax(320px, 0.86fr) minmax(420px, 1.14fr);
    grid-template-areas:
      "clock calendar"
      "actions calendar"
      "tasks assistant";
    gap: 12px;
    min-height: 0;
  }

  .work-card {
    min-width: 0;
    overflow: hidden;
    background: #f8f9fb;
    border: 1px solid #e8ebef;
    border-radius: 14px;
  }

  .work-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 16px 8px;
  }

  .work-card header strong {
    color: #242424;
    font-size: 14px;
    font-weight: 680;
  }

  .work-card header span {
    color: #8a8f98;
    font-size: 12px;
  }

  .work-card--clock {
    grid-area: clock;
    display: grid;
    place-items: center;
    min-height: 144px;
    padding: 22px;
    text-align: center;
  }

  .work-card--clock span {
    color: #8a8f98;
    font-size: 12px;
    font-weight: 650;
  }

  .work-card--clock strong {
    display: block;
    margin-top: 12px;
    padding: 3px 8px;
    color: #f8fafc;
    background: #18181b;
    border-radius: 8px;
    font-family: var(--mono);
    font-size: clamp(28px, 3vw, 48px);
    letter-spacing: 0.08em;
  }

  .work-card--clock p {
    max-width: 520px;
    margin: 12px 0 0;
    overflow: hidden;
    color: #767b84;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .work-card--actions {
    grid-area: actions;
    min-height: 128px;
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 8px 16px 16px;
  }

  .action-grid button {
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    min-height: 38px;
    padding: 0 12px;
    color: #2d3748;
    background: #ffffff;
    border: 1px solid #e7e9ee;
    border-radius: 11px;
    font-size: 13px;
    font-weight: 620;
  }

  .action-grid button:nth-child(1) {
    color: #15803d;
    background: #eaf7ee;
    border-color: #d9f0df;
  }

  .action-grid button:nth-child(2) {
    color: #2563eb;
    background: #edf4ff;
    border-color: #dce9ff;
  }

  .action-grid button:nth-child(3) {
    color: #7c3aed;
    background: #f2e8ff;
    border-color: #ead8ff;
  }

  .action-grid button:nth-child(4) {
    color: #9a3412;
    background: #fff4e5;
    border-color: #ffe2b7;
  }

  .work-card--calendar {
    grid-area: calendar;
    min-height: 284px;
  }

  .mini-calendar {
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    padding: 0 10px 12px;
    border-top: 1px solid #e6e9ee;
  }

  .mini-calendar__week,
  .mini-calendar__day {
    display: grid;
    min-height: 38px;
    place-items: start;
    padding: 8px;
    color: #30343b;
    border-right: 1px solid #e6e9ee;
    border-bottom: 1px solid #e6e9ee;
    font-size: 12px;
  }

  .mini-calendar__week {
    min-height: 34px;
    place-items: center;
    color: #777d86;
    font-weight: 650;
  }

  .mini-calendar__day.is-muted {
    color: #b6bbc3;
  }

  .mini-calendar__day.is-today {
    color: #ffffff;
    background: radial-gradient(circle at 22px 22px, #2563eb 0 12px, transparent 13px);
    font-weight: 720;
  }

  .work-card--tasks {
    grid-area: tasks;
    min-height: 196px;
  }

  .task-board {
    display: grid;
    gap: 6px;
    max-height: 220px;
    overflow: auto;
    padding: 4px 16px 16px;
  }

  .task-board p {
    margin: 8px 0;
    color: #8a8f98;
    font-size: 13px;
  }

  .work-task {
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    align-items: center;
    gap: 9px;
    min-height: 30px;
    padding: 0 8px;
    color: #292d33;
    background: transparent;
    border: 0;
    border-radius: 8px;
    font-size: 13px;
    text-align: left;
  }

  .work-task:hover,
  .work-task.is-active {
    background: #ffffff;
  }

  .work-task i {
    width: 7px;
    height: 7px;
    background: #f59e0b;
    border-radius: 50%;
  }

  .work-task span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .work-task em {
    color: #ef4444;
    font-size: 11px;
    font-style: normal;
  }

  .work-card--assistant {
    grid-area: assistant;
    display: grid;
    align-content: center;
    gap: 16px;
    min-height: 196px;
    padding: 24px;
  }

  .assistant-empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    text-align: center;
  }

  .assistant-empty span {
    display: grid;
    width: 40px;
    height: 40px;
    place-items: center;
    color: #2563eb;
    background: #eaf2ff;
    border-radius: 13px;
  }

  .assistant-empty strong {
    color: #222222;
    font-size: 14px;
  }

  .assistant-empty p {
    max-width: 420px;
    margin: 0;
    color: #7d838c;
    font-size: 12px;
    line-height: 1.5;
  }

  .work-card--assistant :global(.composer) {
    min-height: 104px;
    background: #ffffff;
    border-radius: 13px;
    box-shadow: none;
  }

  .work-card--assistant :global(.composer textarea) {
    min-height: 42px;
    font-size: 13px;
  }

  .capability-page {
    display: grid;
    gap: 14px;
    min-height: 0;
  }

  .capability-page__intro {
    display: grid;
    gap: 5px;
    padding: 18px 20px;
    background: linear-gradient(135deg, #fff7ed, #f8fafc 58%, #eef6ff);
    border: 1px solid #e8ebef;
    border-radius: 16px;
  }

  .capability-page__intro span {
    color: #9a6a3a;
    font-size: 12px;
    font-weight: 720;
  }

  .capability-page__intro strong {
    color: #222222;
    font-size: 20px;
    font-weight: 720;
  }

  .capability-page__intro p {
    max-width: 720px;
    margin: 0;
    color: #727984;
    font-size: 13px;
    line-height: 1.5;
  }

  .capability-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .cap-card {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 220px;
    overflow: hidden;
    background: #f8f9fb;
    border: 1px solid #e8ebef;
    border-radius: 14px;
  }

  .cap-card header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 14px 16px 10px;
  }

  .cap-card header strong {
    color: #242424;
    font-size: 14px;
    font-weight: 700;
  }

  .cap-card header span {
    overflow: hidden;
    color: #8a8f98;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .engine-metrics {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 8px;
    padding: 0 16px 12px;
  }

  .engine-metrics span {
    display: grid;
    gap: 4px;
    min-width: 0;
    padding: 10px;
    color: #7b828d;
    background: #ffffff;
    border: 1px solid #eceff3;
    border-radius: 11px;
    font-size: 11px;
  }

  .engine-metrics strong {
    overflow: hidden;
    color: #252932;
    font-size: 13px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cap-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: auto;
    padding: 0 16px 16px;
  }

  .cap-actions button,
  .cap-card__footer {
    min-height: 30px;
    padding: 0 10px;
    color: #2f3a4a;
    background: #ffffff;
    border: 1px solid #e1e5eb;
    border-radius: 9px;
    font-size: 12px;
    font-weight: 620;
  }

  .command-list {
    display: grid;
    gap: 6px;
    min-height: 0;
    overflow: auto;
    padding: 0 12px 12px;
  }

  .command-list button {
    display: grid;
    grid-template-columns: minmax(92px, auto) minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    min-height: 34px;
    padding: 0 10px;
    color: #293241;
    background: #ffffff;
    border: 1px solid #eceff3;
    border-radius: 10px;
    text-align: left;
  }

  .command-list button:hover,
  .cap-actions button:hover,
  .cap-card__footer:hover {
    border-color: #d8dee8;
    background: #fdfdfd;
  }

  .command-list span {
    color: #2563eb;
    font-family: var(--mono);
    font-size: 12px;
    font-weight: 700;
  }

  .command-list em,
  .command-list p {
    min-width: 0;
    overflow: hidden;
    margin: 0;
    color: #7b828d;
    font-size: 12px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cap-card__footer {
    align-self: flex-start;
    margin: auto 12px 12px;
  }

  .home {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 0;
    padding: clamp(24px, 6vh, 64px) clamp(18px, 4vw, 56px) clamp(70px, 12vh, 120px);
  }

  .home h1 {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 0 clamp(26px, 5vh, 50px);
    color: #1f1f1f;
    font-size: clamp(26px, 1.9vw, 34px);
    font-weight: 650;
    letter-spacing: 0;
    line-height: 1.08;
    white-space: nowrap;
  }

  .home h1 :global(svg) {
    width: clamp(24px, 1.7vw, 30px);
    height: clamp(24px, 1.7vw, 30px);
  }

  .home h1 span {
    align-self: flex-start;
    margin-top: 3px;
    padding: 2px 6px;
    color: #777777;
    background: #eeeeee;
    border: 1px solid #d7d7d7;
    border-radius: 5px;
    font-size: 12px;
    font-weight: 600;
  }

  .home__composer {
    width: min(100%, var(--content-width));
    overflow: hidden;
    background: #f4f4f4;
    border-radius: 15px;
  }

  .home__context {
    display: flex;
    gap: 22px;
    min-height: 44px;
    padding: 0 18px;
  }

  .home__context button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: #3e3e3e;
    background: transparent;
    border: 0;
    font-size: 13px;
    font-weight: 540;
  }

  .home__quick {
    display: grid;
    grid-template-columns: repeat(4, minmax(112px, max-content));
    justify-content: center;
    gap: 9px;
    margin-top: 24px;
  }

  .home__quick button {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 42px;
    padding: 0 14px;
    color: #333333;
    background: #ffffff;
    border: 1px solid #e3e3e3;
    border-radius: 11px;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.03);
    font-size: 13px;
    font-weight: 560;
  }

  .code-tools {
    display: grid;
    grid-template-columns: repeat(4, minmax(116px, 1fr));
    gap: 8px;
    width: min(100%, 720px);
    margin-top: 16px;
  }

  .code-tools button {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    min-height: 36px;
    padding: 0 10px;
    color: #3c3c3c;
    background: #fafafa;
    border: 1px solid #e5e5e5;
    border-radius: 10px;
    font-size: 12px;
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
    padding: 26px clamp(24px, 5vw, 80px) 196px;
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
    min-height: 50px;
    padding: 0 18px;
    border-bottom: 1px solid #eeeeee;
  }

  .conversation-header div {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .conversation-header strong {
    overflow: hidden;
    color: #242424;
    font-size: 14px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conversation-header span {
    overflow: hidden;
    color: #8a8a8a;
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conversation-header button {
    --wails-draggable: no-drag;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    min-height: 30px;
    padding: 0 10px;
    color: #303030;
    background: #ffffff;
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    font-size: 12px;
  }

  .stage__composer {
    position: absolute;
    bottom: 26px;
    left: 50%;
    z-index: 4;
    width: min(100%, var(--document-width));
    transform: translateX(-50%);
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
    width: min(500px, calc(100% - var(--sidebar-width) - 56px));
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
    min-height: 112px;
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
    min-height: 56px;
    color: #242424;
    font-size: 14px;
  }

  .home__composer :global(.composer button[type="submit"]),
  .stage__composer :global(.composer button[type="submit"]) {
    width: 36px;
    height: 36px;
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
      --sidebar-width: 220px;
      --content-width: min(760px, calc(100vw - var(--sidebar-width) - 72px));
      --document-width: min(760px, calc(100vw - var(--sidebar-width) - 72px));
    }

    .stage__composer {
      width: min(100%, var(--document-width));
    }

    .home__composer,
    .code-tools {
      width: min(760px, 86%);
    }

    .home__quick,
    .code-tools {
      grid-template-columns: repeat(2, minmax(150px, 1fr));
    }

    .workbench-grid {
      grid-template-columns: 1fr;
      grid-template-areas:
        "clock"
        "actions"
        "calendar"
        "tasks"
        "assistant";
    }

    .capability-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 768px) {
    .shell {
      --content-width: calc(100vw - 36px);
      --document-width: calc(100vw - 36px);
      grid-template-columns: 1fr;
    }

    .sidebar {
      display: none;
    }

    .stage {
      padding: 8px;
    }

    .stage__composer {
      width: var(--document-width);
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

    .workbench {
      padding: 12px;
    }

    .workbench__top {
      align-items: flex-start;
      flex-direction: column;
    }

    .workbench__actions {
      width: 100%;
      flex-wrap: wrap;
    }

    .workbench__layers {
      width: 100%;
    }

    .capability-page__intro {
      padding: 14px;
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

    .action-grid {
      grid-template-columns: 1fr;
    }

    .engine-metrics,
    .command-list button {
      grid-template-columns: 1fr;
    }

    .mini-calendar__week,
    .mini-calendar__day {
      min-height: 32px;
      padding: 6px;
      font-size: 11px;
    }
  }

  @media (min-width: 1800px) {
    .shell {
      --sidebar-width: 280px;
      --content-width: 900px;
      --document-width: 820px;
    }

    .home {
      padding-bottom: 13vh;
    }
  }

  @media (min-width: 2400px) {
    .shell {
      --sidebar-width: 280px;
      --content-width: 900px;
      --document-width: 820px;
    }

    .home h1 {
      font-size: 34px;
    }
  }
</style>
