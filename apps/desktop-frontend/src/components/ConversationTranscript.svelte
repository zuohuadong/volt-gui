<script lang="ts">
  import { Bot, ChevronRight, ChevronUp, ClipboardList, Copy, LoaderCircle, MessageSquarePlus, Quote, RotateCcw, ThumbsDown, ThumbsUp } from "@lucide/svelte";
  import ToolCallGroup from "$components/ToolCallGroup.svelte";
  import MessageAttachment from "$components/MessageAttachment.svelte";
  import InlineSurfaceCard from "$components/InlineSurfaceCard.svelte";
  import type { DshClient } from "$lib/dsh-client";
  import { Button } from "$components/ui/button";
  import {
    Conversation,
    ConversationEmptyState,
    ConversationParts,
    ConversationScrollButton,
    InlineCitation,
    InlineCitationCard,
    InlineCitationCardBody,
    InlineCitationCardTrigger,
    InlineCitationSource,
    InlineCitationText,
    Message,
    MessageParts,
    Loader,
    Response,
    Sources,
    Shimmer,
    Suggestion,
    Suggestions,
  } from "@svadmin/ai-elements";
  import { continuationHintIndex, isInternalContinuationPrompt, isVisibleMessageText, isVisibleReasoning, type TranscriptMessage } from "$lib/transcript";
  import { buildQuoteReference, type QuoteRole } from "$lib/quote-reference";
  import { resolveVoltSurfaceSegments } from "$lib/surface-agent";
  import { stripUiCustomizationPayload } from "$lib/ui-customization";
  import { isEmptyAfterStrip, stripInternalProtocol } from "$lib/internal-protocol";
  import { extractBareFileMentions, splitLocalFileLinks } from "$lib/file-links";
  import type { SurfaceInteractionEvent } from "@svadmin/surface";
  import type { SurfaceSpec } from "@svadmin/surface";
  import { buildTranscriptView, transcriptMessageRole } from "$lib/transcript-view";
  import { DEFAULT_TRANSCRIPT_GROUP_WINDOW, windowTranscriptGroups } from "$lib/transcript-window";
  import { t } from "$lib/i18n";

interface QuickAction {
    label: string;
    prompt: string;
  }

  interface Props {
    readonly messages: TranscriptMessage[];
    readonly sending: boolean;
    readonly quickActions: readonly QuickAction[];
    readonly onPromptSelect: (prompt: string) => void;
    readonly onStartSession?: () => void | Promise<void>;
    readonly startSessionLabel?: string;
    readonly historyHasMore?: boolean;
    readonly historyLoading?: boolean;
    readonly onLoadEarlier?: () => void | Promise<void>;
    readonly attachmentFiles?: Record<string, File>;
    readonly sessionId?: string;
    readonly onExportSession?: (sessionId: string) => void | Promise<void>;
    readonly client?: DshClient;
    readonly onSurfaceInteraction?: (event: SurfaceInteractionEvent, spec: SurfaceSpec) => void;
    /** 裸文件名（没有 Markdown 链接）在工作区里定位并打开（#355）。 */
    readonly onOpenBareFile?: (name: string) => void;
    /** 重新生成最后一条回复（#373）；没有可用入口时按钮不出现。 */
    readonly onRegenerate?: () => void;
    /** 选中一段原文后把它引用到输入框（"选择引用"）。 */
    readonly onQuote?: (quote: { text: string; role: QuoteRole; messageId: string }) => void;
    /** 已记录的消息反馈（`messageId -> rating`），来自官方 messageFeedback。 */
    readonly feedback?: Readonly<Record<string, "positive" | "negative">>;
    /** 给一条助手回复打分/撤回；不提供时评分按钮不出现。 */
    readonly onRate?: (messageId: string, rating: "positive" | "negative") => void;
  }

  let {
    messages,
    sending,
    quickActions,
    onPromptSelect,
    onStartSession,
    startSessionLabel = t("transcript.startSession"),
    historyHasMore = false,
    historyLoading = false,
    onLoadEarlier,
    attachmentFiles = {},
    sessionId = "",
    onExportSession,
    client,
    onSurfaceInteraction,
    onOpenBareFile,
    onRegenerate,
    onQuote,
    feedback = {},
    onRate,
  }: Props = $props();
  let latestVisible = $state(true);
  // 消息级操作条（#373）：复制拿走正文，重新生成只在最后一条回复上提供。
  let copiedMessageId = $state("");
  let copyTimer: ReturnType<typeof setTimeout> | undefined;
  async function copyMessage(message: TranscriptMessage): Promise<void> {
    const text = message.displayText ?? message.text ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      copiedMessageId = message.id;
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => { copiedMessageId = ""; }, 1500);
    } catch {
      openFileError = t("transcript.copyFailed");
    }
  }
  let openFileError = $state("");
  let openingFile = $state("");

  function openDeliverable(path: string) {
    if (!client || openingFile) return;
    openFileError = "";
    openingFile = path;
    void client.openPath(path)
      .catch(() => { openFileError = t("transcript.openFileFailed"); })
      .finally(() => { openingFile = ""; });
  }
  let cachedMessages: readonly TranscriptMessage[] | undefined;
  let cachedTranscriptView: ReturnType<typeof buildTranscriptView> | undefined;

  function transcriptViewFor(nextMessages: readonly TranscriptMessage[]) {
    if (nextMessages === cachedMessages && cachedTranscriptView) return cachedTranscriptView;
    cachedTranscriptView = buildTranscriptView(nextMessages, cachedTranscriptView);
    cachedMessages = nextMessages;
    return cachedTranscriptView;
  }

  const transcriptView = $derived(transcriptViewFor(messages));
  const displayMessages = $derived(transcriptView.displayMessages);
  const aiMessages = $derived(transcriptView.aiMessages);
  const displayGroups = $derived(transcriptView.displayGroups);
  let renderGroupWindow = $state(DEFAULT_TRANSCRIPT_GROUP_WINDOW);
  let windowSourceLength = $state(0);

  $effect(() => {
    const total = displayGroups.length;
    if (total !== windowSourceLength) {
      // 会话切换或历史大幅变化时收回窗口；流式追加保持当前展开额度。
      if (total < windowSourceLength || windowSourceLength === 0) {
        renderGroupWindow = DEFAULT_TRANSCRIPT_GROUP_WINDOW;
      }
      windowSourceLength = total;
    }
  });

  const transcriptWindow = $derived(windowTranscriptGroups(displayGroups, renderGroupWindow));
  const visibleGroups = $derived(transcriptWindow.visibleGroups);
  // 连续自动续接只留一条提示，避免一列相同的「已接着上次的进度继续处理。」
  const continuationHints = $derived(continuationHintIndex(transcriptWindow.visibleGroups.flatMap((group) => group.kind === "tools" ? [] : [group.message]), t("activity.continuePrompt")));
  const hiddenGroupCount = $derived(transcriptWindow.hiddenGroupCount);

  function revealEarlierGroups(): void {
    renderGroupWindow = Math.min(
      displayGroups.length,
      renderGroupWindow + DEFAULT_TRANSCRIPT_GROUP_WINDOW,
    );
  }

  // 选区引用：只在选区完全落在同一条消息内时提供按钮，跨消息的选区没有确定来源。
  let quoteCandidate = $state<{ text: string; role: QuoteRole; messageId: string; top: number; left: number } | null>(null);

  function clearQuoteCandidate(): void {
    quoteCandidate = null;
  }

  function updateQuoteCandidate(): void {
    if (!onQuote) return;
    const selection = typeof window === "undefined" ? null : window.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      clearQuoteCandidate();
      return;
    }
    const text = selection.toString();
    if (!text.trim()) {
      clearQuoteCandidate();
      return;
    }
    const range = selection.getRangeAt(0);
    const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer as Element
      : range.startContainer.parentElement;
    const endElement = range.endContainer.nodeType === Node.ELEMENT_NODE
      ? range.endContainer as Element
      : range.endContainer.parentElement;
    const startMessage = startElement?.closest?.("[data-quote-message-id]") as HTMLElement | null;
    const endMessage = endElement?.closest?.("[data-quote-message-id]") as HTMLElement | null;
    if (!startMessage || !endMessage || startMessage !== endMessage) {
      clearQuoteCandidate();
      return;
    }
    const role = (startMessage.dataset.quoteRole || "assistant") as QuoteRole;
    // 手势松手后选区仍可能被浏览器折叠；只在有实际文字时保留按钮。
    const rect = range.getBoundingClientRect();
    const container = startMessage.getBoundingClientRect();
    quoteCandidate = {
      text,
      role,
      messageId: startMessage.dataset.quoteMessageId || "",
      // 按钮贴在选区上方，靠近右边界；超出容器就退回容器右侧。
      top: Math.max(4, rect.top - container.top - 34),
      left: Math.max(4, Math.min(container.width - 96, rect.right - container.left - 72)),
    };
  }

  function applyQuote(): void {
    const candidate = quoteCandidate;
    if (!candidate || !onQuote) return;
    const quote = buildQuoteReference({ text: candidate.text, role: candidate.role, messageId: candidate.messageId });
    clearQuoteCandidate();
    if (!quote.ok) return;
    onQuote({ text: quote.text, role: candidate.role, messageId: candidate.messageId });
    if (typeof window !== "undefined") window.getSelection()?.removeAllRanges();
  }

  function observeLatest(element: HTMLElement): () => void {
    const root = element.parentElement;
    if (!root || typeof IntersectionObserver === "undefined") return () => {};
    const observer = new IntersectionObserver(([entry]) => { latestVisible = entry.isIntersecting; }, { root, threshold: 1 });
    observer.observe(element);
    return () => observer.disconnect();
  }


</script>

<Conversation messages={aiMessages} isStreaming={sending} class="conversation-root">
  <ConversationParts.Content
    class="message-scroll"
    onmouseup={updateQuoteCandidate}
    onkeyup={(event) => { if (event.shiftKey) updateQuoteCandidate(); }}
  >
    {#if historyHasMore}
      <Button variant="ghost" size="sm" class="history-load-earlier" disabled={historyLoading} onclick={() => void onLoadEarlier?.()}>
        {#if historyLoading}<LoaderCircle size={14} class="spin" />{:else}<ChevronUp size={14} />{/if}
        {historyLoading ? t("transcript.loadingEarlier") : t("transcript.loadEarlier")}
      </Button>
    {/if}
    {#if displayMessages.length === 0}
      <ConversationEmptyState title={t("transcript.emptyTitle")} description={t("transcript.emptyDesc")} class="empty-state">
        <span class="empty-watermark" aria-hidden="true"><Bot size={112} strokeWidth={0.7} /></span>
        <span class="empty-mark"><Bot size={20} /></span>
        <h2>{t("transcript.emptyTitle")}</h2>
        <p>{t("transcript.emptyDesc")}</p>
        {#if onStartSession}
          <Button size="sm" onclick={() => void onStartSession?.()}>
            <MessageSquarePlus size={14} />
            {startSessionLabel}
          </Button>
        {/if}
        <Suggestions ariaLabel={t("transcript.quickActions")} class="quick-actions">
          {#each quickActions as action (action.label)}
            <Suggestion suggestion={action.prompt} onclick={onPromptSelect}><ClipboardList size={14} />{action.label}</Suggestion>
          {/each}
        </Suggestions>
      </ConversationEmptyState>
    {:else}
      {#if hiddenGroupCount > 0}
        <Button variant="ghost" size="sm" class="history-load-earlier transcript-reveal-earlier" onclick={revealEarlierGroups}>
          <ChevronUp size={14} />
          {t("transcript.revealEarlier", { count: hiddenGroupCount })}
        </Button>
      {/if}
      {#each visibleGroups as group (group.id)}
        {#if group.kind === "tools"}
          <ToolCallGroup messages={group.messages} {client} {sessionId} />
        {:else}
        {@const message = group.message}
        <Message
          from={transcriptMessageRole(message)}
          class={`transcript-message ${message.role === "tool" ? "tool-message" : ""} ${message.pending ? "pending" : ""}`}
          data-quote-message-id={message.id}
          data-quote-role={message.role}
        >
          {#if onQuote && quoteCandidate?.messageId === message.id}
            <div class="quote-anchor" style={`top:${quoteCandidate.top}px;left:${quoteCandidate.left}px`}>
              <Button
                variant="secondary"
                size="sm"
                title={t("transcript.quoteHint")}
                onmousedown={(event) => event.preventDefault()}
                onclick={applyQuote}
              ><Quote size={12} aria-hidden="true" />{t("transcript.quote")}</Button>
            </div>
          {/if}
          <MessageParts.Content class={message.role === "user" ? "user-content" : message.role === "tool" ? "tool-content" : "assistant-content"}>
            {#if message.pending}<span class="message-status live-label">{t("transcript.waiting")}</span>{/if}
            {#if message.attachments?.length}
              <div class="message-attachments">
                {#each message.attachments as attachment, index (`${sessionId}:${index}:${attachment.attachmentId || attachment.name}`)}
                  <MessageAttachment {attachment} {sessionId} {client} {onExportSession}
                    localFile={attachment.attachmentId ? attachmentFiles[attachment.attachmentId] : undefined} />
                {/each}
              </div>
            {/if}
              {#if isInternalContinuationPrompt(message.displayText ?? message.text, t("activity.continuePrompt"))}
                {@const hint = continuationHints.get(message.id)}
                {#if hint?.lead}
                  <div class="message-system-hint">
                    <span>{hint.count > 1 ? t("transcript.continuedHintRepeat", { count: String(hint.count) }) : t("transcript.continuedHint")}</span>
                    <details class="message-system-hint__details"><summary>{t("transcript.continuedDetails")}</summary><p>{message.displayText ?? message.text}</p></details>
                  </div>
                {/if}
              {:else if message.role === "user"}
                {#if message.displayText ?? message.text}<div class="message-text">{message.displayText ?? message.text}</div>{/if}
              {:else}
                {#if isVisibleReasoning(message.reasoning)}
                  <details class="message-reasoning">
                    <summary><ChevronRight size={14} aria-hidden="true" />{t("transcript.reasoningProcess")}</summary>
                    <div class="message-reasoning__text"><Response content={message.reasoning} streaming={!!message.pending} /></div>
                  </details>
                {/if}
                {@const visiblePayload = stripUiCustomizationPayload(message.text ?? "")}
                {@const internal = stripInternalProtocol(visiblePayload)}
                {#if internal.leaked && isEmptyAfterStrip(internal)}
                  <p class="internal-protocol-notice" role="status">{t("transcript.internalProtocolHidden")}</p>
                {:else if isVisibleMessageText(internal.text)}
                  {@const segments = resolveVoltSurfaceSegments(internal.text, !!message.pending)}
                  {#each segments as segment, index (index)}
                    {#if segment.kind === "text"}
                      {@const deliverable = splitLocalFileLinks(segment.text)}
                      {#if deliverable.text}<Response content={deliverable.text} streaming={!!message.pending && index === segments.length - 1} />{/if}
                      {@const bareFiles = deliverable.links.length === 0 && onOpenBareFile ? extractBareFileMentions(deliverable.text) : []}
                      {#if deliverable.links.length > 0 || bareFiles.length > 0}
                        <div class="message-deliverables">
                          {#each deliverable.links as file (file.path)}<button class="deliverable-chip" title={t("transcript.openFile")} disabled={!client || openingFile === file.path} onclick={() => openDeliverable(file.path)}><ClipboardList size={13} aria-hidden="true" /><span>{file.label}</span><small>{t("transcript.deliverableSaved")}</small></button>{/each}
                          {#each bareFiles as name (name)}<button class="deliverable-chip" title={t("transcript.openFile")} disabled={!client} onclick={() => onOpenBareFile?.(name)}><ClipboardList size={13} aria-hidden="true" /><span>{name}</span><small>{t("transcript.deliverableSaved")}</small></button>{/each}
                        </div>
                        {#if openFileError}<p class="message-deliverables__error" role="status">{openFileError}</p>{/if}
                      {/if}
                    {:else if segment.kind === "proposal"}
                      <InlineSurfaceCard spec={segment.spec} {client} sessionId={sessionId} onInteraction={onSurfaceInteraction} />
                    {:else if segment.kind === "incomplete"}
                      <p class="surface-inline-status" role="status"><LoaderCircle size={14} class="spin" aria-hidden="true" />{t("surface.inlineGenerating")}</p>
                    {:else}
                      <p class="surface-inline-status surface-inline-status--error" role="status">{t("surface.inlineInvalid")}</p>
                    {/if}
                  {/each}
                {/if}
                {#if message.protocolWarning}
                  <p class="protocol-warning" role="status">{t("transcript.unparsedToolMarkup")}</p>
                {/if}
              {/if}
              {#if message.sources?.length}
                <div class="citation-line" aria-label={t("transcript.citationLabel")}>
                  <InlineCitation><InlineCitationText>{t("transcript.citations")}</InlineCitationText></InlineCitation>
                  {#each message.sources as source, index (source.id)}
                    <InlineCitation>
                      <InlineCitationCard>
                        <InlineCitationCardTrigger sources={[source.url || source.title]}>[{index + 1}]</InlineCitationCardTrigger>
                        <InlineCitationCardBody>
                          <InlineCitationSource title={source.title} url={source.url} description={source.description}>
                            {#if source.quote}<blockquote>{source.quote}</blockquote>{/if}
                          </InlineCitationSource>
                        </InlineCitationCardBody>
                      </InlineCitationCard>
                    </InlineCitation>
                  {/each}
                </div>
                <Sources sources={message.sources} title={t("transcript.sources")} />
              {/if}
          </MessageParts.Content>
          {#if !message.pending && !isInternalContinuationPrompt(message.displayText ?? message.text, t("activity.continuePrompt"))}
            <div class="message-actions" role="group" aria-label={t("transcript.messageActions")}>
              <button type="button" title={t("transcript.copyMessage")} aria-label={t("transcript.copyMessage")} onclick={() => void copyMessage(message)}>
                <Copy size={13} aria-hidden="true" />{#if copiedMessageId === message.id}<span class="message-action-label">{t("transcript.copied")}</span>{/if}
              </button>
              {#if message.role === "assistant" && onRate && message.officialMessageId}
                <button
                  type="button"
                  title={t("transcript.ratePositive")}
                  aria-label={t("transcript.ratePositive")}
                  aria-pressed={feedback?.[message.officialMessageId] === "positive"}
                  class:active={feedback?.[message.officialMessageId] === "positive"}
                  onclick={() => onRate?.(message.officialMessageId!, "positive")}
                ><ThumbsUp size={13} aria-hidden="true" /></button>
                <button
                  type="button"
                  title={t("transcript.rateNegative")}
                  aria-label={t("transcript.rateNegative")}
                  aria-pressed={feedback?.[message.officialMessageId] === "negative"}
                  class:active={feedback?.[message.officialMessageId] === "negative"}
                  onclick={() => onRate?.(message.officialMessageId!, "negative")}
                ><ThumbsDown size={13} aria-hidden="true" /></button>
              {/if}
              {#if message.role === "assistant" && onRegenerate && group.id === visibleGroups.at(-1)?.id}
                <button type="button" title={t("transcript.regenerate")} aria-label={t("transcript.regenerate")} disabled={sending} onclick={() => onRegenerate?.()}>
                  <RotateCcw size={13} aria-hidden="true" />
                </button>
              {/if}
            </div>
          {/if}
        </Message>
        {/if}
      {/each}
      {#if sending}
        <div class="typing" role="status" aria-atomic="true"><Loader size={14} label={t("transcript.executingTask")} /><Shimmer as="span" text={t("transcript.executingTask")} /></div>
      {/if}
      <div class="conversation-latest-sentinel" aria-hidden="true" {@attach observeLatest}></div>
    {/if}
  </ConversationParts.Content>
  {#if displayMessages.length > 0 && !latestVisible}<ConversationScrollButton class="conversation-scroll-button" />{/if}
</Conversation>

<style>
  .message-attachments { display: grid; gap: 6px; margin-bottom: 8px; }
  .protocol-warning { color: var(--destructive); font-size: 12px; overflow-wrap: anywhere; }
  .surface-inline-status { display: flex; align-items: center; gap: 6px; margin: 8px 0; color: var(--muted-foreground); font-size: 12px; }
  .surface-inline-status--error { color: var(--destructive); }
  .message-actions { display: flex; align-items: center; gap: 2px; margin-top: 4px; opacity: 0; transition: opacity .12s ease; }
  :global(.transcript-message:hover) .message-actions, :global(.transcript-message:focus-within) .message-actions { opacity: 1; }
  @media (hover: none) { .message-actions { opacity: 1; } }
  .message-actions button { display: inline-flex; align-items: center; gap: 4px; height: 24px; padding: 0 6px; border-radius: 5px; color: var(--muted-foreground); font-size: 11px; }
  .message-actions button:hover:not(:disabled) { background: var(--muted); color: var(--foreground); }
  .message-actions button.active { color: var(--primary); }
  .message-actions button:disabled { opacity: .5; cursor: not-allowed; }
</style>
