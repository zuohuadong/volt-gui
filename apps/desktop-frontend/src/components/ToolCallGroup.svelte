<script lang="ts">
  import { Check, ChevronRight, CircleAlert, CirclePause, LoaderCircle } from "@lucide/svelte";
  import { StackTrace } from "@svadmin/ai-elements";
  import type { DshClient } from "$lib/dsh-client";
  import LazyStructuredToolResult from "$components/LazyStructuredToolResult.svelte";
  import { hasStructuredToolOutput, toolErrorTrace, toolPresentation, toolResultSummary } from "$lib/ai-elements-adapter";
  import type { TranscriptMessage } from "$lib/transcript";
  import { toolBusinessLabel, safeToolDetail, summarizeToolStates, toolSummaryKind } from "$lib/tool-summary";
  import { t } from "$lib/i18n";

  let { messages, client, sessionId = "" }: { messages: TranscriptMessage[]; client?: DshClient; sessionId?: string } = $props();
  let expandedTools = $state<Set<string>>(new Set());
  const tools = $derived(messages.flatMap((message) => message.tool ? [message.tool] : []));
  const summary = $derived(summarizeToolStates(tools.map((tool) => tool.state)));
  const kind = $derived(toolSummaryKind(summary));

  // 汇总行只回答「这轮成了没有、几项没成、影响不影响结论」（#358）。
  // 局部失败一律中性表述，只有一项都没成功时才用失败色。
  const summaryText = $derived(kind === "empty"
    ? t("transcript.toolSummaryEmpty")
    : kind === "running"
      ? t("transcript.toolSummaryRunning", { count: summary.total })
      : kind === "all-success"
        ? t("transcript.toolSummaryAllSuccess", { count: summary.total })
        : kind === "failed"
          ? t("transcript.toolSummaryFailed", { count: summary.failed + summary.interrupted })
          : t("transcript.toolSummaryPartial", { completed: summary.completed, failed: summary.failed + summary.interrupted }));

  function updateToolExpanded(callId: string, event: Event): void {
    const open = (event.currentTarget as HTMLDetailsElement).open;
    const next = new Set(expandedTools);
    if (open) next.add(callId);
    else next.delete(callId);
    expandedTools = next;
  }

  function labelFor(name: string): string { return toolBusinessLabel(name); }
  function detailFor(tool: TranscriptMessage["tool"]): string | undefined {
    if (!tool) return undefined;
    const view = tool.view?.view;
    const record = view && typeof view === "object" ? view as Record<string, unknown> : undefined;
    const fallback = typeof record?.name === "string" ? record.name : typeof record?.path === "string" ? record.path : undefined;
    return safeToolDetail(tool.args, fallback);
  }
</script>

<!-- 默认收起：失败时反而把最多内部细节推到用户眼前是错的（#357）。 -->
<details class="tool-call-group">
  <summary class="tool-call-group__summary">
    <span class:error={kind === "failed"} class="tool-call-group__icon" aria-hidden="true">
      {#if summary.running}<LoaderCircle size={14} class="spin" />{:else if kind === "failed"}<CircleAlert size={14} />{:else if summary.interrupted && summary.completed === 0}<CirclePause size={14} />{:else}<Check size={14} />{/if}
    </span>
    <span class="tool-call-group__title">{summaryText}</span>
    <ChevronRight size={13} class="tool-call-group__chevron" aria-hidden="true" />
  </summary>
  <div class="tool-call-group__items">
    {#each messages.filter((message) => message.tool) as message (message.id)}
      {@const tool = message.tool!}
      {@const structuredOutput = hasStructuredToolOutput(toolPresentation(tool))}
      {@const trace = toolErrorTrace(tool)}
      {@const label = labelFor(tool.name)}
      {@const detail = detailFor(tool)}
      <details class="user-tool-card" ontoggle={(event) => updateToolExpanded(message.id, event)}>
        <summary>
          <span class="user-tool-card__icon" aria-hidden="true">
            {#if tool.state === "running"}<LoaderCircle size={14} class="spin" />{:else if tool.state === "error"}<CircleAlert size={14} />{:else if tool.state === "interrupted"}<CirclePause size={14} />{:else}<Check size={14} />{/if}
          </span>
          <span class="user-tool-card__copy">
            <span class="user-tool-card__label">{label}</span>
            {#if detail}<span class="user-tool-card__detail">{detail}</span>{/if}
          </span>
          <span class:user-tool-card__error={kind === "failed" && tool.state === "error"} class="user-tool-card__state">{t(tool.state === "running" ? "activity.running" : tool.state === "error" ? "activity.failed" : tool.state === "interrupted" ? "activity.interrupted" : "activity.completed")}</span>
          <ChevronRight size={13} class="user-tool-card__chevron" aria-hidden="true" />
        </summary>
        {#if tool.state === "interrupted"}<p>{t("activity.resultUnknown")}</p>
        {:else if tool.state === "error"}<p>{t("transcript.toolErrorImpact", { action: label })}</p>
        {:else if !structuredOutput && tool.result}<p>{toolResultSummary(tool.result)}</p>{/if}
        {#if tool.state === "success" && (tool.result || tool.view)}
          <LazyStructuredToolResult enabled={expandedTools.has(message.id)} {tool} {client} {sessionId} />
        {/if}
        {#if trace || tool.args || tool.result}
          <details class="activity-tool-raw">
            <summary>{t("transcript.toolTechnicalDetails")}</summary>
            {#if trace}<StackTrace {trace} title={t("transcript.errorTrace")} />{/if}
            {#if tool.args}<pre>{tool.args}</pre>{/if}
            {#if tool.result}<pre>{tool.result}</pre>{/if}
          </details>
        {/if}
      </details>
    {/each}
  </div>
</details>

<style>
  .tool-call-group { min-width: 0; margin: 4px 0; color: var(--muted-foreground); font-size: 12px; }
  .tool-call-group__summary { display: flex; align-items: flex-start; gap: 8px; min-height: 32px; cursor: pointer; list-style: none; }
  .tool-call-group__summary::-webkit-details-marker { display: none; }
  .tool-call-group__summary:focus-visible { outline: 2px solid var(--ring); outline-offset: 3px; }
  .tool-call-group__icon, .tool-call-group__title, :global(.tool-call-group__chevron) { flex-shrink: 0; }
  .tool-call-group__icon { display: flex; }
  .tool-call-group__title { flex: 1; min-width: 0; overflow-wrap: anywhere; white-space: normal; line-height: 1.35; }
  .error { color: var(--destructive); }
  .tool-call-group[open] > summary :global(.tool-call-group__chevron) { transform: rotate(90deg); }
  .tool-call-group__items { margin: 4px 0 8px 7px; padding-left: 13px; border-left: 1px solid var(--border); }
  .tool-call-group__items :global(.user-tool-card) { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .tool-call-group__items :global(.user-tool-card > summary) { padding: 6px 0; min-height: 30px; }
  .tool-call-group__items :global(.activity-tool-raw) { margin: 0 8px 8px; }
</style>