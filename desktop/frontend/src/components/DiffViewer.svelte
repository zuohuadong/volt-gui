<script lang="ts">
  import CodeBlock from "./CodeBlock.svelte";
  import DiffCommentPanel from "./DiffCommentPanel.svelte";
  import type { DiffReviewComment } from "../lib/diff-review";
  import type { FilePreview, WorkspaceChangeView, WorkspaceDiffView } from "../lib/types";

  let {
    change,
    preview,
    diff,
    comments = [],
    onAddComment = () => undefined,
    onResolveComment = () => undefined,
    onDeleteComment = () => undefined,
    onRequestFix = () => undefined,
  }: {
    change?: WorkspaceChangeView;
    preview?: FilePreview;
    diff?: WorkspaceDiffView;
    comments?: DiffReviewComment[];
    onAddComment?: (path: string, revision: string, line: number, body: string) => void;
    onResolveComment?: (id: string, resolved: boolean) => void;
    onDeleteComment?: (id: string) => void;
    onRequestFix?: (path: string) => void | Promise<void>;
  } = $props();

  const status = $derived(diff?.status || change?.gitStatus || "?");
  const detail = $derived(change?.latestPrompt || diff?.oldPath || change?.oldPath || change?.sources.join(", ") || "Workspace change");
  const language = $derived(preview?.path.split(".").pop());

  function statusLabel(value?: string) {
    if (!value) return "changed";
    if (value === "??") return "untracked";
    if (value.includes("R")) return "renamed";
    if (value.includes("A")) return "added";
    if (value.includes("D")) return "deleted";
    if (value.includes("M")) return "modified";
    return value;
  }

  function stageLabels(value?: { indexStatus?: string; worktreeStatus?: string }) {
    const labels: string[] = [];
    if (value?.indexStatus && value.indexStatus !== "?") labels.push(`staged ${value.indexStatus}`);
    if (value?.worktreeStatus && value.worktreeStatus !== "?") labels.push(`unstaged ${value.worktreeStatus}`);
    if (value?.indexStatus === "?" || value?.worktreeStatus === "?") labels.push("untracked");
    return labels;
  }
</script>

<div class="diff-viewer">
  {#if change}
    <header>
      <strong>{statusLabel(status)} {change.path}</strong>
      <span>{detail}</span>
      {#if change.oldPath}
        <span>Renamed from {change.oldPath}</span>
      {/if}
      <div class="diff-viewer__badges" data-testid="diff-stage-badges">
        {#each stageLabels(change) as label (label)}
          <span>{label}</span>
        {/each}
      </div>
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
        {#if diff.oldPath}
          <span>renamed from {diff.oldPath}</span>
        {/if}
        {#each stageLabels(diff) as label (label)}
          <span>{label}</span>
        {/each}
        <span class="diff-viewer__added">+{diff.added}</span>
        <span class="diff-viewer__removed">-{diff.removed}</span>
      </div>
      <CodeBlock code={diff.diff} language="diff" maxHeight={260} />
      <DiffCommentPanel
        path={diff.path}
        diff={diff.diff}
        {comments}
        onAdd={onAddComment}
        onResolve={onResolveComment}
        onDelete={onDeleteComment}
        {onRequestFix}
      />
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
