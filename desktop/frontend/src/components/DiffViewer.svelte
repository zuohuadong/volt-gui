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
  const detail = $derived(change?.latestPrompt || diff?.oldPath || change?.oldPath || change?.sources.join(", ") || "工作区变更");
  const language = $derived(preview?.path.split(".").pop());

  function statusLabel(value?: string) {
    if (!value) return "已变更";
    if (value === "??") return "未跟踪";
    if (value.includes("R")) return "已重命名";
    if (value.includes("A")) return "已新增";
    if (value.includes("D")) return "已删除";
    if (value.includes("M")) return "已修改";
    return value;
  }

  function stageLabels(value?: { indexStatus?: string; worktreeStatus?: string }) {
    const labels: string[] = [];
    if (value?.indexStatus && value.indexStatus !== "?") labels.push(`已暂存 ${value.indexStatus}`);
    if (value?.worktreeStatus && value.worktreeStatus !== "?") labels.push(`未暂存 ${value.worktreeStatus}`);
    if (value?.indexStatus === "?" || value?.worktreeStatus === "?") labels.push("未跟踪");
    return labels;
  }
</script>

<div class="diff-viewer">
  {#if change}
    <header>
      <strong>{statusLabel(status)} {change.path}</strong>
      <span>{detail}</span>
      {#if change.oldPath}
        <span>原路径：{change.oldPath}</span>
      {/if}
      <div class="diff-viewer__badges" data-testid="diff-stage-badges">
        {#each stageLabels(change) as label (label)}
          <span>{label}</span>
        {/each}
      </div>
    </header>
    {#if change.turns?.length}
      <p>关联轮次：{change.turns.join(", ")}</p>
    {/if}
  {/if}

  {#if diff}
    {#if diff.err}
      <p class="diff-viewer__error">{diff.err}</p>
    {:else if diff.binary}
      <p>二进制文件无法显示文本差异。</p>
    {:else if diff.diff}
      <div class="diff-viewer__summary">
        <span>{diff.kind}</span>
        {#if diff.oldPath}
          <span>原路径：{diff.oldPath}</span>
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
        <p>变更内容较大，当前差异已截断。</p>
      {/if}
    {:else}
      <p>此变更没有可显示的文本差异。</p>
    {/if}
  {:else if preview}
    {#if preview.err}
      <p class="diff-viewer__error">{preview.err}</p>
    {:else if preview.binary}
      <p>二进制文件无法预览。</p>
    {:else}
      <CodeBlock code={preview.body} {language} maxHeight={220} />
      {#if preview.truncated}
        <p>预览已在 {preview.size} 字节处截断。</p>
      {/if}
    {/if}
  {:else}
    <p>请选择变更文件以检查当前内容。</p>
  {/if}
</div>
