<script lang="ts">
  import { Bot, ClipboardList } from "@lucide/svelte";
  import {
    ChainOfThought,
    ChainOfThoughtContent,
    ChainOfThoughtHeader,
    Conversation,
    ConversationEmptyState,
    ConversationDownload,
    ConversationParts,
    ConversationScrollButton,
    Context,
    InlineCitation,
    InlineCitationCard,
    InlineCitationCardBody,
    InlineCitationCardTrigger,
    InlineCitationSource,
    InlineCitationText,
    Message,
    MessageParts,
    Loader,
    Reasoning,
    Response,
    Sources,
    StackTrace,
    Shimmer,
    Suggestion,
    Suggestions,
    TokensWithCost,
    Tool,
  } from "@svadmin/ai-elements";
  import StructuredToolResult from "$components/StructuredToolResult.svelte";
import type { ChatMessage } from "@svadmin/core";
import { hasStructuredToolOutput, toolErrorTrace, toolPresentation } from "$lib/ai-elements-adapter";
import type { TranscriptMessage } from "$lib/transcript";
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
    readonly selectedModel?: string;
    readonly contextWindow?: number;
  }

  let { messages, sending, productName, quickActions, onPromptSelect, selectedModel, contextWindow }: Props = $props();
  let latestVisible = $state(true);

  const aiMessages = $derived(messages.map(toAiMessage));

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

  function toolState(message: TranscriptMessage): "input-available" | "output-available" | "output-error" {
    if (message.tool?.state === "error") return "output-error";
    if (message.tool?.state === "success") return "output-available";
    return "input-available";
  }

  function usageNumber(usage: Record<string, unknown> | undefined, ...keys: string[]): number | undefined {
    for (const key of keys) {
      const value = Number(usage?.[key]);
      if (Number.isFinite(value)) return value;
    }
    return undefined;
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
  {#if messages.length > 0}
    <div class="conversation-controls">
      <ConversationDownload messages={aiMessages} filename={`${productName}-conversation.md`} title={t("transcript.download")} />
    </div>
  {/if}
  <ConversationParts.Content class="message-scroll">
    {#if messages.length === 0}
      <ConversationEmptyState title={t("transcript.emptyTitle")} description={t("transcript.emptyDesc")} class="empty-state">
        <span class="empty-mark"><Bot size={22} /></span>
        <Suggestions ariaLabel={t("transcript.quickActions")} class="quick-actions">
          {#each quickActions as action (action.label)}
            <Suggestion suggestion={action.prompt} onclick={onPromptSelect}><ClipboardList size={14} />{action.label}</Suggestion>
          {/each}
        </Suggestions>
      </ConversationEmptyState>
    {:else}
      {#each messages as message (message.id)}
        <Message
          from={messageRole(message)}
          class={`transcript-message ${message.role === "tool" ? "tool-message" : ""} ${message.pending ? "pending" : ""}`}
        >
          <MessageParts.Content class={message.role === "user" ? "user-content" : message.role === "tool" ? "tool-content" : "assistant-content"}>
            <div class="message-meta">
              <span>{message.role === "user" ? t("common.you") : message.role === "tool" ? (message.tool?.name || t("common.tool")) : productName}</span>
              {#if message.seq}<time>#{message.seq}</time>{/if}
              {#if message.pending}<span class="live-label">{t("transcript.waiting")}</span>{/if}
            </div>
            {#if message.role === "tool" && message.tool}
              {@const presentation = toolPresentation(message.tool)}
              {@const structuredOutput = hasStructuredToolOutput(presentation)}
              {@const errorTrace = toolErrorTrace(message.tool)}
              <Tool
                name={message.tool.name}
                input={message.tool.args || undefined}
                output={structuredOutput && presentation.web?.kind !== "fetch" ? undefined : message.tool.result || undefined}
                errorText={message.tool.state === "error" ? message.tool.result || t("transcript.toolFailed") : undefined}
                state={toolState(message)}
                open={message.tool.state !== "running"}
              />
              {#if message.tool.state !== "error" && (message.tool.result || message.tool.view)}
                <StructuredToolResult tool={message.tool} />
              {/if}
              {#if errorTrace}<StackTrace trace={errorTrace} title={t("transcript.errorTrace")} />{/if}
            {:else}
              {#if message.reasoning}
                <ChainOfThought defaultOpen={!!message.pending} class="message-reasoning">
                  <ChainOfThoughtHeader>{t("transcript.reasoningProcess")}</ChainOfThoughtHeader>
                  <ChainOfThoughtContent>
                    <Reasoning text={message.reasoning} streaming={!!message.pending} title={t("transcript.reasoningProcess")} />
                  </ChainOfThoughtContent>
                </ChainOfThought>
              {/if}
              {#if message.role === "user"}
                <div class="message-text">{message.text || "…"}</div>
              {:else}
                <Response content={message.text || "…"} streaming={!!message.pending} />
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
              {#if message.usage}
                {@const inputTokens = usageNumber(message.usage, "inputTokens", "input_tokens")}
                {@const outputTokens = usageNumber(message.usage, "outputTokens", "output_tokens")}
                {@const cachedTokens = usageNumber(message.usage, "cachedInputTokens", "cached_tokens")}
                {@const totalTokens = usageNumber(message.usage, "totalTokens", "total_tokens") ?? (inputTokens || 0) + (outputTokens || 0)}
                <Context
                  usedTokens={totalTokens}
                  maxTokens={contextWindow}
                  {inputTokens}
                  {outputTokens}
                  {cachedTokens}
                  modelId={selectedModel}
                  label={t("transcript.contextUsage")}
                  class="message-context"
                />
                <div class="usage-line">{t("transcript.turnUsage")} <TokensWithCost tokens={totalTokens} /> · {t("transcript.inputUsage")} <TokensWithCost tokens={inputTokens} /> · {t("transcript.outputUsage")} <TokensWithCost tokens={outputTokens} /></div>
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
  {#if messages.length > 0 && !latestVisible}<ConversationScrollButton class="conversation-scroll-button" />{/if}
</Conversation>
