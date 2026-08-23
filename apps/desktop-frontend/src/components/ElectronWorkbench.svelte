<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    AlertTriangle,
    Bot,
    Check,
    ChevronRight,
    CircleStop,
    Code2,
    Folder,
    FolderOpen,
    Gauge,
    LoaderCircle,
    Maximize2,
    Menu,
    MessageSquarePlus,
    Minimize2,
    PanelLeftClose,
    PanelLeftOpen,
    Send,
    Settings,
    Sparkles,
    Square,
    TerminalSquare,
    Trash2,
    Wrench,
    X,
  } from "@lucide/svelte";

  import type { ElectronDshConfig } from "../electron";
  import {
    clearDshHistory,
    getDshHealth,
    getDshHistory,
    getDshTools,
    streamDshTurn,
  } from "../lib/electron-dsh-client";
  import type {
    DshCacheDiagnostics,
    DshMessage,
    DshToolSchema,
    DshTurnEvent,
  } from "../lib/electron-dsh-client";

  type RuntimeState = "connecting" | "ready" | "error";
  type MessageStatus = "complete" | "streaming" | "failed" | "canceled";

  interface ToolRun {
    id: string;
    name: string;
    args: string;
    output: string;
    status: "running" | "complete" | "failed";
  }

  interface WorkbenchMessage {
    id: string;
    role: "user" | "assistant";
    content: string;
    reasoning: string;
    tools: ToolRun[];
    status: MessageStatus;
    error?: string;
  }

  const electronApi = typeof window !== "undefined" ? window.electronDsh : undefined;
  const quickStarts = [
    { title: "检查当前项目", prompt: "检查当前项目状态，找出最值得先处理的问题，并给出验证步骤。", icon: Gauge },
    { title: "修复一个问题", prompt: "先阅读项目约定和相关代码，定位当前最明显的故障并完成修复与验证。", icon: Wrench },
    { title: "理解代码结构", prompt: "梳理当前项目的主要模块、启动流程和关键依赖，指出需要注意的风险。", icon: Code2 },
  ] as const;

  let messages = $state<WorkbenchMessage[]>([]);
  let tools = $state<DshToolSchema[]>([]);
  let input = $state("");
  let serverUrl = $state("");
  let workingDir = $state("");
  let config = $state<ElectronDshConfig>();
  let runtimeState = $state<RuntimeState>("connecting");
  let runtimeError = $state("");
  let sending = $state(false);
  let activeAssistantId = $state("");
  let abortController = $state<AbortController>();
  let diagnostics = $state<DshCacheDiagnostics>();
  let sidebarCollapsed = $state(false);
  let mobileSidebarOpen = $state(false);
  let settingsOpen = $state(false);
  let toolsOpen = $state(false);
  let clearDialogOpen = $state(false);
  let savingSettings = $state(false);
  let settingsError = $state("");
  let settingsSuccess = $state("");
  let modelDraft = $state("");
  let baseUrlDraft = $state("");
  let apiKeyDraft = $state("");
  let clearApiKey = $state(false);
  let compactReasoningDraft = $state(true);
  let degenerationGuardDraft = $state(true);
  let isMaximized = $state(false);
  let transcriptElement: HTMLDivElement | undefined = $state();
  let textareaElement: HTMLTextAreaElement | undefined = $state();

  const isEmpty = $derived(messages.length === 0);
  const runtimeLabel = $derived(
    runtimeState === "ready" ? "运行正常" : runtimeState === "connecting" ? "正在连接" : "连接异常",
  );
  const workspaceName = $derived.by(() => {
    const normalized = workingDir.replace(/[\\/]+$/, "");
    return normalized.split(/[\\/]/).pop() || "未选择工作区";
  });

  function messageId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function displayError(error: unknown): string {
    if (error instanceof DOMException && error.name === "AbortError") return "任务已取消。";
    if (error instanceof Error) return error.message;
    return String(error);
  }

  function nativeApi(): NonNullable<typeof electronApi> {
    if (!electronApi) throw new Error("Electron preload 未加载，原生操作不可用。");
    return electronApi;
  }

  async function scrollToBottom(): Promise<void> {
    await tick();
    if (transcriptElement) transcriptElement.scrollTop = transcriptElement.scrollHeight;
  }

  function hydrateMessages(history: DshMessage[]): WorkbenchMessage[] {
    const hydrated: WorkbenchMessage[] = [];
    let latestAssistant: WorkbenchMessage | undefined;

    for (const message of history) {
      if (message.role === "user") {
        hydrated.push({
          id: messageId("user-history"),
          role: "user",
          content: message.content,
          reasoning: "",
          tools: [],
          status: "complete",
        });
        latestAssistant = undefined;
        continue;
      }

      if (message.role === "assistant") {
        latestAssistant = {
          id: messageId("assistant-history"),
          role: "assistant",
          content: message.content,
          reasoning: message.reasoningContent ?? "",
          tools: (message.toolCalls ?? []).map((toolCall) => ({
            id: toolCall.id,
            name: toolCall.function.name,
            args: toolCall.function.arguments,
            output: "",
            status: "complete",
          })),
          status: "complete",
        };
        hydrated.push(latestAssistant);
        continue;
      }

      if (message.role === "tool") {
        const existing = latestAssistant?.tools.find((tool) => tool.id === message.toolCallId);
        if (existing) {
          existing.output = message.content;
          existing.status = "complete";
        } else {
          const target = latestAssistant ?? {
            id: messageId("assistant-tool-history"),
            role: "assistant" as const,
            content: "",
            reasoning: "",
            tools: [],
            status: "complete" as const,
          };
          target.tools.push({
            id: message.toolCallId ?? messageId("tool-history"),
            name: message.name ?? "工具",
            args: "{}",
            output: message.content,
            status: "complete",
          });
          if (!latestAssistant) hydrated.push(target);
          latestAssistant = target;
        }
      }
    }

    return hydrated;
  }

  function applyConfig(next: ElectronDshConfig): void {
    config = next;
    modelDraft = next.model;
    baseUrlDraft = next.baseURL;
    apiKeyDraft = "";
    clearApiKey = false;
    compactReasoningDraft = next.compactReasoning;
    degenerationGuardDraft = next.degenerationGuard;
  }

  async function refreshRuntime(loadHistory = false): Promise<void> {
    runtimeState = "connecting";
    runtimeError = "";

    try {
      const api = nativeApi();
      const [nextServerUrl, nextWorkingDir, nextConfig] = await Promise.all([
        api.getServerUrl(),
        api.getWorkingDir(),
        api.getConfig(),
      ]);
      serverUrl = nextServerUrl;
      workingDir = nextWorkingDir;
      applyConfig(nextConfig);

      const [health, nextTools, history] = await Promise.all([
        getDshHealth(serverUrl),
        getDshTools(serverUrl),
        loadHistory ? getDshHistory(serverUrl) : Promise.resolve<DshMessage[]>([]),
      ]);
      tools = nextTools;
      if (config && health.model !== config.model) applyConfig({ ...config, model: health.model });
      if (loadHistory) messages = hydrateMessages(history);
      runtimeState = "ready";
    } catch (error) {
      runtimeState = "error";
      runtimeError = displayError(error);
    }
  }

  function activeAssistant(): WorkbenchMessage | undefined {
    return messages.find((message) => message.id === activeAssistantId);
  }

  function upsertTool(event: Extract<DshTurnEvent, { type: "tool_exec_start" | "tool_exec_result" }>): void {
    const assistant = activeAssistant();
    if (!assistant) return;
    const existing = assistant.tools.find((tool) => tool.id === event.toolCallId);

    if (event.type === "tool_exec_start") {
      const args = JSON.stringify(event.args, null, 2);
      if (existing) {
        existing.name = event.name;
        existing.args = args;
        existing.status = "running";
      } else {
        assistant.tools.push({
          id: event.toolCallId,
          name: event.name,
          args,
          output: "",
          status: "running",
        });
      }
      return;
    }

    if (existing) {
      existing.output = event.output;
      existing.status = event.isError ? "failed" : "complete";
    } else {
      assistant.tools.push({
        id: event.toolCallId,
        name: event.name,
        args: "{}",
        output: event.output,
        status: event.isError ? "failed" : "complete",
      });
    }
  }

  function handleTurnEvent(event: DshTurnEvent): void {
    const assistant = activeAssistant();
    if (!assistant) return;

    switch (event.type) {
      case "reasoning_delta":
        assistant.reasoning += event.delta;
        break;
      case "content_delta":
        assistant.content += event.delta;
        break;
      case "tool_exec_start":
      case "tool_exec_result":
        upsertTool(event);
        break;
      case "cache_diagnostics":
        diagnostics = event.diagnostics;
        break;
      case "degeneration_detected":
        assistant.error = `检测到重复输出，已触发保护：${event.reason}`;
        break;
      case "turn_complete":
        assistant.status = "complete";
        if (event.totalUsage) diagnostics = event.totalUsage;
        break;
      case "error":
        assistant.status = "failed";
        assistant.error = event.message;
        break;
      default:
        break;
    }
    void scrollToBottom();
  }

  async function sendMessage(promptOverride?: string): Promise<void> {
    const prompt = (promptOverride ?? input).trim();
    if (!prompt || sending || runtimeState !== "ready") return;

    const userMessage: WorkbenchMessage = {
      id: messageId("user"),
      role: "user",
      content: prompt,
      reasoning: "",
      tools: [],
      status: "complete",
    };
    const assistantMessage: WorkbenchMessage = {
      id: messageId("assistant"),
      role: "assistant",
      content: "",
      reasoning: "",
      tools: [],
      status: "streaming",
    };

    messages.push(userMessage, assistantMessage);
    activeAssistantId = assistantMessage.id;
    input = "";
    sending = true;
    diagnostics = undefined;
    abortController = new AbortController();
    await scrollToBottom();

    try {
      await streamDshTurn(
        serverUrl,
        prompt,
        config?.model || "deepseek-chat",
        handleTurnEvent,
        abortController.signal,
      );
      if (assistantMessage.status === "streaming") assistantMessage.status = "complete";
    } catch (error) {
      const canceled = error instanceof DOMException && error.name === "AbortError";
      assistantMessage.status = canceled ? "canceled" : "failed";
      assistantMessage.error = displayError(error);
      if (!canceled) {
        runtimeState = "error";
        runtimeError = assistantMessage.error;
      }
    } finally {
      sending = false;
      activeAssistantId = "";
      abortController = undefined;
      await scrollToBottom();
    }
  }

  function cancelMessage(): void {
    abortController?.abort();
  }

  function handleComposerKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      void sendMessage();
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent): void {
    if ((event.ctrlKey || event.metaKey) && event.key === ",") {
      event.preventDefault();
      openSettings();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "l") {
      event.preventDefault();
      textareaElement?.focus();
    }
    if (event.key === "Escape") {
      settingsOpen = false;
      toolsOpen = false;
      mobileSidebarOpen = false;
      clearDialogOpen = false;
    }
  }

  async function chooseWorkspace(): Promise<void> {
    try {
      const result = await nativeApi().openFolderDialog();
      if (!result) return;
      if (!result.success) throw new Error(result.error || "工作区切换失败。");
      workingDir = result.workingDir ?? workingDir;
      serverUrl = result.serverUrl ?? serverUrl;
      messages = [];
      diagnostics = undefined;
      await refreshRuntime(true);
    } catch (error) {
      runtimeState = "error";
      runtimeError = displayError(error);
    }
  }

  function openSettings(): void {
    if (config) applyConfig(config);
    settingsError = "";
    settingsSuccess = "";
    settingsOpen = true;
  }

  async function saveSettings(): Promise<void> {
    if (!config || savingSettings) return;
    settingsError = "";
    settingsSuccess = "";
    savingSettings = true;

    try {
      const result = await nativeApi().saveConfig({
        model: modelDraft,
        baseURL: baseUrlDraft,
        apiKey: apiKeyDraft || undefined,
        clearApiKey,
        compactReasoning: compactReasoningDraft,
        degenerationGuard: degenerationGuardDraft,
      });
      if (!result.success || !result.config) throw new Error(result.error || "配置保存失败。当前运行配置未变更。");
      applyConfig(result.config);
      serverUrl = result.serverUrl ?? serverUrl;
      messages = [];
      diagnostics = undefined;
      settingsSuccess = "运行配置已更新，会话已重新开始。";
      await refreshRuntime(true);
    } catch (error) {
      settingsError = displayError(error);
    } finally {
      savingSettings = false;
    }
  }

  async function clearConversation(): Promise<void> {
    clearDialogOpen = false;
    if (!serverUrl || sending) return;
    try {
      await clearDshHistory(serverUrl);
      messages = [];
      diagnostics = undefined;
      input = "";
      await tick();
      textareaElement?.focus();
    } catch (error) {
      runtimeState = "error";
      runtimeError = displayError(error);
    }
  }

  function requestNewConversation(): void {
    if (messages.length === 0) {
      textareaElement?.focus();
      return;
    }
    clearDialogOpen = true;
  }

  function openQuickStart(prompt: string): void {
    input = prompt;
    void tick().then(() => textareaElement?.focus());
  }

  onMount(() => {
    void refreshRuntime(true).then(scrollToBottom);
    let removeWindowStateListener: (() => void) | undefined;
    if (electronApi) {
      void electronApi.isMaximized().then((value) => (isMaximized = value));
      removeWindowStateListener = electronApi.onWindowStateChange((state) => (isMaximized = state.isMaximized));
    }
    return () => {
      abortController?.abort();
      removeWindowStateListener?.();
    };
  });
</script>

<svelte:head>
  <title>西谷智灯暗涌系统 工作台</title>
</svelte:head>

<svelte:window onkeydown={handleGlobalKeydown} />

<main class="desktop-workbench" class:sidebar-collapsed={sidebarCollapsed}>
  <header class="titlebar">
    <div class="titlebar__brand">
      <span class="brand-mark" aria-hidden="true">西</span>
      <strong>西谷智灯暗涌系统</strong>
      <span>工作台</span>
    </div>
    <div class="titlebar__context" title={workingDir}>
      <Folder size={13} />
      <span>{workspaceName}</span>
    </div>
    <div class="titlebar__actions">
      <button class="runtime-pill" class:error={runtimeState === "error"} type="button" onclick={() => void refreshRuntime()} title={runtimeError || serverUrl}>
        {#if runtimeState === "connecting"}<LoaderCircle class="spin" size={13} />{:else}<span class="status-dot"></span>{/if}
        {runtimeLabel}
      </button>
      <button type="button" onclick={openSettings} title="设置" aria-label="设置"><Settings size={15} /></button>
      <i aria-hidden="true"></i>
      <button type="button" onclick={() => void nativeApi().minimizeWindow()} title="最小化" aria-label="最小化"><Minimize2 size={15} /></button>
      <button type="button" onclick={() => void nativeApi().maximizeWindow()} title={isMaximized ? "还原" : "最大化"} aria-label={isMaximized ? "还原" : "最大化"}>
        {#if isMaximized}<Square size={12} />{:else}<Maximize2 size={14} />{/if}
      </button>
      <button class="close-button" type="button" onclick={() => void nativeApi().closeWindow()} title="关闭" aria-label="关闭"><X size={16} /></button>
    </div>
  </header>

  <aside class="sidebar" class:mobile-open={mobileSidebarOpen}>
    <div class="sidebar__toolbar">
      <button type="button" onclick={() => (sidebarCollapsed = !sidebarCollapsed)} title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"} aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}>
        {#if sidebarCollapsed}<PanelLeftOpen size={16} />{:else}<PanelLeftClose size={16} />{/if}
      </button>
      <button class="new-conversation" type="button" onclick={requestNewConversation} title="新建会话">
        <MessageSquarePlus size={16} /><span>新建会话</span>
      </button>
    </div>

    <nav aria-label="工作台导航">
      <section>
        <span class="sidebar__label">会话</span>
        <button class="nav-row active" type="button" onclick={() => (mobileSidebarOpen = false)}>
          <Sparkles size={15} />
          <span><strong>当前会话</strong><em>{sending ? "正在执行" : messages.length ? `${messages.filter((message) => message.role === "user").length} 轮` : "等待任务"}</em></span>
          <ChevronRight size={14} />
        </button>
      </section>

      <section>
        <span class="sidebar__label">上下文</span>
        <button class="nav-row" type="button" onclick={chooseWorkspace} disabled={!electronApi} title={workingDir}>
          <FolderOpen size={15} />
          <span><strong>{workspaceName}</strong><em>工作区</em></span>
          <ChevronRight size={14} />
        </button>
        <button class="nav-row" type="button" onclick={() => (toolsOpen = true)}>
          <Wrench size={15} />
          <span><strong>{tools.length} 个工具</strong><em>{config?.model || "等待模型"}</em></span>
          <ChevronRight size={14} />
        </button>
      </section>
    </nav>

    <footer class="sidebar__footer">
      <button type="button" onclick={openSettings}>
        <Settings size={15} /><span><strong>运行设置</strong><em>{config?.apiKeySet ? "密钥已配置" : "密钥未设置"}</em></span>
      </button>
      <small>v1.0.0 · Electron DSH</small>
    </footer>
  </aside>

  <section class="workspace">
    <button class="mobile-menu" type="button" onclick={() => (mobileSidebarOpen = true)} aria-label="打开导航"><Menu size={17} /></button>

    {#if runtimeState === "error"}
      <div class="runtime-banner" role="alert">
        <AlertTriangle size={16} />
        <div><strong>运行环境连接失败</strong><span>{runtimeError}</span></div>
        <button type="button" onclick={() => void refreshRuntime()}>重试</button>
        <button type="button" onclick={openSettings}>检查设置</button>
      </div>
    {/if}

    {#if isEmpty}
      <div class="start-surface">
        <section class="start-copy">
          <span class="section-kicker"><Bot size={14} /> DSH 智能执行</span>
          <h1>从一个清晰任务开始</h1>
          <p>{workspaceName}</p>
        </section>

        <div class="quick-starts" aria-label="常用任务">
          {#each quickStarts as item (item.title)}
            {@const QuickIcon = item.icon}
            <button type="button" onclick={() => openQuickStart(item.prompt)}>
              <QuickIcon size={16} />
              <span><strong>{item.title}</strong><em>{item.prompt}</em></span>
              <ChevronRight size={15} />
            </button>
          {/each}
        </div>

        <section class="composer composer--start">
          <textarea
            bind:this={textareaElement}
            bind:value={input}
            rows="4"
            placeholder="描述你希望完成的任务…"
            aria-label="任务内容"
            disabled={sending}
            onkeydown={handleComposerKeydown}
          ></textarea>
          <footer>
            <div class="composer__context">
              <span title={workingDir}><Folder size={13} /> {workspaceName}</span>
              <span><Bot size={13} /> {config?.model || "等待模型"}</span>
            </div>
            <button class="send-button" type="button" onclick={() => void sendMessage()} disabled={!input.trim() || sending || runtimeState !== "ready"} aria-label="发送任务">
              <Send size={16} />
            </button>
          </footer>
        </section>
      </div>
    {:else}
      <header class="conversation-header">
        <div>
          <strong>当前会话</strong>
          <span>{workspaceName} · {config?.model || "等待模型"}</span>
        </div>
        <button type="button" onclick={requestNewConversation}><MessageSquarePlus size={15} /> 新建会话</button>
      </header>

      <div class="transcript" bind:this={transcriptElement}>
        <div class="transcript__column">
          {#each messages as message (message.id)}
            {#if message.role === "user"}
              <article class="message message--user">
                <div class="message__label">你</div>
                <p>{message.content}</p>
              </article>
            {:else}
              <article class="message message--assistant" data-status={message.status}>
                <div class="message__label"><span><Sparkles size={13} /></span> 暗涌</div>
                {#if message.reasoning}
                  <details class="reasoning" open={message.status === "streaming" && !message.content}>
                    <summary>{message.status === "streaming" && !message.content ? "正在思考" : "思考过程"}</summary>
                    <p>{message.reasoning}</p>
                  </details>
                {/if}
                {#each message.tools as tool (tool.id)}
                  <details class="tool-run" class:failed={tool.status === "failed"} open={tool.status !== "complete"}>
                    <summary>
                      {#if tool.status === "running"}<LoaderCircle class="spin" size={14} />{:else if tool.status === "failed"}<AlertTriangle size={14} />{:else}<Check size={14} />{/if}
                      <strong>{tool.name}</strong>
                      <span>{tool.status === "running" ? "执行中" : tool.status === "failed" ? "失败" : "已完成"}</span>
                    </summary>
                    <div><span class="tool-run__label">参数</span><pre>{tool.args}</pre>{#if tool.output}<span class="tool-run__label">结果</span><pre>{tool.output}</pre>{/if}</div>
                  </details>
                {/each}
                {#if message.content}<p class="assistant-content">{message.content}</p>{/if}
                {#if message.status === "streaming" && !message.content && !message.reasoning && message.tools.length === 0}
                  <div class="message-loading"><LoaderCircle class="spin" size={15} /> 正在准备上下文</div>
                {/if}
                {#if message.error}<div class="message-error"><AlertTriangle size={14} /> {message.error}</div>{/if}
              </article>
            {/if}
          {/each}
        </div>
      </div>

      <div class="conversation-composer-wrap">
        <section class="composer">
          <textarea
            bind:this={textareaElement}
            bind:value={input}
            rows="3"
            placeholder={sending ? "任务执行中…" : "继续描述或提出下一步任务…"}
            aria-label="任务内容"
            disabled={sending}
            onkeydown={handleComposerKeydown}
          ></textarea>
          <footer>
            <div class="composer__context">
              <span title={workingDir}><Folder size={13} /> {workspaceName}</span>
              <span><Bot size={13} /> {config?.model || "等待模型"}</span>
              {#if diagnostics}<span><Gauge size={13} /> 缓存 {Math.round(diagnostics.cacheHitRatio * 100)}%</span>{/if}
            </div>
            {#if sending}
              <button class="stop-button" type="button" onclick={cancelMessage} aria-label="停止任务"><CircleStop size={17} /></button>
            {:else}
              <button class="send-button" type="button" onclick={() => void sendMessage()} disabled={!input.trim() || runtimeState !== "ready"} aria-label="发送任务"><Send size={16} /></button>
            {/if}
          </footer>
        </section>
      </div>
    {/if}
  </section>

  {#if mobileSidebarOpen}<button class="sidebar-backdrop" type="button" onclick={() => (mobileSidebarOpen = false)} aria-label="关闭导航"></button>{/if}

  {#if toolsOpen}
    <button class="modal-backdrop" type="button" onclick={() => (toolsOpen = false)} aria-label="关闭工具面板"></button>
    <aside class="inspector" aria-label="可用工具">
      <header><div><span>当前运行时</span><strong>可用工具</strong></div><button type="button" onclick={() => (toolsOpen = false)} aria-label="关闭"><X size={17} /></button></header>
      <div class="inspector__body">
        {#each tools as tool (tool.name)}
          <article>
            <span><TerminalSquare size={15} /></span>
            <div><strong>{tool.name}</strong><p>{tool.description}</p></div>
          </article>
        {:else}
          <div class="empty-list"><Wrench size={18} /><strong>暂未加载工具</strong></div>
        {/each}
      </div>
    </aside>
  {/if}

  {#if settingsOpen}
    <button class="modal-backdrop" type="button" onclick={() => (settingsOpen = false)} aria-label="关闭设置"></button>
    <div class="settings-dialog" role="dialog" aria-modal="true" aria-label="运行设置">
      <header>
        <div><span>DSH Runtime</span><strong>运行设置</strong></div>
        <button type="button" onclick={() => (settingsOpen = false)} aria-label="关闭"><X size={17} /></button>
      </header>
      <div class="settings-dialog__body">
        <section>
          <div class="settings-section-title"><Bot size={16} /><div><strong>模型连接</strong><span>{config?.apiKeySet ? "密钥已配置" : "当前未保存密钥"}</span></div></div>
          <label>模型名称<input bind:value={modelDraft} autocomplete="off" /></label>
          <label>接口地址<input bind:value={baseUrlDraft} autocomplete="url" spellcheck="false" /></label>
          <label>API 密钥<input bind:value={apiKeyDraft} type="password" autocomplete="new-password" placeholder={config?.apiKeySet ? "留空以保留当前密钥" : "免鉴权网关可留空"} /></label>
          {#if config?.apiKeySet}
            <label class="check-row"><input bind:checked={clearApiKey} type="checkbox" /><span>清除当前已保存的密钥</span></label>
          {/if}
        </section>
        <section>
          <div class="settings-section-title"><Gauge size={16} /><div><strong>执行策略</strong><span>应用到后续任务</span></div></div>
          <label class="switch-row"><span><strong>压缩历史推理</strong><em>减少重复上下文占用</em></span><input bind:checked={compactReasoningDraft} type="checkbox" /></label>
          <label class="switch-row"><span><strong>重复输出保护</strong><em>检测退化循环并中止</em></span><input bind:checked={degenerationGuardDraft} type="checkbox" /></label>
        </section>
        <section>
          <div class="settings-section-title"><Folder size={16} /><div><strong>当前工作区</strong><span title={workingDir}>{workingDir}</span></div></div>
          <button class="secondary-action" type="button" onclick={chooseWorkspace} disabled={!electronApi}><FolderOpen size={15} /> 选择工作区</button>
        </section>
        {#if settingsError}<div class="settings-feedback error"><AlertTriangle size={15} /> {settingsError}</div>{/if}
        {#if settingsSuccess}<div class="settings-feedback success"><Check size={15} /> {settingsSuccess}</div>{/if}
      </div>
      <footer>
        <button class="developer-action" type="button" onclick={() => void nativeApi().toggleDevTools()} disabled={!electronApi}><TerminalSquare size={15} /> 开发者工具</button>
        <div><button type="button" onclick={() => (settingsOpen = false)}>取消</button><button class="primary-action" type="button" onclick={saveSettings} disabled={savingSettings || !modelDraft.trim() || !baseUrlDraft.trim()}>{#if savingSettings}<LoaderCircle class="spin" size={15} />{/if}保存并重启</button></div>
      </footer>
    </div>
  {/if}

  {#if clearDialogOpen}
    <button class="modal-backdrop" type="button" onclick={() => (clearDialogOpen = false)} aria-label="取消新建会话"></button>
    <div class="confirm-dialog" role="alertdialog" aria-modal="true" aria-label="新建会话">
      <span><Trash2 size={18} /></span>
      <div><strong>清空当前会话？</strong><p>当前 DSH 运行时只维护一个会话。新建会话会清除现有上下文。</p></div>
      <footer><button type="button" onclick={() => (clearDialogOpen = false)}>取消</button><button class="danger-action" type="button" onclick={clearConversation}>清空并新建</button></footer>
    </div>
  {/if}
</main>

<style>
  :global(html),
  :global(body),
  :global(#app) {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  :global(body) {
    background: #f6f6f5;
  }

  button,
  input,
  textarea {
    letter-spacing: 0;
  }

  button:focus-visible,
  input:focus-visible,
  textarea:focus-visible,
  summary:focus-visible {
    outline: 2px solid color-mix(in srgb, #2d6a4f 58%, transparent);
    outline-offset: 2px;
  }

  .desktop-workbench {
    --titlebar-height: 42px;
    --sidebar-width: 248px;
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    grid-template-rows: var(--titlebar-height) minmax(0, 1fr);
    width: 100%;
    height: 100%;
    color: #20211f;
    background: #f6f6f5;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", sans-serif;
    font-size: 13px;
  }

  .desktop-workbench.sidebar-collapsed {
    --sidebar-width: 64px;
  }

  .titlebar {
    position: relative;
    z-index: 60;
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: minmax(220px, 1fr) minmax(0, auto) minmax(220px, 1fr);
    align-items: center;
    height: var(--titlebar-height);
    border-bottom: 1px solid #e3e3e0;
    background: #f1f1ef;
    -webkit-app-region: drag;
    user-select: none;
  }

  .titlebar__brand,
  .titlebar__context,
  .titlebar__actions {
    display: flex;
    align-items: center;
    min-width: 0;
  }

  .titlebar__brand {
    gap: 8px;
    padding-left: 12px;
  }

  .brand-mark {
    display: grid;
    width: 24px;
    height: 24px;
    flex: 0 0 24px;
    place-items: center;
    border-radius: 6px;
    background: #20211f;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
  }

  .titlebar__brand strong {
    overflow: hidden;
    font-size: 12px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .titlebar__brand > span:last-child,
  .titlebar__context {
    color: #6f6f69;
    font-size: 11px;
  }

  .titlebar__context {
    justify-self: center;
    gap: 6px;
    max-width: 380px;
  }

  .titlebar__context span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .titlebar__actions {
    justify-self: end;
    height: 100%;
    -webkit-app-region: no-drag;
  }

  .titlebar__actions > button {
    display: grid;
    width: 42px;
    height: 100%;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: #5f625d;
  }

  .titlebar__actions > button:hover {
    background: #e7e7e4;
    color: #20211f;
  }

  .titlebar__actions > .close-button:hover {
    background: #c42b1c;
    color: #fff;
  }

  .titlebar__actions > i {
    width: 1px;
    height: 18px;
    margin: 0 2px;
    background: #d7d7d3;
  }

  .titlebar__actions > .runtime-pill {
    display: inline-flex;
    width: auto;
    min-width: 104px;
    gap: 7px;
    padding: 0 10px;
    color: #41614f;
    font-size: 11px;
    font-weight: 600;
  }

  .runtime-pill.error {
    color: #b42318;
  }

  .status-dot {
    width: 7px;
    height: 7px;
    border-radius: 999px;
    background: #2d6a4f;
    box-shadow: 0 0 0 3px rgb(45 106 79 / 0.12);
  }

  .runtime-pill.error .status-dot {
    background: #b42318;
    box-shadow: 0 0 0 3px rgb(180 35 24 / 0.11);
  }

  .sidebar {
    position: relative;
    z-index: 45;
    grid-column: 1;
    grid-row: 2;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-width: 0;
    border-right: 1px solid #e3e3e0;
    background: #f1f1ef;
    overflow: hidden;
  }

  .sidebar__toolbar {
    display: flex;
    gap: 8px;
    padding: 10px 8px 8px;
  }

  .sidebar__toolbar button,
  .mobile-menu {
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    place-items: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: #555953;
  }

  .sidebar__toolbar button:hover,
  .mobile-menu:hover {
    border-color: #deded9;
    background: #fff;
    color: #20211f;
  }

  .sidebar__toolbar .new-conversation {
    display: flex;
    width: auto;
    flex: 1 1 auto;
    justify-content: center;
    gap: 8px;
    border-color: #d7d7d3;
    background: #fff;
    color: #20211f;
    font-size: 12px;
    font-weight: 650;
  }

  .sidebar nav {
    display: grid;
    align-content: start;
    gap: 20px;
    min-height: 0;
    padding: 10px 8px;
    overflow: auto;
  }

  .sidebar nav section {
    display: grid;
    gap: 4px;
  }

  .sidebar__label {
    padding: 0 8px 3px;
    color: #92928c;
    font-size: 10px;
    font-weight: 650;
  }

  .nav-row,
  .sidebar__footer > button {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) 16px;
    align-items: center;
    gap: 8px;
    min-height: 38px;
    padding: 4px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: #5f625d;
    text-align: left;
  }

  .nav-row:hover,
  .sidebar__footer > button:hover {
    background: #e9e9e6;
    color: #20211f;
  }

  .nav-row.active {
    border-color: #deded9;
    background: #fff;
    color: #20211f;
  }

  .nav-row:disabled {
    cursor: default;
    opacity: .55;
  }

  .nav-row > span,
  .sidebar__footer button > span {
    display: grid;
    min-width: 0;
    gap: 1px;
  }

  .nav-row strong,
  .sidebar__footer strong {
    overflow: hidden;
    font-size: 12px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-row em,
  .sidebar__footer em {
    overflow: hidden;
    color: #85857f;
    font-size: 10px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sidebar__footer {
    display: grid;
    gap: 6px;
    padding: 8px;
    border-top: 1px solid #e3e3e0;
  }

  .sidebar__footer > button {
    grid-template-columns: 18px minmax(0, 1fr);
    width: 100%;
  }

  .sidebar__footer small {
    padding: 0 8px 2px;
    color: #92928c;
    font-size: 10px;
  }

  .sidebar-collapsed .sidebar__toolbar .new-conversation {
    flex: 0 0 34px;
  }

  .sidebar-collapsed .sidebar__toolbar .new-conversation span,
  .sidebar-collapsed .sidebar__label,
  .sidebar-collapsed .nav-row > span,
  .sidebar-collapsed .nav-row > :global(svg:last-child),
  .sidebar-collapsed .sidebar__footer button > span,
  .sidebar-collapsed .sidebar__footer small {
    display: none;
  }

  .sidebar-collapsed .nav-row,
  .sidebar-collapsed .sidebar__footer > button {
    grid-template-columns: 18px;
    justify-content: center;
    padding: 4px;
  }

  .workspace {
    position: relative;
    grid-column: 2;
    grid-row: 2;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    min-width: 0;
    min-height: 0;
    background: #fff;
  }

  .mobile-menu {
    display: none;
  }

  .runtime-banner {
    display: grid;
    grid-template-columns: 18px minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 10px;
    margin: 10px 14px 0;
    padding: 10px 12px;
    border: 1px solid #efc7c1;
    border-radius: 6px;
    background: #fdf3f1;
    color: #8e251b;
  }

  .runtime-banner > div {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .runtime-banner strong {
    font-size: 12px;
  }

  .runtime-banner span {
    overflow: hidden;
    font-size: 11px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .runtime-banner button {
    min-height: 28px;
    padding: 0 9px;
    border: 1px solid #e4b9b2;
    border-radius: 5px;
    background: #fff;
    color: #8e251b;
    font-size: 11px;
    font-weight: 600;
  }

  .start-surface {
    grid-row: 2;
    display: grid;
    grid-template-rows: auto auto auto;
    align-content: center;
    justify-items: center;
    gap: 24px;
    min-height: 0;
    padding: 32px clamp(24px, 6vw, 88px) 54px;
    overflow: auto;
  }

  .start-copy {
    display: grid;
    justify-items: center;
    gap: 7px;
    text-align: center;
  }

  .section-kicker {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: #2d6a4f;
    font-size: 11px;
    font-weight: 650;
  }

  .start-copy h1 {
    margin: 0;
    color: #20211f;
    font-size: 24px;
    font-weight: 650;
    line-height: 1.25;
  }

  .start-copy p {
    margin: 0;
    color: #7a7a74;
    font-size: 12px;
  }

  .quick-starts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    width: min(860px, 100%);
    border: 1px solid #e3e3e0;
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
  }

  .quick-starts button {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr) 16px;
    align-items: start;
    gap: 10px;
    min-height: 92px;
    padding: 15px;
    border: 0;
    border-right: 1px solid #e3e3e0;
    background: #fff;
    color: #555953;
    text-align: left;
  }

  .quick-starts button:last-child {
    border-right: 0;
  }

  .quick-starts button:hover {
    background: #f6f7f5;
    color: #2d6a4f;
  }

  .quick-starts button > span {
    display: grid;
    gap: 5px;
    min-width: 0;
  }

  .quick-starts strong {
    color: #20211f;
    font-size: 12px;
    font-weight: 650;
  }

  .quick-starts em {
    display: -webkit-box;
    overflow: hidden;
    color: #7a7a74;
    font-size: 11px;
    font-style: normal;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .composer {
    display: grid;
    width: min(860px, 100%);
    border: 1px solid #cbcfc9;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 10px 28px rgb(32 33 31 / 0.08);
    overflow: hidden;
  }

  .composer:focus-within {
    border-color: #6e9b84;
    box-shadow: 0 0 0 2px rgb(45 106 79 / 0.1), 0 12px 30px rgb(32 33 31 / 0.09);
  }

  .composer textarea {
    width: 100%;
    min-height: 84px;
    max-height: 220px;
    padding: 15px 16px 8px;
    resize: none;
    border: 0;
    outline: 0;
    background: transparent;
    color: #20211f;
    font-size: 13px;
    line-height: 1.55;
  }

  .composer textarea::placeholder {
    color: #969690;
  }

  .composer footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 44px;
    padding: 6px 8px 8px 14px;
  }

  .composer__context {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 12px;
    color: #777a75;
    font-size: 10px;
  }

  .composer__context span {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .send-button,
  .stop-button {
    display: grid;
    width: 34px;
    height: 34px;
    flex: 0 0 34px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 7px;
    background: #20211f;
    color: #fff;
  }

  .send-button:hover {
    background: #2d6a4f;
  }

  .send-button:disabled {
    cursor: default;
    background: #e3e3e0;
    color: #9c9c96;
  }

  .stop-button {
    background: #b42318;
  }

  .conversation-header {
    grid-row: 1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    min-height: 52px;
    padding: 0 18px;
    border-bottom: 1px solid #e8e8e5;
    background: #fff;
  }

  .conversation-header > div {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .conversation-header strong {
    font-size: 13px;
    font-weight: 650;
  }

  .conversation-header span {
    overflow: hidden;
    color: #7a7a74;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .conversation-header button,
  .secondary-action,
  .developer-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid #d7d7d3;
    border-radius: 6px;
    background: #fff;
    color: #454944;
    font-size: 11px;
    font-weight: 600;
  }

  .conversation-header button:hover,
  .secondary-action:hover,
  .developer-action:hover {
    background: #f3f4f2;
    color: #20211f;
  }

  .transcript {
    grid-row: 2;
    min-height: 0;
    padding: 22px 24px 28px;
    overflow: auto;
    overscroll-behavior: contain;
    scrollbar-gutter: stable;
  }

  .transcript__column {
    display: grid;
    width: min(820px, 100%);
    margin: 0 auto;
    gap: 24px;
  }

  .message {
    display: grid;
    gap: 9px;
    min-width: 0;
  }

  .message__label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #777a75;
    font-size: 10px;
    font-weight: 650;
  }

  .message__label > span {
    display: grid;
    width: 22px;
    height: 22px;
    place-items: center;
    border-radius: 6px;
    background: #e8f2ed;
    color: #2d6a4f;
  }

  .message > p,
  .assistant-content,
  .reasoning p {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .message--user {
    justify-items: end;
  }

  .message--user .message__label {
    padding-right: 4px;
  }

  .message--user > p {
    max-width: min(680px, 88%);
    padding: 10px 13px;
    border-radius: 8px 8px 2px 8px;
    background: #f0f1ef;
    color: #20211f;
    line-height: 1.55;
  }

  .message--assistant {
    padding-bottom: 4px;
  }

  .assistant-content {
    color: #2b2d2a;
    font-size: 13px;
    line-height: 1.65;
  }

  .reasoning {
    border-left: 2px solid #d7ddd8;
    padding-left: 11px;
  }

  .reasoning summary {
    color: #6f756f;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .reasoning p {
    margin-top: 7px;
    color: #747974;
    font-size: 12px;
    line-height: 1.55;
  }

  .tool-run {
    border: 1px solid #e0e3df;
    border-radius: 6px;
    background: #fafbfa;
    overflow: hidden;
  }

  .tool-run.failed {
    border-color: #efc7c1;
    background: #fdf7f6;
  }

  .tool-run summary {
    display: grid;
    grid-template-columns: 16px minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    min-height: 34px;
    padding: 0 10px;
    color: #626660;
    cursor: pointer;
    list-style: none;
  }

  .tool-run summary::-webkit-details-marker {
    display: none;
  }

  .tool-run summary strong {
    overflow: hidden;
    color: #383c37;
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 11px;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tool-run summary span {
    color: #858983;
    font-size: 10px;
  }

  .tool-run > div {
    display: grid;
    gap: 5px;
    padding: 10px;
    border-top: 1px solid #e0e3df;
  }

  .tool-run__label {
    color: #858983;
    font-size: 10px;
    font-weight: 600;
  }

  .tool-run pre {
    max-height: 260px;
    margin: 0 0 4px;
    padding: 8px;
    overflow: auto;
    border-radius: 5px;
    background: #f1f2f0;
    color: #3b3f3a;
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 10px;
    line-height: 1.5;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .message-loading,
  .message-error {
    display: flex;
    align-items: center;
    gap: 7px;
    color: #767a75;
    font-size: 11px;
  }

  .message-error {
    color: #b42318;
  }

  .conversation-composer-wrap {
    grid-row: 3;
    padding: 10px 24px 18px;
    border-top: 1px solid #eeeeeb;
    background: #fff;
  }

  .conversation-composer-wrap .composer {
    margin: 0 auto;
  }

  .modal-backdrop,
  .sidebar-backdrop {
    position: fixed;
    z-index: 70;
    inset: 42px 0 0;
    border: 0;
    border-radius: 0;
    background: rgb(20 22 20 / 0.28);
    backdrop-filter: blur(1px);
  }

  .inspector {
    position: fixed;
    z-index: 75;
    top: 42px;
    right: 0;
    bottom: 0;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    width: min(390px, 92vw);
    border-left: 1px solid #d7d7d3;
    background: #fff;
    box-shadow: -12px 0 30px rgb(32 33 31 / 0.09);
  }

  .inspector header,
  .settings-dialog > header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 58px;
    padding: 0 16px;
    border-bottom: 1px solid #e3e3e0;
  }

  .inspector header > div,
  .settings-dialog > header > div {
    display: grid;
    gap: 2px;
  }

  .inspector header span,
  .settings-dialog > header span {
    color: #85857f;
    font-size: 10px;
  }

  .inspector header strong,
  .settings-dialog > header strong {
    font-size: 15px;
    font-weight: 650;
  }

  .inspector header button,
  .settings-dialog > header button {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: #686b66;
  }

  .inspector header button:hover,
  .settings-dialog > header button:hover {
    background: #f0f1ef;
    color: #20211f;
  }

  .inspector__body {
    min-height: 0;
    padding: 8px;
    overflow: auto;
  }

  .inspector__body article {
    display: grid;
    grid-template-columns: 30px minmax(0, 1fr);
    gap: 10px;
    padding: 11px 8px;
    border-bottom: 1px solid #ecece9;
  }

  .inspector__body article > span {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border-radius: 6px;
    background: #eef1ee;
    color: #4f5d54;
  }

  .inspector__body article div {
    min-width: 0;
  }

  .inspector__body article strong {
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 11px;
    font-weight: 650;
  }

  .inspector__body article p {
    margin: 4px 0 0;
    color: #747872;
    font-size: 11px;
    line-height: 1.45;
  }

  .empty-list {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 56px 20px;
    color: #858983;
    font-size: 12px;
  }

  .settings-dialog {
    position: fixed;
    z-index: 80;
    top: 50%;
    left: 50%;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: min(620px, calc(100vw - 48px));
    max-height: min(760px, calc(100vh - 84px));
    transform: translate(-50%, -50%);
    border: 1px solid #d7d7d3;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 24px 64px rgb(22 24 22 / 0.2);
    overflow: hidden;
  }

  .settings-dialog__body {
    display: grid;
    gap: 22px;
    min-height: 0;
    padding: 18px;
    overflow: auto;
  }

  .settings-dialog__body > section {
    display: grid;
    gap: 10px;
  }

  .settings-section-title {
    display: grid;
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 8px;
    align-items: start;
    padding-bottom: 7px;
    border-bottom: 1px solid #e8e8e5;
    color: #4a514b;
  }

  .settings-section-title > div {
    display: grid;
    gap: 2px;
    min-width: 0;
  }

  .settings-section-title strong {
    font-size: 12px;
    font-weight: 650;
  }

  .settings-section-title span {
    overflow: hidden;
    color: #858983;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .settings-dialog label:not(.check-row):not(.switch-row) {
    display: grid;
    gap: 5px;
    color: #61655f;
    font-size: 11px;
    font-weight: 600;
  }

  .settings-dialog label > input:not([type="checkbox"]) {
    width: 100%;
    min-height: 36px;
    padding: 0 10px;
    border: 1px solid #d7d7d3;
    border-radius: 6px;
    background: #fff;
    color: #20211f;
    font-size: 12px;
  }

  .check-row,
  .switch-row {
    display: flex;
    align-items: center;
    gap: 9px;
    min-height: 34px;
    color: #555953;
    font-size: 11px;
  }

  .check-row input,
  .switch-row input {
    width: 16px;
    height: 16px;
    accent-color: #2d6a4f;
  }

  .switch-row {
    justify-content: space-between;
    padding: 6px 0;
    border-bottom: 1px solid #eeeeeb;
  }

  .switch-row > span {
    display: grid;
    gap: 2px;
  }

  .switch-row strong {
    font-size: 11px;
    font-weight: 600;
  }

  .switch-row em {
    color: #858983;
    font-size: 10px;
    font-style: normal;
  }

  .settings-feedback {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 9px 10px;
    border: 1px solid;
    border-radius: 6px;
    font-size: 11px;
  }

  .settings-feedback.error {
    border-color: #efc7c1;
    background: #fdf3f1;
    color: #9b2b20;
  }

  .settings-feedback.success {
    border-color: #bcd7c8;
    background: #edf7f1;
    color: #2d6a4f;
  }

  .settings-dialog > footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-height: 58px;
    padding: 0 16px;
    border-top: 1px solid #e3e3e0;
  }

  .settings-dialog > footer > div {
    display: flex;
    gap: 8px;
  }

  .settings-dialog > footer button,
  .confirm-dialog footer button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid #d7d7d3;
    border-radius: 6px;
    background: #fff;
    color: #454944;
    font-size: 11px;
    font-weight: 650;
  }

  .settings-dialog > footer .primary-action {
    border-color: #20211f;
    background: #20211f;
    color: #fff;
  }

  .settings-dialog > footer .primary-action:hover {
    border-color: #2d6a4f;
    background: #2d6a4f;
  }

  .settings-dialog button:disabled {
    cursor: default;
    opacity: .5;
  }

  .confirm-dialog {
    position: fixed;
    z-index: 85;
    top: 50%;
    left: 50%;
    display: grid;
    grid-template-columns: 38px minmax(0, 1fr);
    gap: 12px;
    width: min(430px, calc(100vw - 40px));
    padding: 18px;
    transform: translate(-50%, -50%);
    border: 1px solid #d7d7d3;
    border-radius: 12px;
    background: #fff;
    box-shadow: 0 24px 64px rgb(22 24 22 / 0.2);
  }

  .confirm-dialog > span {
    display: grid;
    width: 38px;
    height: 38px;
    place-items: center;
    border-radius: 8px;
    background: #fbecea;
    color: #b42318;
  }

  .confirm-dialog > div {
    display: grid;
    gap: 5px;
  }

  .confirm-dialog strong {
    font-size: 14px;
    font-weight: 650;
  }

  .confirm-dialog p {
    margin: 0;
    color: #747872;
    font-size: 11px;
    line-height: 1.5;
  }

  .confirm-dialog footer {
    grid-column: 1 / -1;
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 6px;
  }

  .confirm-dialog footer .danger-action {
    border-color: #b42318;
    background: #b42318;
    color: #fff;
  }

  :global(.spin) {
    animation: spin 850ms linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    :global(.spin) { animation: none; }
  }

  @media (max-width: 900px) {
    .desktop-workbench,
    .desktop-workbench.sidebar-collapsed {
      --sidebar-width: 0px;
      grid-template-columns: 1fr;
    }

    .titlebar {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .titlebar__context,
    .titlebar__actions > .runtime-pill {
      display: none;
    }

    .titlebar__brand > span:last-child {
      display: none;
    }

    .sidebar {
      position: fixed;
      top: 42px;
      bottom: 0;
      left: 0;
      width: min(280px, 86vw);
      transform: translateX(-102%);
      transition: transform 160ms ease;
    }

    .sidebar.mobile-open {
      transform: translateX(0);
    }

    .workspace {
      grid-column: 1;
    }

    .mobile-menu {
      position: absolute;
      z-index: 20;
      top: 9px;
      left: 10px;
      display: grid;
      background: #fff;
      border-color: #deded9;
    }

    .conversation-header {
      padding-left: 54px;
    }

    .sidebar-backdrop {
      display: block;
      z-index: 40;
    }

    .quick-starts {
      grid-template-columns: 1fr;
    }

    .quick-starts button {
      min-height: 76px;
      border-right: 0;
      border-bottom: 1px solid #e3e3e0;
    }

    .quick-starts button:last-child {
      border-bottom: 0;
    }
  }

  @media (max-width: 620px) {
    .titlebar__brand strong {
      max-width: 150px;
    }

    .titlebar__actions > button {
      width: 38px;
    }

    .start-surface {
      align-content: start;
      gap: 18px;
      padding: 58px 14px 22px;
    }

    .start-copy h1 {
      font-size: 20px;
    }

    .composer__context span:nth-child(n + 2) {
      display: none;
    }

    .transcript {
      padding: 18px 14px;
    }

    .conversation-composer-wrap {
      padding: 8px 12px 12px;
    }

    .runtime-banner {
      grid-template-columns: 18px minmax(0, 1fr) auto;
    }

    .runtime-banner button:last-child {
      display: none;
    }

    .settings-dialog {
      width: calc(100vw - 20px);
      max-height: calc(100vh - 62px);
    }

    .settings-dialog > footer {
      align-items: stretch;
      flex-direction: column;
      padding-top: 10px;
      padding-bottom: 10px;
    }

    .settings-dialog > footer > div,
    .settings-dialog > footer button {
      flex: 1 1 auto;
    }
  }
</style>
