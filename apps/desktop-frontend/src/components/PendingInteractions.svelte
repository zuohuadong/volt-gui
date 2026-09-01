<script lang="ts">
  import { CircleAlert, Send } from "@lucide/svelte";
  import { Confirmation } from "@svadmin/ai-elements";
  import { Button } from "$components/ui/button";
  import QuestionField from "$components/QuestionField.svelte";
  import { questionsAnswered } from "$lib/ai-elements-adapter";
  import type { PendingApproval, PendingQuestion } from "$lib/dsh-client";

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
    title="需要批准工具操作"
    description={approval.reason || `${approval.toolName} 请求访问工作区资源。`}
    status="pending"
    confirmLabel="允许一次"
    cancelLabel="拒绝"
    onconfirm={() => onApproval("allowed-once")}
    oncancel={() => onApproval("rejected")}
    class="interaction-card approval-card"
  />
{/if}

{#if question}
  <section class="interaction-card question-card">
    <div class="interaction-content">
      <div class="interaction-icon"><CircleAlert size={17} /></div>
      <strong>DSH 需要你的选择</strong>
      <p>回答后将继续当前官方 DSH 会话。</p>
      {#each question.questions as item (String(item.id))}
        <QuestionField
          {item}
          selected={answers[String(item.id)] || ""}
          custom={answers[`${String(item.id)}:custom`] || ""}
          {onAnswer}
        />
      {/each}
      <div class="interaction-actions"><Button size="sm" disabled={!questionComplete} onclick={onQuestion}><Send size={14} />提交回答</Button></div>
    </div>
  </section>
{/if}
