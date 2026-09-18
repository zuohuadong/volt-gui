<script lang="ts">
  import { Check, ChevronRight, CircleAlert, History, LoaderCircle, X } from "@lucide/svelte";
  import { Plan } from "@svadmin/ai-elements";
  import { Button } from "$components/ui/button";
  import StructuredToolResult from "$components/StructuredToolResult.svelte";
  import { hasStructuredToolOutput, toolDisplay, toolErrorSummary, toolPresentation, toolResultSummary } from "$lib/ai-elements-adapter";
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
  const planSteps = $derived(todos.map((todo, index) => ({
    id: `todo-${index}-${todo.content}`,
    title: todo.content,
    status: todo.status === "completed" ? "complete" as const : todo.status === "in_progress" ? "active" as const : "pending" as const,
  })));
</script>

<aside class:open class="activity-panel">
  <div class="panel-heading">
    <div>
      <div class="section-label">{t("activity.title")}</div>
      <strong>{sending ? t("activity.executing") : t("activity.recent")}</strong>
    </div>
    <Button variant="ghost" size="icon-sm" aria-label={t("activity.close")} onclick={onClose}><X size={14} /></Button>
  </div>
  <div class="activity-content ai-activity-content">
    {#if todos.length > 0}
      <Plan steps={planSteps} title={t("activity.taskPlan")} description={t("activity.taskPlanDesc")} isStreaming={sending} />
    {/if}
    <section class="activity-tool-list" aria-label={t("activity.toolExecution")}>
      {#each activityItems as message (message.id)}
        {@const tool = message.tool!}
        {@const display = toolDisplay(tool)}
        {@const presentation = toolPresentation(tool)}
        {@const structuredOutput = hasStructuredToolOutput(presentation)}
        <details class="activity-tool-disclosure" open={tool.state === "error"}>
          <summary class="activity-tool-row">
            <span class="activity-tool-row__icon" class:activity-tool-row__icon--error={tool.state === "error"} aria-hidden="true">
              {#if tool.state === "running"}<LoaderCircle size={14} class="spin" />{:else if tool.state === "error"}<CircleAlert size={14} />{:else}<Check size={14} />{/if}
            </span>
            <div class="activity-tool-row__copy">
              <strong>{display.label}</strong>
              {#if display.detail}<span>{display.detail}</span>{/if}
            </div>
            <small class:activity-tool-row__state--error={tool.state === "error"} class="activity-tool-row__state">
              {tool.state === "running" ? t("activity.running") : tool.state === "error" ? t("activity.failed") : t("activity.completed")}
            </small>
            <ChevronRight size={13} class="activity-tool-row__chevron" aria-hidden="true" />
          </summary>
          <div class="activity-tool-details">
            {#if tool.state === "error"}
              <p>{toolErrorSummary(tool.result)}</p>
            {:else if !structuredOutput && tool.result}
              <p>{toolResultSummary(tool.result)}</p>
            {/if}
            {#if tool.state !== "error" && (tool.result || tool.view)}
              <StructuredToolResult {tool} />
            {/if}
            {#if tool.args || tool.result}
              <details class="activity-tool-raw">
                <summary>{t("activity.rawDetails")}</summary>
                {#if tool.args}<pre>{tool.args}</pre>{/if}
                {#if tool.result}<pre>{tool.result}</pre>{/if}
              </details>
            {/if}
          </div>
        </details>
      {:else}
        <div class="panel-empty"><History size={18} /><p>{t("activity.empty")}</p></div>
      {/each}
    </section>
  </div>
</aside>
