<script lang="ts">
  import { Bot, ChevronRight, ChevronUp, ClipboardList, LoaderCircle, MessageSquarePlus } from "@lucide/svelte";
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
  import { isVisibleMessageText, isVisibleReasoning, type TranscriptMessage } from "$lib/transcript";
  import { resolveVoltSurfaceSegments } from "$lib/surface-agent";
  import type { SurfaceInteractionEvent } from "@svadmin/surface";
  import type { SurfaceSpec } from "@svadmin/surface";
  import { buildTranscriptView, transcriptMessageRole } from "$lib/transcript-view";
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
  }: Props = $props();
  let latestVisible = $state(true);
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

  function observeLatest(element: HTMLElement): () => void {
    const root = element.parentElement;
    if (!root || typeof IntersectionObserver === "undefined") return () => {};
    const observer = new IntersectionObserver(([entry]) => { latestVisible = entry.isIntersecting; }, { root, threshold: 1 });
    observer.observe(element);
    return () => observer.disconnect();
  }


</script>

<Conversation messages={aiMessages} isStreaming={sending} class="conversation-root">
  <ConversationParts.Content class="message-scroll">
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
      {#each displayGroups as group (group.id)}
        {#if group.kind === "tools"}
          <ToolCallGroup messages={group.messages} {client} {sessionId} />
        {:else}
        {@const message = group.message}
        <Message
          from={transcriptMessageRole(message)}
          class={`transcript-message ${message.role === "tool" ? "tool-message" : ""} ${message.pending ? "pending" : ""}`}
        >
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
              {#if message.role === "user"}
                {#if message.displayText ?? message.text}<div class="message-text">{message.displayText ?? message.text}</div>{/if}
              {:else}
                {#if isVisibleReasoning(message.reasoning)}
                  <details class="message-reasoning">
                    <summary><ChevronRight size={14} aria-hidden="true" />{t("transcript.reasoningProcess")}</summary>
                    <div class="message-reasoning__text"><Response content={message.reasoning} streaming={!!message.pending} /></div>
                  </details>
                {/if}
                {#if isVisibleMessageText(message.text)}
                  {@const segments = resolveVoltSurfaceSegments(message.text, !!message.pending)}
                  {#each segments as segment, index (index)}
                    {#if segment.kind === "text"}
                      <Response content={segment.text} streaming={!!message.pending && index === segments.length - 1} />
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
</style>
