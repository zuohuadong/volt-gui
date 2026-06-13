<script lang="ts">
  import { Code2, FileText, GitPullRequest, Gauge } from "@lucide/svelte";
  import type { ContextPanelInfo, WorkspaceChangesView } from "../lib/types";

  let {
    context,
    changes,
    filePreview,
  }: {
    context?: ContextPanelInfo;
    changes?: WorkspaceChangesView;
    filePreview?: { path: string; content: string };
  } = $props();

  const tokenPercent = $derived(context ? Math.min(100, Math.round((context.usedTokens / Math.max(context.windowTokens, 1)) * 100)) : 0);
</script>

<section class="code-layout" aria-label="Code workspace">
  <div class="dashboard-grid">
    <article>
      <Gauge size={20} />
      <h2>Context</h2>
      <p>{context ? `${context.usedTokens.toLocaleString()} / ${context.windowTokens.toLocaleString()} tokens (${tokenPercent}%)` : "Context panel pending."}</p>
    </article>
    <article>
      <GitPullRequest size={20} />
      <h2>Changed files</h2>
      <p>{changes?.clean ? "Workspace is clean." : `${changes?.files.length ?? 0} files have pending changes.`}</p>
    </article>
  </div>

  <aside class="code-dock">
    <section>
      <h2><Code2 size={15} /> Read files</h2>
      {#if context?.readFiles.length}
        {#each context.readFiles as file (`${file.path}-${file.turn}`)}
          <span>{file.path}</span>
        {/each}
      {:else}
        <span>No files read yet.</span>
      {/if}
    </section>
    <section>
      <h2><GitPullRequest size={15} /> Changes</h2>
      {#if changes?.files.length}
        {#each changes.files as file (file.path)}
          <span>{file.gitStatus || "?"} {file.path}</span>
        {/each}
      {:else}
        <span>No changed files.</span>
      {/if}
    </section>
    <section>
      <h2><FileText size={15} /> Preview</h2>
      {#if filePreview}
        <strong>{filePreview.path}</strong>
        <pre>{filePreview.content}</pre>
      {:else}
        <span>Select an @ reference in the composer to preview it here.</span>
      {/if}
    </section>
  </aside>
</section>
