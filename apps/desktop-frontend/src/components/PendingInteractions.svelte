<script lang="ts">
  import { CircleAlert, Send } from "@lucide/svelte";
  import { Confirmation } from "@svadmin/ai-elements";
  import { Button } from "$components/ui/button";
  import QuestionField from "$components/QuestionField.svelte";
import { questionsAnswered } from "$lib/ai-elements-adapter";
import type { PendingApproval, PendingQuestion } from "$lib/dsh-client";
import { t } from "$lib/i18n";

type Props = {
    approval?: PendingApproval;
    question?: PendingQuestion;
    answers: Record<string, string>;
    onAnswer: (id: string, value: string, custom?: boolean) => void;
    busy?: boolean;
    onApproval: (outcome: "allowed-once" | "rejected") => void | Promise<void>;
    onQuestion: () => void | Promise<void>;
  };
  let { approval, question, answers, busy = false, onAnswer, onApproval, onQuestion }: Props = $props();
  const questionComplete = $derived(question ? questionsAnswered(question.questions, answers) : false);
</script>

{#if approval}
  {#key approval.rpcId}
  <Confirmation
    title={t("interactions.approvalTitle")}
    description={approval.reason || t("interactions.defaultApprovalReason", { tool: approval.toolName })}
    status="pending"
    disabled={busy}
    confirmLabel={t("interactions.approve")}
    cancelLabel={t("interactions.reject")}
    onconfirm={() => onApproval("allowed-once")}
    oncancel={() => onApproval("rejected")}
    class="interaction-card approval-card"
  />
  {/key}
{/if}

{#if question}
  <section class="interaction-card question-card">
    <div class="interaction-content">
      <div class="interaction-icon"><CircleAlert size={17} /></div>
      <strong>{t("interactions.questionTitle")}</strong>
      <fieldset disabled={busy} class="question-fields">
      {#each question.questions as item (String(item.id))}
        <QuestionField
          {item}
          selected={answers[String(item.id)] || ""}
          custom={answers[`${String(item.id)}:custom`] || ""}
          {onAnswer}
        />
      {/each}
      </fieldset>
      <div class="interaction-actions"><Button class="pending-submit-button" size="sm" disabled={!questionComplete || busy} onclick={onQuestion}><Send size={14} />{t("interactions.submit")}</Button></div>
    </div>
  </section>
{/if}

<style>
  .question-fields { display: contents; border: 0; padding: 0; margin: 0; min-width: 0; }
  :global(.interaction-card) { max-height: min(440px, 50dvh); overflow-y: auto; flex-shrink: 0; }
  :global(.approval-card) { display: block; }
  :global(.approval-card .svadmin-ai-confirmation__heading) { flex-wrap: wrap; gap: 8px; }
  :global(.approval-card .svadmin-ai-confirmation__heading > div) { min-width: 0; overflow-wrap: anywhere; }
  :global(.approval-card .svadmin-ai-confirmation__actions) { flex-wrap: wrap; }
  .interaction-content > .interaction-icon { display: inline-flex; vertical-align: middle; align-items: center; }
  .interaction-actions { position: sticky; bottom: -12px; padding: 10px 0; background: var(--card); }
</style>
