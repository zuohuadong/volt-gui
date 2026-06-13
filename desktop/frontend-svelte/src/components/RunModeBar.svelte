<script lang="ts">
  import type { RunMode } from "../lib/types";

  let {
    runModes,
    runMode,
    onSelect,
  }: {
    runModes: Array<{ id: RunMode; label: string; hint: string }>;
    runMode: RunMode;
    onSelect: (mode: RunMode) => void;
  } = $props();
</script>

<div class="run-modes" aria-label="Run mode">
  {#each runModes as mode (mode.id)}
    <button class={runMode === mode.id ? "is-active" : ""} type="button" title={mode.hint} onclick={() => onSelect(mode.id)}>
      {mode.label}
    </button>
  {/each}
</div>
