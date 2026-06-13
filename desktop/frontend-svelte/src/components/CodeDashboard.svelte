<script lang="ts">
  import { Code2, FileText, GitPullRequest, Gauge, RotateCcw } from "@lucide/svelte";
  import type { CheckpointMeta, ContextPanelInfo, FilePreview, WorkspaceChangesView } from "../lib/types";

  let {
    context,
    changes,
    checkpoints,
    filePreview,
    onPreviewFile,
    onRewind,
  }: {
    context?: ContextPanelInfo;
    changes?: WorkspaceChangesView;
    checkpoints: CheckpointMeta[];
    filePreview?: FilePreview;
    onPreviewFile: (path: string) => void;
    onRewind: (turn: number, scope: string) => void;
  } = $props();

  const tokenPercent = $derived(context ? Math.min(100, Math.round((context.usedTokens / Math.max(context.windowTokens, 1)) * 100)) : 0);
  const changedCount = $derived(changes?.files.length ?? 0);
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
      <p>{changedCount === 0 ? "Workspace is clean." : `${changedCount} files have pending changes.`}</p>
    </article>
    <article>
      <RotateCcw size={20} />
      <h2>Checkpoints</h2>
      <p>{checkpoints.length ? `${checkpoints.length} rewind points available for this tab.` : "No checkpoints yet."}</p>
    </article>
  </div>

  <aside class="code-dock">
    <section>
      <h2><Code2 size={15} /> Read files</h2>
      {#if context?.readFiles.length}
        {#each context.readFiles as file (`${file.path}-${file.turn}`)}
          <button type="button" onclick={() => onPreviewFile(file.path)}>{file.path}</button>
        {/each}
      {:else}
        <span>No files read yet.</span>
      {/if}
    </section>
    <section>
      <h2><GitPullRequest size={15} /> Changes</h2>
      {#if changes?.files.length}
        {#each changes.files as file (file.path)}
          <button type="button" onclick={() => onPreviewFile(file.path)}>
            <strong>{file.gitStatus || "?"}</strong>
            <span>{file.path}</span>
          </button>
        {/each}
      {:else}
        <span>{changes?.gitErr || "No changed files."}</span>
      {/if}
    </section>
    <section>
      <h2><RotateCcw size={15} /> Checkpoints</h2>
      {#if checkpoints.length}
        {#each checkpoints as checkpoint (checkpoint.turn)}
          <div class="checkpoint">
            <strong>#{checkpoint.turn} {checkpoint.prompt}</strong>
            <span>{checkpoint.files.length} files</span>
            <div>
              {#if checkpoint.canConversation !== false}
                <button type="button" onclick={() => onRewind(checkpoint.turn, "conversation")}>Conversation</button>
              {/if}
              {#if checkpoint.canCode !== false}
                <button type="button" onclick={() => onRewind(checkpoint.turn, "code")}>Code</button>
              {/if}
              <button type="button" onclick={() => onRewind(checkpoint.turn, "both")}>Both</button>
            </div>
          </div>
        {/each}
      {:else}
        <span>No rewind points yet.</span>
      {/if}
    </section>
    <section>
      <h2><FileText size={15} /> Preview</h2>
      {#if filePreview}
        <strong>{filePreview.path}</strong>
        <pre>{filePreview.err || filePreview.body}</pre>
      {:else}
        <span>Select an @ reference in the composer to preview it here.</span>
      {/if}
    </section>
  </aside>
</section>
