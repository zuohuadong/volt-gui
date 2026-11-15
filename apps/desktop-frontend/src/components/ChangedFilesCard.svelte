<script lang="ts">
  import { onMount } from "svelte";
  import { ChevronRight, FileDiff, LoaderCircle } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import {
    diffRows,
    fileChangeLabel,
    isChangesSummary,
    isFileDiff,
    summaryLabel,
    type ChangesSummary,
    type FileDiff as WorkspaceFileDiff,
  } from "$lib/workspace-changes";
  import { t } from "$lib/i18n";

  interface Props {
    readonly sessionId: string;
    /** `workspace/changes` 事件的序号；摘要按它回读。 */
    readonly seq: number;
    readonly turn: number;
  }

  let { sessionId, seq, turn }: Props = $props();

  let summary = $state<ChangesSummary | null>(null);
  let summaryFailed = $state(false);
  let loadingSummary = $state(true);
  let openIndex = $state(-1);
  let diffs = $state<Record<number, WorkspaceFileDiff | null>>({});
  let loadingDiff = $state(-1);

  let requested = "";

  async function loadSummary(): Promise<void> {
    const key = `${sessionId}:${seq}`;
    if (requested === key) return;
    requested = key;
    loadingSummary = true;
    summaryFailed = false;
    summary = null;
    diffs = {};
    openIndex = -1;
    try {
      const value = await window.voltDesktop?.readChangesSummary?.(sessionId, seq);
      if (requested !== key) return;
      // 路由返回 404/undefined 表示摘要已经不在了（Host 重启后常见）：不展示空卡片。
      if (isChangesSummary(value)) summary = value;
      else summaryFailed = value !== undefined;
    } catch {
      if (requested === key) summaryFailed = true;
    } finally {
      if (requested === key) loadingSummary = false;
    }
  }

  async function toggle(index: number): Promise<void> {
    if (openIndex === index) { openIndex = -1; return; }
    openIndex = index;
    if (diffs[index] !== undefined) return;
    loadingDiff = index;
    const key = `${sessionId}:${seq}`;
    try {
      const value = await window.voltDesktop?.readChangesDiff?.(sessionId, seq, index);
      if (requested !== key) return;
      diffs = { ...diffs, [index]: isFileDiff(value) ? value : null };
    } catch {
      if (requested === key) diffs = { ...diffs, [index]: null };
    } finally {
      if (requested === key) loadingDiff = -1;
    }
  }

  onMount(() => { void loadSummary(); });
  // 同一轮可能被新的摘要事件取代；序号变了就重新读，不沿用旧卡片。
  $effect(() => { void seq; void sessionId; void loadSummary(); });

  const label = $derived(summary ? summaryLabel(summary) : null);
</script>

{#if loadingSummary}
  <div class="changes-card changes-card--loading" role="status"><LoaderCircle size={14} class="spin" aria-hidden="true" />{t("changes.loading")}</div>
{:else if summary}
  <div class="changes-card" aria-label={t("changes.label")}>
    <div class="changes-card__head">
      <FileDiff size={14} aria-hidden="true" />
      <strong>{t("changes.title", { count: String(label?.files ?? 0) })}</strong>
      <small>{t("changes.summary", { added: String(label?.added ?? 0), deleted: String(label?.deleted ?? 0) })}</small>
      <small class="changes-card__turn">{t("changes.turn", { turn: String(turn) })}</small>
    </div>
    <ul class="changes-list">
      {#each summary.files as file, index (file.path)}
        <li>
          <button type="button" class="changes-row" aria-expanded={openIndex === index} onclick={() => void toggle(index)}>
            <ChevronRight size={13} aria-hidden="true" />
            <span class="changes-path">{file.display}</span>
            <small>{fileChangeLabel(file)}</small>
          </button>
          {#if openIndex === index}
            {@const diff = diffs[index]}
            {#if loadingDiff === index}
              <p class="changes-status" role="status"><LoaderCircle size={13} class="spin" aria-hidden="true" />{t("changes.loadingDiff")}</p>
            {:else if diff === null}
              <p class="changes-status" role="status">{t("changes.diffUnavailable")}</p>
            {:else if diff?.kind === "binary"}
              <p class="changes-status" role="status">{t("changes.binary")}</p>
            {:else if diff?.kind === "oversized"}
              <p class="changes-status" role="status">{t("changes.oversized")}</p>
            {:else if diff}
              {@const rows = diffRows(diff)}
              {#if rows.length === 0}
                <p class="changes-status" role="status">{t("changes.noContentChange")}</p>
              {:else}
                <pre class="changes-diff">{#each rows as row, rowIndex (`${rowIndex}:${row.kind}`)}<span class={`diff-line diff-line--${row.kind}`}>{row.text}
</span>{/each}</pre>
              {/if}
              {#if diff.kind === "text" && diff.coarse}
                <p class="changes-status" role="status">{t("changes.coarse")}</p>
              {/if}
            {/if}
          {/if}
        </li>
      {/each}
    </ul>
    {#if label && label.omitted > 0}
      <p class="changes-status">{t("changes.omitted", { count: String(label.omitted) })}</p>
    {/if}
  </div>
{:else if summaryFailed}
  <div class="changes-card changes-card--loading" role="status">{t("changes.unavailable")}</div>
{/if}

<style>
  .changes-card { border: 1px solid var(--border); border-radius: 8px; margin: 10px 0; background: var(--card); }
  .changes-card--loading { display: flex; align-items: center; gap: 6px; padding: 8px 10px; color: var(--muted-foreground); font-size: 12px; }
  .changes-card__head { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  .changes-card__head small { color: var(--muted-foreground); font-size: 11px; }
  .changes-card__turn { margin-left: auto; }
  .changes-list { list-style: none; margin: 0; padding: 4px 0; }
  .changes-row { display: flex; align-items: center; gap: 6px; width: 100%; padding: 4px 10px; background: none; border: 0; text-align: left; cursor: pointer; font: inherit; }
  .changes-row:hover { background: var(--muted); }
  .changes-row[aria-expanded="true"] > :global(svg:first-child) { transform: rotate(90deg); }
  .changes-path { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .changes-row small { color: var(--muted-foreground); font-size: 11px; font-variant-numeric: tabular-nums; }
  .changes-status { margin: 0; padding: 4px 10px 8px; color: var(--muted-foreground); font-size: 12px; }
  .changes-diff { margin: 0; padding: 6px 10px 10px; overflow-x: auto; font-family: var(--font-mono, ui-monospace, monospace); font-size: 11.5px; line-height: 1.5; }
  .diff-line { display: block; white-space: pre; }
  .diff-line--add { color: var(--success, #15803d); }
  .diff-line--remove { color: var(--destructive); }
  .diff-line--meta { color: var(--muted-foreground); }
</style>