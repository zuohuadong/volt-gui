<script lang="ts">
  import { ArrowUp } from "@lucide/svelte";

  let {
    visible,
    aboveComposer = false,
    onActivate,
  }: {
    visible: boolean;
    aboveComposer?: boolean;
    onActivate: () => void;
  } = $props();
</script>

{#if visible}
  <button class={["back-to-top", aboveComposer && "back-to-top--raised"]} type="button" aria-label="回到顶部" title="回到顶部" onclick={onActivate}>
    <ArrowUp size={15} />
    <span>回到顶部</span>
  </button>
{/if}

<style>
  .back-to-top {
    position: absolute;
    right: 24px;
    bottom: 24px;
    z-index: 24;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 34px;
    padding: 0 11px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 999px;
    background: color-mix(in srgb, var(--card, #fff) 94%, transparent);
    color: var(--foreground, #1f2421);
    box-shadow: 0 8px 20px rgb(31 36 33 / 12%);
    font: inherit;
    font-size: 12px;
    font-weight: 650;
    backdrop-filter: blur(12px);
  }

  .back-to-top:hover {
    border-color: var(--accent, #0f7b55);
    color: var(--accent, #0f7b55);
  }

  .back-to-top--raised {
    bottom: 132px;
  }

  @media (max-width: 720px) {
    .back-to-top {
      right: 14px;
      bottom: 14px;
      min-width: 38px;
      justify-content: center;
      padding: 0 10px;
    }


    .back-to-top--raised {
      bottom: 116px;
    }

    .back-to-top span {
      display: none;
    }
  }
</style>
