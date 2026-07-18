<script lang="ts">
  import { ArrowUp, LoaderCircle, RotateCcw } from "@lucide/svelte";

  let {
    hasOlder,
    loading,
    error,
    onLoad,
  }: {
    hasOlder: boolean;
    loading: boolean;
    error?: string;
    onLoad: () => void | Promise<void>;
  } = $props();
</script>

{#if loading || error || hasOlder}
  <div class="history-pagination" class:error={Boolean(error)} role={error ? "alert" : "status"} data-testid="history-pagination-status">
    {#if loading}
      <span class="spin" aria-hidden="true"><LoaderCircle size={14} /></span>
      <span>正在加载更早记录…</span>
    {:else if error}
      <span>{error}</span>
      <button type="button" onclick={() => void onLoad()}>
        <RotateCcw size={13} aria-hidden="true" />
        重试
      </button>
    {:else}
      <button class="load-older" type="button" onclick={() => void onLoad()}>
        <ArrowUp size={13} aria-hidden="true" />
        加载更早记录
      </button>
      <span>也可继续向上滚动自动加载</span>
    {/if}
  </div>
{/if}

<style>
  .history-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 34px;
    margin: 0 auto 12px;
    padding: 0 10px;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
  }

  .history-pagination.error {
    justify-content: space-between;
    max-width: 620px;
    border: 1px solid color-mix(in srgb, var(--warning, #9a5b00) 28%, var(--border, #dce1db));
    border-radius: 8px;
    background: var(--warning-soft, #fff4de);
    color: var(--warning, #9a5b00);
  }

  .history-pagination > span:not(.spin) {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    min-height: 30px;
    padding: 0 9px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 6px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    font: inherit;
    font-weight: 550;
    flex: 0 0 auto;
    cursor: pointer;
  }

  button:hover {
    border-color: color-mix(in srgb, var(--primary, #1f2421) 26%, var(--border, #dce1db));
    background: var(--muted, #edf0ec);
  }

  .load-older {
    color: var(--foreground, #1f2421);
  }

  .spin {
    display: inline-flex;
    animation: history-spin 900ms linear infinite;
  }

  @keyframes history-spin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .spin { animation: none; }
  }
</style>
