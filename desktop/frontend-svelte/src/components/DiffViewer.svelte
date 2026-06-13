<script lang="ts">
  import CodeBlock from "./CodeBlock.svelte";
  import type { FilePreview, WorkspaceChangeView, WorkspaceDiffView } from "../lib/types";

  let {
    change,
    preview,
    diff,
  }: {
    change?: WorkspaceChangeView;
    preview?: FilePreview;
    diff?: WorkspaceDiffView;
  } = $props();

  const status = $derived(diff?.status || change?.gitStatus || "?");
  const detail = $derived(change?.latestPrompt || diff?.oldPath || change?.oldPath || change?.sources.join(", ") || "Workspace change");
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

  {#if diff}
    {#if diff.err}
      <p class="diff-viewer__error">{diff.err}</p>
    {:else if diff.binary}
      <p>Binary diff is unavailable.</p>
    {:else if diff.diff}
      <div class="diff-viewer__summary">
        <span>{diff.kind}</span>
        <span class="diff-viewer__added">+{diff.added}</span>
        <span class="diff-viewer__removed">-{diff.removed}</span>
      </div>
      <CodeBlock code={diff.diff} language="diff" maxHeight={260} />
      {#if diff.truncated}
        <p>Diff was truncated because the change is large.</p>
      {/if}
    {:else}
      <p>No textual diff for this change.</p>
    {/if}
  {:else if preview}
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
