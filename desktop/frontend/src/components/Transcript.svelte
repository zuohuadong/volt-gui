<script lang="ts">
  import { Check, HelpCircle, ShieldAlert, X } from "@lucide/svelte";
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
</script>

<section class="transcript" aria-busy={sending || loading}>
  {#each items as item (item.id)}
    {#if !(item.role === "tool" && item.parentId)}
      <article class={`message message--${item.role}${item.pending ? " is-pending" : ""}`} data-tool-id={item.role === "tool" ? item.id : undefined}>
        <span>{item.title || item.role}</span>
        <MarkdownView text={item.body} />
        {#if item.role === "tool" && subcallsByParent.get(item.id)?.length}
          <div class="tool-subcalls" aria-label={`Subcalls for ${item.title || item.id}`}>
            {#each subcallsByParent.get(item.id) ?? [] as child (child.id)}
              <article class={`message message--tool message--subtool${child.pending ? " is-pending" : ""}`} data-parent-tool-id={item.id}>
                <span>{child.title || "tool"}</span>
                <MarkdownView text={child.body} />
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
    <article class="decision-shelf">
      <div>
        <HelpCircle size={18} />
        <strong>{question.header || "Question"}</strong>
        <span>{question.prompt}</span>
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
        <button type="button" disabled={!selectedAnswer} onclick={() => onAnswerAsk(askAnswer)}>Submit answer</button>
        <button type="button" onclick={onDismissAsk}>Dismiss</button>
      </div>
    </article>
  {/if}
</section>
