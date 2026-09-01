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
    onApproval: (outcome: "allowed-once" | "rejected") => void;
    onQuestion: () => void;
  };
  let { approval, question, answers, onAnswer, onApproval, onQuestion }: Props = $props();
  const questionComplete = $derived(question ? questionsAnswered(question.questions, answers) : false);
</script>

{#if approval}
  <Confirmation
    title={t("interactions.askUserTitle")}
    description={approval.reason || t("interactions.defaultApprovalReason", { tool: approval.toolName })}
    status="pending"
    confirmLabel={t("interactions.approve")}
    cancelLabel={t("interactions.reject")}
    onconfirm={() => onApproval("allowed-once")}
    oncancel={() => onApproval("rejected")}
    class="interaction-card approval-card"
  />
{/if}

{#if question}
  <section class="interaction-card question-card">
    <div class="interaction-content">
      <div class="interaction-icon"><CircleAlert size={17} /></div>
      <strong>{t("interactions.askUserTitle")}</strong>
      <p>{t("app.officialRuntime")}</p>
      {#each question.questions as item (String(item.id))}
        <QuestionField
          {item}
          selected={answers[String(item.id)] || ""}
          custom={answers[`${String(item.id)}:custom`] || ""}
          {onAnswer}
        />
      {/each}
      <div class="interaction-actions"><Button size="sm" disabled={!questionComplete} onclick={onQuestion}><Send size={14} />{t("interactions.submit")}</Button></div>
    </div>
  </section>
{/if}
