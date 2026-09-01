<script lang="ts">
  import { Bot, ClipboardList, LoaderCircle } from "@lucide/svelte";
  import {
    Conversation,
    ConversationParts,
    Message,
    MessageParts,
    Reasoning,
    Response,
    Tool,
  } from "@svadmin/ai-elements";
  import type { ChatMessage } from "@svadmin/core";
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
  }

  let { messages, sending, productName, quickActions, onPromptSelect }: Props = $props();

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
</script>

<Conversation messages={aiMessages} isStreaming={sending} class="conversation-root">
  <ConversationParts.Content class="message-scroll">
    {#if messages.length === 0}
      <div class="empty-state">
        <span class="empty-mark"><Bot size={22} /></span>
        <h2>准备好开始工作</h2>
        <p>官方 DSH 运行时已连接。描述目标，暗涌会在这里呈现计划、工具和结果。</p>
        <div class="quick-actions">
          {#each quickActions as action (action.label)}
            <button type="button" onclick={() => onPromptSelect(action.prompt)}><ClipboardList size={14} />{action.label}</button>
          {/each}
        </div>
      </div>
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
              <Tool
                name={message.tool.name}
                input={message.tool.args || undefined}
                output={message.tool.state === "error" ? undefined : message.tool.result || undefined}
                errorText={message.tool.state === "error" ? message.tool.result || "工具执行失败" : undefined}
                state={toolState(message)}
                open={message.tool.state !== "running"}
              />
            {:else}
              {#if message.reasoning}
                <Reasoning text={message.reasoning} streaming={!!message.pending} title="推理过程" />
              {/if}
              {#if message.role === "user"}
                <div class="message-text">{message.text || "…"}</div>
              {:else}
                <Response content={message.text || "…"} streaming={!!message.pending} />
              {/if}
              {#if message.usage}
                <div class="usage-line">输入 {String(message.usage.inputTokens || "-")} · 输出 {String(message.usage.outputTokens || "-")}</div>
              {/if}
            {/if}
          </MessageParts.Content>
        </Message>
      {/each}
      {#if sending}
        <div class="typing" role="status" aria-atomic="true"><LoaderCircle class="animate-spin" size={14} />DSH 正在执行任务，活动记录会持续更新</div>
      {/if}
    {/if}
  </ConversationParts.Content>
</Conversation>
