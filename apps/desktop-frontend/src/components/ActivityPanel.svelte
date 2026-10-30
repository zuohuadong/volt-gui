<script lang="ts">
  import { Check, ChevronRight, CircleAlert, CirclePause, History, LoaderCircle, RotateCcw, Square, X } from "@lucide/svelte";
  import { Plan } from "@svadmin/ai-elements";
  import { Button } from "$components/ui/button";
  import LazyStructuredToolResult from "$components/LazyStructuredToolResult.svelte";
  import { hasStructuredToolOutput, toolDisplay, toolErrorSummary, toolPresentation, toolResultSummary } from "$lib/ai-elements-adapter";
  import type { HistoryEntry } from "$lib/dsh-client";
  import type { TodoItem, TranscriptMessage } from "$lib/transcript";
  import { hasRetryableTask } from "$lib/task-retry";
  import type { DshClient } from "$lib/dsh-client";
  import type { SessionOperation } from "$lib/session-activity";
  import { getLocale, t } from "$lib/i18n";

  type Props = {
    messages: TranscriptMessage[];
    todos: TodoItem[];
    sending: boolean;
    open: boolean;
    onClose: () => void;
    client?: DshClient;
    sessionId?: string;
    history?: HistoryEntry[];
    onRetry?: () => void | Promise<void>;
    onStop?: () => void;
    sessionOperations?: SessionOperation[];
  };

  let { messages, todos, sending, open, onClose, client, sessionId = "", history = [], onRetry, onStop, sessionOperations = [] }: Props = $props();
  let expandedTools = $state<Set<string>>(new Set());
  const activityItems = $derived(messages.filter((item) => item.tool).slice(-12).reverse());
  const canRetry = $derived(hasRetryableTask(messages, todos, sending, history));
  const planSteps = $derived(todos.map((todo, index) => ({
    id: `todo-${index}-${todo.content}`,
    title: todo.content,
    status: todo.status === "completed" ? "complete" as const : todo.status === "in_progress" ? "active" as const : "pending" as const,
  })));

  function updateToolExpanded(callId: string, event: Event): void {
    const open = (event.currentTarget as HTMLDetailsElement).open;
    const next = new Set(expandedTools);
    if (open) next.add(callId);
    else next.delete(callId);
    expandedTools = next;
  }
</script>

<aside id="session-activity" class:open class="activity-panel" aria-label={t("activity.title")}>
  <div class="panel-heading">
    <div>
      <div class="section-label">{t("activity.title")}</div>
      <strong>{sending ? t("activity.executing") : t("activity.recent")}</strong>
    </div>
    <div class="panel-heading__actions">
      {#if sending && onStop}
        <Button variant="outline" size="sm" aria-label={t("activity.stopTask")} title={t("activity.stopTask")} onclick={onStop}>
          <Square size={13} fill="currentColor" />{t("activity.stopTask")}
        </Button>
      {:else if canRetry && onRetry}
        <Button variant="outline" size="sm" aria-label={t("activity.retryTask")} title={t("activity.retryTask")} onclick={() => void onRetry()}>
          <RotateCcw size={13} />{t("activity.continueTask")}
        </Button>
      {/if}
      <Button variant="ghost" size="icon-sm" aria-label={t("activity.close")} onclick={onClose}><X size={14} /></Button>
    </div>
  </div>
  <div class="activity-content ai-activity-content">
    <section class="session-operation-list" aria-label={t("activity.sessionOperations")}>
      <h3>{t("activity.sessionOperations")}</h3>
      <small>{t("activity.operationScope")}</small>
      <ol>
        {#each sessionOperations as operation (operation.id)}
          <li data-operation={operation.kind} data-session-id={operation.sessionId}>
            <strong>{t(`activity.actions.${operation.kind}`)}</strong>
            <span title={operation.sessionId}>{operation.title}</span>
            <time datetime={new Date(operation.time).toISOString()}>{new Date(operation.time).toLocaleString(getLocale())}</time>
          </li>
        {:else}
          <li class="session-operation-empty">{t("activity.operationsEmpty")}</li>
        {/each}
      </ol>
    </section>
    {#if todos.length > 0}
      <Plan steps={planSteps} title={t("activity.taskPlan")} description={t("activity.planProgress", { completed: todos.filter((todo) => todo.status === "completed").length, total: todos.length })} isStreaming={sending} />
    {/if}
    <section class="activity-tool-list" aria-label={t("activity.toolExecution")}>
      <h3>{t("activity.toolExecutionDesc")}</h3>
      {#each activityItems as message (message.id)}
        {@const tool = message.tool!}
        {@const display = toolDisplay(tool)}
        {@const presentation = toolPresentation(tool)}
        {@const structuredOutput = hasStructuredToolOutput(presentation)}
        <details class="activity-tool-disclosure" open={tool.state === "error"} ontoggle={(event) => updateToolExpanded(message.id, event)}>
          <summary class="activity-tool-row">
            <span class="activity-tool-row__icon" class:activity-tool-row__icon--error={tool.state === "error"} aria-hidden="true">
              {#if tool.state === "running"}<LoaderCircle size={14} class="spin" />{:else if tool.state === "error"}<CircleAlert size={14} />{:else if tool.state === "interrupted"}<CirclePause size={14} />{:else}<Check size={14} />{/if}
            </span>
            <div class="activity-tool-row__copy">
              <strong>{display.label}</strong>
              {#if display.detail}<span>{display.detail}</span>{/if}
            </div>
            <small class:activity-tool-row__state--error={tool.state === "error"} class="activity-tool-row__state">
              {tool.state === "running" ? t("activity.running") : tool.state === "error" ? t("activity.failed") : tool.state === "interrupted" ? t("activity.interrupted") : t("activity.completed")}
            </small>
            <ChevronRight size={13} class="activity-tool-row__chevron" aria-hidden="true" />
          </summary>
          <div class="activity-tool-details">
            {#if tool.state === "interrupted"}
              <p>{t("activity.resultUnknown")}</p>
            {:else if tool.state === "error"}
              <p>{toolErrorSummary(tool.result)}</p>
            {:else if !structuredOutput && tool.result}
              <p>{toolResultSummary(tool.result)}</p>
            {/if}
            {#if tool.state === "success" && (tool.result || tool.view)}
              <LazyStructuredToolResult enabled={expandedTools.has(message.id)} {tool} {client} {sessionId} />
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

<style>
  h3 { margin: 0; font-size: 12px; font-weight: 600; }
  .session-operation-list { min-width: 0; padding: 12px; border-bottom: 1px solid var(--border); }
  .session-operation-list small, time { color: var(--muted-foreground); font-size: 11px; }
  ol { list-style: none; margin: 8px 0 0; padding: 0; }
  li { display: grid; gap: 3px; min-width: 0; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 12px; overflow-wrap: anywhere; }
  li:last-child { border-bottom: 0; }
  .session-operation-empty { color: var(--muted-foreground); }
</style>
