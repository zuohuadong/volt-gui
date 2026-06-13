<script lang="ts">
  import CodeBlock from "./CodeBlock.svelte";
  import type { FilePreview, WorkspaceChangeView } from "../lib/types";

  let {
    change,
    preview,
  }: {
    change?: WorkspaceChangeView;
    preview?: FilePreview;
  } = $props();

  const status = $derived(change?.gitStatus ?? "?");
  const detail = $derived(change?.latestPrompt || change?.oldPath || change?.sources.join(", ") || "Workspace change");
  const language = $derived(preview?.path.split(".").pop());
</script>

<div class="diff-viewer">
  {#if change}
    <header>
      <strong>{status} {change.path}</strong>
      <span>{detail}</span>
    </header>
    {#if change.turns?.length}
      <p>Turns: {change.turns.join(", ")}</p>
    {/if}
  {/if}

  {#if preview}
    {#if preview.err}
      <p class="diff-viewer__error">{preview.err}</p>
    {:else if preview.binary}
      <p>Binary file preview is unavailable.</p>
    {:else}
      <CodeBlock code={preview.body} {language} maxHeight={220} />
      {#if preview.truncated}
        <p>Preview truncated at {preview.size} bytes.</p>
      {/if}
    {/if}
  {:else}
    <p>Select a changed file to inspect the current content.</p>
  {/if}
</div>
