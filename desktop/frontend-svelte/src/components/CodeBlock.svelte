<script lang="ts">
  let {
    code,
    language,
    maxHeight = 360,
  }: {
    code: string;
    language?: string;
    maxHeight?: number;
  } = $props();
</script>

<div class="code-viewer" style:--max-height={`${maxHeight}px`}>
  {#if language}
    <span>{language}</span>
  {/if}
  <pre><code>{code}</code></pre>
</div>
