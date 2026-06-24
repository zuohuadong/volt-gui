<script lang="ts">
  import { onMount } from "svelte";
  import { Check, HelpCircle, LoaderCircle, ShieldAlert, X } from "@lucide/svelte";
  import MarkdownView from "./MarkdownView.svelte";
  import type { QuestionAnswer, TranscriptItem, WireApproval, WireAsk } from "../lib/types";

  let {
    items,
    loading,
    sending,
    approval,
    ask,
    onApprove,
    onAnswerAsk,
    onDismissAsk,
  }: {
    items: TranscriptItem[];
    loading: boolean;
    sending: boolean;
    approval?: WireApproval;
    ask?: WireAsk;
    onApprove: (allow: boolean, session: boolean, persist: boolean) => void;
    onAnswerAsk: (answers: QuestionAnswer[]) => void;
    onDismissAsk: () => void;
  } = $props();

  let selectedAnswer = $state("");
  let selectedAskId = $state("");
  let nowMs = $state(Date.now());

  const question = $derived(ask?.questions[0]);
  const askAnswer = $derived(question ? [{ questionId: question.id, selected: selectedAnswer ? [selectedAnswer] : [] }] : []);
  const subcallsByParent = $derived.by(() => {
    const grouped = new Map<string, TranscriptItem[]>();
    for (const item of items) {
      if (item.role !== "tool" || !item.parentId) continue;
      const children = grouped.get(item.parentId) ?? [];
      children.push(item);
      grouped.set(item.parentId, children);
    }
    return grouped;
  });
  const visibleItems = $derived(
    items.filter((item) => item.role !== "system" && (item.title ?? "").toLowerCase() !== "usage" && !item.id.startsWith("usage-")),
  );

  $effect(() => {
    if ((ask?.id ?? "") !== selectedAskId) {
      selectedAskId = ask?.id ?? "";
      selectedAnswer = "";
    }
  });

  onMount(() => {
    const timer = window.setInterval(() => {
      nowMs = Date.now();
    }, 1000);
    return () => window.clearInterval(timer);
  });

  function isRawAskPayload(item: TranscriptItem) {
    if ((item.title ?? "").toLowerCase() !== "ask") return false;
    try {
      const parsed = JSON.parse(item.body);
      return Array.isArray(parsed?.questions);
    } catch {
      return false;
    }
  }

  function pendingLabel(item: TranscriptItem) {
    if (item.role === "tool") return "正在执行工具";
    if (item.role === "reasoning") return "正在整理思路";
    return "正在思考";
  }

  function pendingElapsedMs(item: TranscriptItem) {
    return Math.max(0, nowMs - (item.createdAtMs ?? nowMs));
  }

  function pendingElapsedLabel(item: TranscriptItem) {
    const seconds = Math.floor(pendingElapsedMs(item) / 1000);
    if (seconds < 60) return `已等待 ${Math.max(1, seconds)} 秒`;
    return `已等待 ${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒`;
  }

  function isLikelyStalled(item: TranscriptItem) {
    return pendingElapsedMs(item) >= 120000;
  }
</script>

<section class="transcript" aria-busy={sending || loading}>
  {#each visibleItems as item (item.id)}
    {#if !(item.role === "tool" && item.parentId) && !isRawAskPayload(item)}
      <article class={`message message--${item.role}${item.pending ? " is-pending" : ""}`} data-tool-id={item.role === "tool" ? item.id : undefined}>
        {#if item.pending && !item.body.trim()}
          <div class="pending-status" role="status" aria-live="polite">
            <LoaderCircle size={15} />
            <strong>{pendingLabel(item)}</strong>
            <em>{pendingElapsedLabel(item)} · {isLikelyStalled(item) ? "可能卡住了，可点击停止后重试" : "结果会自动显示"}</em>
          </div>
        {:else}
          <MarkdownView text={item.body} />
        {/if}
        {#if item.role === "tool" && subcallsByParent.get(item.id)?.length}
          <div class="tool-subcalls" aria-label={`Subcalls for ${item.title || item.id}`}>
            {#each subcallsByParent.get(item.id) ?? [] as child (child.id)}
              <article class={`message message--tool message--subtool${child.pending ? " is-pending" : ""}`} data-parent-tool-id={item.id}>
                {#if child.pending && !child.body.trim()}
                  <div class="pending-status pending-status--compact" role="status" aria-live="polite">
                    <LoaderCircle size={14} />
                    <strong>{pendingLabel(child)}</strong>
                  </div>
                {:else}
                  <MarkdownView text={child.body} />
                {/if}
              </article>
            {/each}
          </div>
        {/if}
      </article>
    {/if}
  {/each}

  {#if approval}
    <article class="decision-shelf">
      <div>
        <ShieldAlert size={18} />
        <strong>{approval.tool === "exit_plan_mode" ? "Plan approval" : "Tool approval"}</strong>
        <span>{approval.tool}</span>
      </div>
      {#if approval.subject}
        <pre>{approval.subject}</pre>
      {/if}
      <div class="decision-actions">
        <button type="button" onclick={() => onApprove(true, false, false)}><Check size={14} /> Allow once</button>
        <button type="button" onclick={() => onApprove(true, true, false)}>Allow session</button>
        <button type="button" onclick={() => onApprove(true, true, true)}>Persist</button>
        <button type="button" onclick={() => onApprove(false, false, false)}><X size={14} /> Deny</button>
      </div>
    </article>
  {/if}

  {#if ask && question}
    <article class="decision-shelf decision-shelf--ask">
      <div class="decision-shelf__head">
        <span class="decision-shelf__icon"><HelpCircle size={18} /></span>
        <div>
          <strong>{question.header || "需要确认"}</strong>
          <span>{question.prompt}</span>
        </div>
      </div>
      <div class="answer-grid">
        {#each question.options as option (option.label)}
          <button class={selectedAnswer === option.label ? "is-active" : ""} type="button" onclick={() => (selectedAnswer = option.label)}>
            <strong>{option.label}</strong>
            {#if option.description}<span>{option.description}</span>{/if}
          </button>
        {/each}
      </div>
      <div class="decision-actions">
        <button type="button" disabled={!selectedAnswer} onclick={() => onAnswerAsk(askAnswer)}>提交选择</button>
        <button type="button" onclick={onDismissAsk}>稍后处理</button>
      </div>
    </article>
  {/if}
</section>

<style>
  .transcript {
    display: flex;
    flex-direction: column;
    gap: 16px;
    width: min(100%, 1080px);
    margin: 0 auto;
  }

  .message,
  .decision-shelf {
    max-width: min(100%, 1080px);
    border: 1px solid #e7e9ee;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
  }

  .message {
    padding: 18px 20px;
  }

  .message--user {
    align-self: flex-end;
    max-width: min(640px, 78%);
    padding: 12px 16px;
    background: #f7f7f8;
  }

  .message--system,
  .message--notice,
  .message--reasoning,
  .message--tool {
    background: #f8fafc;
  }

  .message.is-pending {
    border-color: #dfe5f2;
    background: #fbfcff;
  }

  .pending-status {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    color: #334155;
    font-size: 14px;
    line-height: 1.4;
  }

  .pending-status :global(svg) {
    flex: 0 0 auto;
    color: #5b7ee5;
    animation: pending-spin 1s linear infinite;
  }

  .pending-status strong {
    font-weight: 500;
  }

  .pending-status em {
    color: #8b8f98;
    font-size: 13px;
    font-style: normal;
  }

  .pending-status--compact {
    font-size: 13px;
  }

  @keyframes pending-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .decision-shelf {
    display: grid;
    gap: 14px;
    padding: 18px 20px;
  }

  .decision-shelf--ask {
    border-color: #ead7bd;
    background: #fff9f0;
  }

  .decision-shelf__head,
  .decision-shelf > div:first-child {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
  }

  .decision-shelf__icon,
  .decision-shelf > div:first-child > :global(svg) {
    flex: 0 0 auto;
    color: #333333;
    margin-top: 1px;
  }

  .decision-shelf__head strong,
  .decision-shelf > div:first-child strong {
    display: inline;
    color: #1f2937;
    font-size: 14px;
    font-weight: 650;
  }

  .decision-shelf__head div > span,
  .decision-shelf > div:first-child > span {
    display: inline;
    margin-left: 8px;
    color: #475467;
    font-size: 13px;
    line-height: 1.55;
  }

  .answer-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
    gap: 10px;
  }

  .answer-grid button {
    display: grid;
    gap: 8px;
    min-height: 88px;
    padding: 14px 16px;
    border: 1px solid #e2e5ec;
    border-radius: 10px;
    background: #ffffff;
    color: #1f2937;
    text-align: left;
    box-shadow: none;
  }

  .answer-grid button:hover {
    border-color: #c9ced8;
    background: #fbfcfe;
  }

  .answer-grid button.is-active {
    border-color: #222222;
    background: #f4f4f5;
    box-shadow: 0 0 0 2px rgba(34, 34, 34, 0.08);
  }

  .answer-grid strong {
    font-size: 14px;
    font-weight: 650;
  }

  .answer-grid span {
    color: #586174;
    font-size: 13px;
    line-height: 1.5;
  }

  .decision-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .decision-actions button {
    min-height: 34px;
    padding: 0 14px;
    border: 1px solid #d8dbe2;
    border-radius: 9px;
    background: #ffffff;
    color: #344054;
    font-size: 13px;
    font-weight: 500;
  }

  .decision-actions button:first-child {
    border-color: #222222;
    background: #222222;
    color: #ffffff;
  }

  .decision-actions button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .decision-shelf pre {
    max-height: 180px;
    overflow: auto;
    margin: 0;
    padding: 12px;
    border-radius: 10px;
    background: #f8fafc;
    color: #475467;
    font-size: 12px;
    white-space: pre-wrap;
  }

  .tool-subcalls {
    display: grid;
    gap: 8px;
    margin-top: 10px;
  }

  .message--subtool {
    padding: 12px;
  }

  @media (max-width: 720px) {
    .message--user {
      max-width: 92%;
    }

    .answer-grid {
      grid-template-columns: 1fr;
    }

    .decision-actions {
      justify-content: stretch;
    }

    .decision-actions button {
      flex: 1 1 0;
    }
  }
</style>
