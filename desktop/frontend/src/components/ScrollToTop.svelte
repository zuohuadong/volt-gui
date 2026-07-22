<script lang="ts">
  import { onMount } from "svelte";
  import { ArrowUp } from "@lucide/svelte";

  let host = $state<HTMLElement>();
  let scrollTarget = $state<HTMLElement | null>(null);
  let visible = $state(false);

  function mountHost(node: HTMLElement) {
    host = node;
    return () => { if (host === node) host = undefined; };
  }

  function findScrollTarget(node: HTMLElement): HTMLElement | null {
    let current: HTMLElement | null = node.parentElement;
    while (current) {
      const style = window.getComputedStyle(current);
      if (/(auto|scroll|overlay)/.test(style.overflowY)) return current;
      current = current.parentElement;
    }
    return document.scrollingElement instanceof HTMLElement ? document.scrollingElement : null;
  }

  function updateVisibility() {
    visible = Boolean(scrollTarget && scrollTarget.scrollTop > 280);
  }

  function scrollToTop() {
    if (!scrollTarget) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollTarget.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  }

  onMount(() => {
    if (!host) return;
    scrollTarget = findScrollTarget(host);
    if (!scrollTarget) return;
    scrollTarget.addEventListener("scroll", updateVisibility, { passive: true });
    updateVisibility();
    return () => scrollTarget?.removeEventListener("scroll", updateVisibility);
  });
</script>

{#if visible}
  <button class="scroll-to-top" type="button" aria-label="回到顶部" title="回到顶部" data-testid="scroll-to-top" {@attach mountHost} onclick={scrollToTop}>
    <ArrowUp size={15} />
  </button>
{:else}
  <span class="scroll-to-top-anchor" aria-hidden="true" {@attach mountHost}></span>
{/if}

<style>
  .scroll-to-top,
  .scroll-to-top-anchor { position: fixed; right: 22px; bottom: 22px; z-index: 30; }
  .scroll-to-top { display: inline-grid; place-items: center; width: 34px; height: 34px; padding: 0; border: 1px solid #cbd5e1; border-radius: 10px; background: rgba(255,255,255,.96); color: #344054; box-shadow: 0 8px 20px rgba(15,23,42,.12); cursor: pointer; }
  .scroll-to-top:hover { border-color: #93c5fd; background: #f8fbff; color: #1d4ed8; }
  @media (max-width: 720px) { .scroll-to-top, .scroll-to-top-anchor { right: 14px; bottom: 14px; } }
</style>
