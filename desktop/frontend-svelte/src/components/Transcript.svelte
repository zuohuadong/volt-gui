<script lang="ts">
  import { Check, HelpCircle, ShieldAlert, X } from "@lucide/svelte";
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
</script>

<section class="transcript" aria-busy={sending || loading}>
  {#each items as item (item.id)}
    <article class={`message message--${item.role}${item.pending ? " is-pending" : ""}`}>
      <span>{item.title || item.role}</span>
      <p>{item.body}</p>
    </article>
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
