<script lang="ts">
  import katex from "katex";
  import "katex/dist/katex.min.css";

  let {
    source,
    display = false,
  }: {
    source: string;
    display?: boolean;
  } = $props();

  const rendered = $derived.by(() => {
    const value = source.trim();
    if (!value) return { ok: true, html: "" };
    try {
      return {
        ok: true,
        html: katex.renderToString(value, {
          displayMode: display,
          throwOnError: false,
          strict: "warn",
          trust: false,
          output: "html",
        }),
      };
    } catch (error) {
      return { ok: false, html: error instanceof Error ? error.message : String(error) };
    }
  });
</script>

{#if rendered.ok}
  <span class={display ? "math math--block" : "math math--inline"} data-katex={display ? "block" : "inline"}>{@html rendered.html}</span>
{:else}
  <code class="math math--error">{source}</code>
{/if}
