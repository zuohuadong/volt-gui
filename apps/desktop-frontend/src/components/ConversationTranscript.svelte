<script lang="ts">
  import { Bot, ClipboardList, LoaderCircle } from "@lucide/svelte";
  import {
    ChainOfThought,
    ChainOfThoughtContent,
    ChainOfThoughtHeader,
    Conversation,
    ConversationEmptyState,
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
    Reasoning,
    Response,
    Sources,
    TokensWithCost,
    Tool,
  } from "@svadmin/ai-elements";
  import StructuredToolResult from "$components/StructuredToolResult.svelte";
  import type { ChatMessage } from "@svadmin/core";
  import { hasStructuredToolOutput, toolPresentation } from "$lib/ai-elements-adapter";
  import type { TranscriptMessage } from "$lib/transcript";

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

  function toAiMessage(message: TranscriptMessage): ChatMessage {
    return {
      id: message.id,
      role: message.role === "user" ? "user" : message.role === "system" ? "system" : "assistant",
      content: message.text,
      timestamp: message.seq ?? 0,
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
  <ConversationParts.Content class="message-scroll">
    {#if messages.length === 0}
      <ConversationEmptyState title="准备好开始工作" description="官方 DSH 运行时已连接。描述目标，暗涌会在这里呈现计划、工具和结果。" class="empty-state">
        <span class="empty-mark"><Bot size={22} /></span>
        <div class="quick-actions">
          {#each quickActions as action (action.label)}
            <button type="button" onclick={() => onPromptSelect(action.prompt)}><ClipboardList size={14} />{action.label}</button>
          {/each}
        </div>
      </ConversationEmptyState>
    {:else}
      {#each messages as message (message.id)}
        <Message
          message={toAiMessage(message)}
          class={`transcript-message ${message.role === "tool" ? "tool-message" : ""} ${message.pending ? "pending" : ""}`}
        >
          <MessageParts.Content class={message.role === "user" ? "user-content" : message.role === "tool" ? "tool-content" : "assistant-content"}>
            <div class="message-meta">
              <span>{message.role === "user" ? "你" : message.role === "tool" ? (message.tool?.name || "工具") : productName}</span>
              {#if message.seq}<time>#{message.seq}</time>{/if}
              {#if message.pending}<span class="live-label">等待处理</span>{/if}
            </div>
            {#if message.role === "tool" && message.tool}
              {@const presentation = toolPresentation(message.tool)}
              {@const structuredOutput = hasStructuredToolOutput(presentation)}
              <Tool
                name={message.tool.name}
                input={message.tool.args || undefined}
                output={structuredOutput ? undefined : message.tool.result || undefined}
                errorText={message.tool.state === "error" ? message.tool.result || "工具执行失败" : undefined}
                state={toolState(message)}
                open={message.tool.state !== "running"}
              />
              {#if message.tool.state !== "error" && (message.tool.result || message.tool.view)}
                <StructuredToolResult tool={message.tool} />
              {/if}
            {:else}
              {#if message.reasoning}
                <ChainOfThought defaultOpen={!!message.pending} class="message-reasoning">
                  <ChainOfThoughtHeader>推理过程</ChainOfThoughtHeader>
                  <ChainOfThoughtContent>
                    <Reasoning text={message.reasoning} streaming={!!message.pending} title="推理过程" />
                  </ChainOfThoughtContent>
                </ChainOfThought>
              {/if}
              {#if message.role === "user"}
                <div class="message-text">{message.text || "…"}</div>
              {:else}
                <Response content={message.text || "…"} streaming={!!message.pending} />
              {/if}
              {#if message.sources?.length}
                <div class="citation-line" aria-label="消息引用">
                  <InlineCitation><InlineCitationText>参考</InlineCitationText></InlineCitation>
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
                <Sources sources={message.sources} title="来源" />
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
                  label="上下文用量"
                  class="message-context"
                />
                <div class="usage-line">本轮 <TokensWithCost tokens={totalTokens} /> · 输入 <TokensWithCost tokens={inputTokens} /> · 输出 <TokensWithCost tokens={outputTokens} /></div>
              {/if}
            {/if}
          </MessageParts.Content>
        </Message>
      {/each}
      {#if sending}
        <div class="typing" role="status" aria-atomic="true"><LoaderCircle class="animate-spin" size={14} />DSH 正在执行任务，活动记录会持续更新</div>
      {/if}
      <div class="conversation-latest-sentinel" aria-hidden="true" {@attach observeLatest}></div>
    {/if}
  </ConversationParts.Content>
  {#if messages.length > 0 && !latestVisible}<ConversationScrollButton class="conversation-scroll-button" />{/if}
</Conversation>
