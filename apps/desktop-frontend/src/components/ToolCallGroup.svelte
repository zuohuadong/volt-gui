<script lang="ts">
  import { Check, ChevronRight, CircleAlert, CirclePause, LoaderCircle } from "@lucide/svelte";
  import { StackTrace } from "@svadmin/ai-elements";
  import type { DshClient } from "$lib/dsh-client";
  import LazyStructuredToolResult from "$components/LazyStructuredToolResult.svelte";
  import { hasStructuredToolOutput, toolDisplay, toolErrorSummary, toolErrorTrace, toolPresentation, toolResultSummary } from "$lib/ai-elements-adapter";
  import type { TranscriptMessage } from "$lib/transcript";
  import { t } from "$lib/i18n";

  let { messages, client, sessionId = "" }: { messages: TranscriptMessage[]; client?: DshClient; sessionId?: string } = $props();
  let expandedTools = $state<Set<string>>(new Set());
  const tools = $derived(messages.flatMap((message) => message.tool ? [message.tool] : []));
  const running = $derived(tools.filter((tool) => tool.state === "running").length);
  const failed = $derived(tools.filter((tool) => tool.state === "error").length);
  const interrupted = $derived(tools.filter((tool) => tool.state === "interrupted").length);
  const current = $derived(tools.filter((tool) => tool.state === "running").at(-1) ?? tools.at(-1));
  const currentDisplay = $derived(current ? toolDisplay(current) : undefined);

  function updateToolExpanded(callId: string, event: Event): void {
    const open = (event.currentTarget as HTMLDetailsElement).open;
    const next = new Set(expandedTools);
    if (open) next.add(callId);
    else next.delete(callId);
    expandedTools = next;
  }
</script>

<details class="tool-call-group" open={failed > 0}>
  <summary class="tool-call-group__summary">
    <span class:error={failed > 0} class="tool-call-group__icon" aria-hidden="true">
      {#if running}<LoaderCircle size={14} class="spin" />{:else if failed}<CircleAlert size={14} />{:else if interrupted}<CirclePause size={14} />{:else}<Check size={14} />{/if}
    </span>
    <span class="tool-call-group__title">{t("transcript.toolCount", { count: tools.length })}</span>
    <span class="tool-call-group__detail" title={currentDisplay?.detail || currentDisplay?.label}>
      {running ? currentDisplay?.detail || currentDisplay?.label : t(failed ? "activity.failed" : interrupted ? "activity.interrupted" : "activity.completed")}
    </span>
    {#if failed}<span class="tool-call-group__failures">{t("transcript.toolFailures", { count: failed })}</span>{/if}
    {#if interrupted}<span class="tool-call-group__state">{t("activity.toolsInterrupted", { count: interrupted })}</span>{/if}
    {#if running}<span class="tool-call-group__state">{t("activity.toolsRunning", { count: running })}</span>{/if}
    <ChevronRight size={13} class="tool-call-group__chevron" aria-hidden="true" />
  </summary>
  <div class="tool-call-group__items">
    {#each messages.filter((message) => message.tool) as message (message.id)}
      {@const tool = message.tool!}
      {@const display = toolDisplay(tool)}
      {@const structuredOutput = hasStructuredToolOutput(toolPresentation(tool))}
      {@const trace = toolErrorTrace(tool)}
      <details class="user-tool-card" open={tool.state === "error"} ontoggle={(event) => updateToolExpanded(message.id, event)}>
        <summary>
          <span class="user-tool-card__icon" aria-hidden="true">
            {#if tool.state === "running"}<LoaderCircle size={14} class="spin" />{:else if tool.state === "error"}<CircleAlert size={14} />{:else if tool.state === "interrupted"}<CirclePause size={14} />{:else}<Check size={14} />{/if}
          </span>
          <span class="user-tool-card__copy">
            <span class="user-tool-card__label">{display.label}</span>
            {#if display.detail}<span class="user-tool-card__detail" title={display.detail}>{display.detail}</span>{/if}
          </span>
          <span class:user-tool-card__error={tool.state === "error"} class="user-tool-card__state">{t(tool.state === "running" ? "activity.running" : tool.state === "error" ? "activity.failed" : tool.state === "interrupted" ? "activity.interrupted" : "activity.completed")}</span>
          <ChevronRight size={13} class="user-tool-card__chevron" aria-hidden="true" />
        </summary>
        {#if tool.state === "interrupted"}<p>{t("activity.resultUnknown")}</p>
        {:else if tool.state === "error"}<p>{toolErrorSummary(tool.result)}</p>
        {:else if !structuredOutput && tool.result}<p>{toolResultSummary(tool.result)}</p>{/if}
        {#if tool.state === "success" && (tool.result || tool.view)}
          <LazyStructuredToolResult enabled={expandedTools.has(message.id)} {tool} {client} {sessionId} />
        {/if}
        {#if trace}<StackTrace {trace} title={t("transcript.errorTrace")} />{/if}
        {#if tool.args || tool.result}
          <details class="activity-tool-raw">
            <summary>{t("activity.rawDetails")}</summary>
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
  .tool-call-group__detail { min-width: 0; flex: 1; overflow-wrap: anywhere; white-space: normal; line-height: 1.35; }
  .tool-call-group__state { margin-left: auto; flex-shrink: 0; font-size: 11px; }
  .tool-call-group__failures, .error { color: var(--destructive); }
  .tool-call-group__failures { flex-shrink: 0; }
  .tool-call-group[open] > summary :global(.tool-call-group__chevron) { transform: rotate(90deg); }
  .tool-call-group__items { margin: 4px 0 8px 7px; padding-left: 13px; border-left: 1px solid var(--border); }
  .tool-call-group__items :global(.user-tool-card) { border: 0; border-radius: 0; background: transparent; box-shadow: none; }
  .tool-call-group__items :global(.user-tool-card > summary) { padding: 6px 0; min-height: 30px; }
  .tool-call-group__items :global(.activity-tool-raw) { margin: 0 8px 8px; }
  @media (max-width: 480px) {
    .tool-call-group__summary { flex-wrap: wrap; }
    .tool-call-group__detail { flex-basis: 100%; order: 1; padding-left: 22px; }
  }
</style>
