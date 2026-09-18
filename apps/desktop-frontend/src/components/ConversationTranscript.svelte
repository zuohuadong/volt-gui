<script lang="ts">
  import { Bot, Check, ChevronRight, CircleAlert, ClipboardList, LoaderCircle } from "@lucide/svelte";
  import {
    Conversation,
    ConversationEmptyState,
    ConversationDownload,
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
    StackTrace,
    Shimmer,
    Suggestion,
    Suggestions,
  } from "@svadmin/ai-elements";
  import StructuredToolResult from "$components/StructuredToolResult.svelte";
import type { ChatMessage } from "@svadmin/core";
import { hasStructuredToolOutput, toolDisplay, toolErrorSummary, toolErrorTrace, toolPresentation, toolResultSummary } from "$lib/ai-elements-adapter";
import { hasMessageContent, isVisibleMessageText, type TranscriptMessage } from "$lib/transcript";
import { t } from "$lib/i18n";

interface QuickAction {
    label: string;
    prompt: string;
  }

  interface Props {
    readonly messages: TranscriptMessage[];
    readonly sending: boolean;
    readonly productName: string;
    readonly quickActions: readonly QuickAction[];
    readonly onPromptSelect: (prompt: string) => void;
  }

  let { messages, sending, productName, quickActions, onPromptSelect }: Props = $props();
  let latestVisible = $state(true);

  const displayMessages = $derived(messages.filter(hasMessageContent));
  const aiMessages = $derived(displayMessages.map(toAiMessage));

  function messageRole(message: TranscriptMessage): ChatMessage["role"] {
    if (message.role === "user") return "user";
    if (message.role === "system") return "system";
    return "assistant";
  }

  function toAiMessage(message: TranscriptMessage): ChatMessage {
    return {
      id: message.id,
      role: messageRole(message),
      parts: [{ type: "text", text: message.text }],
      status: message.pending ? "streaming" : "complete",
      createdAt: message.seq ?? 0,
    };
  }

  function observeLatest(element: HTMLElement): () => void {
    const root = element.parentElement;
    if (!root || typeof IntersectionObserver === "undefined") return () => {};
    const observer = new IntersectionObserver(([entry]) => { latestVisible = entry.isIntersecting; }, { root, threshold: 1 });
    observer.observe(element);
    return () => observer.disconnect();
  }

  function toolStateLabel(state: "running" | "success" | "error"): string {
    if (state === "running") return t("transcript.toolStateRunning");
    if (state === "success") return t("transcript.toolStateSuccess");
    return t("transcript.toolStateError");
  }
</script>

<Conversation messages={aiMessages} isStreaming={sending} class="conversation-root">
  {#if displayMessages.length > 0}
    <div class="conversation-controls">
      <ConversationDownload messages={aiMessages} filename={`${productName}-conversation.md`} title={t("transcript.download")} />
    </div>
  {/if}
  <ConversationParts.Content class="message-scroll">
    {#if displayMessages.length === 0}
      <ConversationEmptyState title={t("transcript.emptyTitle")} description={t("transcript.emptyDesc")} class="empty-state">
        <span class="empty-mark"><Bot size={22} /></span>
        <Suggestions ariaLabel={t("transcript.quickActions")} class="quick-actions">
          {#each quickActions as action (action.label)}
            <Suggestion suggestion={action.prompt} onclick={onPromptSelect}><ClipboardList size={14} />{action.label}</Suggestion>
          {/each}
        </Suggestions>
      </ConversationEmptyState>
    {:else}
      {#each displayMessages as message (message.id)}
        <Message
          from={messageRole(message)}
          class={`transcript-message ${message.role === "tool" ? "tool-message" : ""} ${message.pending ? "pending" : ""}`}
        >
          <MessageParts.Content class={message.role === "user" ? "user-content" : message.role === "tool" ? "tool-content" : "assistant-content"}>
            {#if message.pending}<span class="message-status live-label">{t("transcript.waiting")}</span>{/if}
            {#if message.role === "tool" && message.tool}
              {@const display = toolDisplay(message.tool)}
              {@const presentation = toolPresentation(message.tool)}
              {@const structuredOutput = hasStructuredToolOutput(presentation)}
              {@const errorTrace = toolErrorTrace(message.tool)}
              <details class="user-tool-card" open={message.tool.state === "error"}>
                <summary>
                  <span class="user-tool-card__icon" aria-hidden="true">
                    {#if message.tool.state === "running"}<LoaderCircle size={14} class="spin" />{:else if message.tool.state === "error"}<CircleAlert size={14} />{:else}<Check size={14} />{/if}
                  </span>
                  <span class="user-tool-card__copy">
                    <span class="user-tool-card__label">{display.label}</span>
                    {#if display.detail}<span class="user-tool-card__detail">{display.detail}</span>{/if}
                  </span>
                  <span class:user-tool-card__error={message.tool.state === "error"} class="user-tool-card__state">{toolStateLabel(message.tool.state)}</span>
                  <ChevronRight size={13} class="user-tool-card__chevron" aria-hidden="true" />
                </summary>
                {#if message.tool.state === "error"}
                  <p>{toolErrorSummary(message.tool.result)}</p>
                {:else if !structuredOutput && message.tool.result}
                  <p>{toolResultSummary(message.tool.result)}</p>
                {/if}
                {#if message.tool.state !== "error" && (message.tool.result || message.tool.view)}
                  <StructuredToolResult tool={message.tool} />
                {/if}
                {#if errorTrace}<StackTrace trace={errorTrace} title={t("transcript.errorTrace")} />{/if}
              </details>
            {:else}
              {#if message.role === "user"}
                <div class="message-text">{message.text || "…"}</div>
              {:else}
                <Response content={isVisibleMessageText(message.text) ? message.text : "…"} streaming={!!message.pending} />
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
            {/if}
          </MessageParts.Content>
        </Message>
      {/each}
      {#if sending}
        <div class="typing" role="status" aria-atomic="true"><Loader size={14} label={t("transcript.executingTask")} /><Shimmer as="span" text={t("transcript.executingTask")} /></div>
      {/if}
      <div class="conversation-latest-sentinel" aria-hidden="true" {@attach observeLatest}></div>
    {/if}
  </ConversationParts.Content>
  {#if displayMessages.length > 0 && !latestVisible}<ConversationScrollButton class="conversation-scroll-button" />{/if}
</Conversation>
