<script lang="ts">
  import { History, X } from "@lucide/svelte";
  import {
    ChainOfThought,
    ChainOfThoughtContent,
    ChainOfThoughtHeader,
    ChainOfThoughtStep,
    Plan,
    Queue,
    Task,
  } from "@svadmin/ai-elements";
import { Button } from "$components/ui/button";
import type { TodoItem, TranscriptMessage } from "$lib/transcript";
import { t } from "$lib/i18n";

type Props = {
    messages: TranscriptMessage[];
    todos: TodoItem[];
    sending: boolean;
    open: boolean;
    onClose: () => void;
  };
  let { messages, todos, sending, open, onClose }: Props = $props();
  const activityItems = $derived(messages.filter((item) => item.tool).slice(-12).reverse());
  const runningTools = $derived(activityItems.filter((item) => item.tool?.state === "running"));
  const completedTools = $derived(messages.filter((item) => item.tool?.state === "success").length);
  const failedTools = $derived(messages.filter((item) => item.tool?.state === "error").length);
  const planSteps = $derived(todos.map((todo, index) => ({
    id: `todo-${index}-${todo.content}`,
    title: todo.content,
    status: todo.status === "completed" ? "complete" as const : todo.status === "in_progress" ? "active" as const : "pending" as const,
  })));
  const taskSteps = $derived(activityItems.map((message) => ({
    id: message.id,
    title: message.tool?.name || t("common.tool"),
    status: message.tool?.state === "success" ? "complete" as const : message.tool?.state === "error" ? "failed" as const : "running" as const,
    detail: message.tool?.state === "error" ? t("activity.failed") : message.tool?.state === "success" ? t("activity.completed") : t("activity.running"),
  })));
  const taskStatus = $derived(failedTools > 0 ? "failed" as const : sending || runningTools.length > 0 ? "running" as const : activityItems.length > 0 ? "complete" as const : "queued" as const);
  const queueItems = $derived(activityItems.map((message) => ({
    id: message.id,
    title: message.tool?.name || t("common.tool"),
    description: message.tool?.state === "error" ? t("activity.failed") : message.tool?.state === "success" ? t("activity.completed") : t("activity.running"),
    status: message.tool?.state === "error" ? "failed" as const : message.tool?.state === "success" ? "complete" as const : "running" as const,
  })));
</script>

<aside class:open class="activity-panel">
  <div class="panel-heading">
    <div><div class="section-label">{t("activity.title")}</div><strong>{runningTools.length ? t("activity.toolsRunning", { count: runningTools.length }) : t("activity.sessionTrajectory")}</strong></div>
    <Button variant="ghost" size="icon-sm" aria-label={t("activity.close")} onclick={onClose}><X size={14} /></Button>
  </div>
  <div class="activity-summary" aria-label={t("activity.title")}>
    <div><strong>{runningTools.length}</strong><span>{t("activity.running")}</span></div>
    <div><strong>{completedTools}</strong><span>{t("activity.completed")}</span></div>
    <div><strong>{todos.filter((todo) => todo.status === "completed").length}/{todos.length}</strong><span>{t("activity.todos")}</span></div>
  </div>
  <div class="activity-content ai-activity-content">
    {#if todos.length > 0}
      <Plan steps={planSteps} title={t("activity.taskPlan")} description={t("activity.taskPlanDesc")} isStreaming={sending} />
    {/if}
    <Task
      title={t("activity.toolExecution")}
      description={t("activity.toolExecutionDesc")}
      status={taskStatus}
      progress={taskSteps.length ? Math.round((taskSteps.filter((step) => step.status === "complete").length / taskSteps.length) * 100) : 0}
      steps={taskSteps}
      open
    />
    {#if queueItems.length > 0}<Queue items={queueItems} title={t("activity.executionQueue")} />{/if}
    <ChainOfThought defaultOpen={activityItems.length > 0} class="activity-chain">
      <ChainOfThoughtHeader>{t("activity.trajectory")}</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {#each activityItems as item (item.id)}
          <ChainOfThoughtStep
            label={item.tool?.name || t("common.tool")}
            description={item.tool?.state === "running" ? t("activity.running") : item.tool?.state === "error" ? t("activity.failed") : t("activity.completed")}
            status={item.tool?.state === "running" ? "active" : item.tool?.state === "error" ? "pending" : "complete"}
          />
        {:else}
          <div class="panel-empty"><History size={18} /><p>{t("activity.empty")}</p></div>
        {/each}
      </ChainOfThoughtContent>
    </ChainOfThought>
  </div>
</aside>
