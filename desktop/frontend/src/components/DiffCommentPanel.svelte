<script lang="ts">
  import { Check, MessageSquarePlus, RotateCcw, Trash2, WandSparkles } from "@lucide/svelte";

  import { diffRevision } from "../lib/diff-review";
  import type { DiffReviewComment } from "../lib/diff-review";

  interface Props {
    path: string;
    diff: string;
    comments?: DiffReviewComment[];
    onAdd?: (path: string, revision: string, line: number, body: string) => void;
    onResolve?: (id: string, resolved: boolean) => void;
    onDelete?: (id: string) => void;
    onRequestFix?: (path: string) => void | Promise<void>;
  }

  let {
    path,
    diff,
    comments = [],
    onAdd = () => undefined,
    onResolve = () => undefined,
    onDelete = () => undefined,
    onRequestFix = () => undefined,
  }: Props = $props();

  let selectedLine = $state(1);
  let body = $state("");

  const lines = $derived(diff.split("\n"));
  const activeLine = $derived(Math.min(Math.max(selectedLine, 1), Math.max(lines.length, 1)));
  const activeLineText = $derived(lines[activeLine - 1] || "空行");
  const revision = $derived(diffRevision(diff));
  const pathComments = $derived(comments.filter((comment) => comment.path === path && comment.revision === revision));
  const openComments = $derived(pathComments.filter((comment) => comment.status === "open"));

  function addComment() {
    const text = body.trim();
    if (!text || activeLine < 1) return;
    onAdd(path, revision, activeLine, text);
    body = "";
  }
</script>

<details class="diff-comments" data-testid="diff-comment-panel">
  <summary>
    <span><MessageSquarePlus size={14} /> 行级评论</span>
    <em>{openComments.length} 条待处理</em>
  </summary>

  <div class="diff-comments__layout">
    <div class="diff-comments__entry">
      <div class="diff-comments__locator">
        <label>
          <span>定位到 Diff 行</span>
          <input
            type="number"
            min="1"
            max={Math.max(lines.length, 1)}
            value={activeLine}
            oninput={(event) => (selectedLine = Number(event.currentTarget.value) || 1)}
          />
        </label>
        <code title={activeLineText}>{activeLineText}</code>
      </div>
      <label>
        <span>评论 Diff 第 {activeLine} 行</span>
        <textarea rows="4" placeholder="说明问题、期望行为或验证要求" bind:value={body}></textarea>
      </label>
      <button class="comment" type="button" disabled={!body.trim()} onclick={addComment}><MessageSquarePlus size={13} /> 添加评论</button>
    </div>

    <aside>
      <div class="diff-comments__list">
        {#each pathComments as comment (comment.id)}
          <article class:resolved={comment.status === "resolved"}>
            <header><strong>Diff 第 {comment.line} 行</strong><em>{comment.status === "resolved" ? "已处理" : "待处理"}</em></header>
            <p>{comment.body}</p>
            <div>
              <button type="button" onclick={() => onResolve(comment.id, comment.status !== "resolved")}>
                {#if comment.status === "resolved"}<RotateCcw size={12} /> 重新打开{:else}<Check size={12} /> 标记处理{/if}
              </button>
              <button class="danger" type="button" onclick={() => onDelete(comment.id)}><Trash2 size={12} /> 删除</button>
            </div>
          </article>
        {:else}
          <p class="diff-comments__empty">输入 Diff 行号，添加可驱动修复的评论。</p>
        {/each}
      </div>

      <button class="fix" type="button" disabled={!openComments.length} onclick={() => onRequestFix(path)}><WandSparkles size={13} /> 发送 {openComments.length} 条评论去修复</button>
    </aside>
  </div>
</details>

<style>
  .diff-comments {
    margin-top: 12px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 12px;
    background: var(--card, #fff);
  }

  .diff-comments[open] {
    box-shadow: 0 8px 24px rgb(15 23 42 / 0.045);
  }

  summary {
    display: flex;
    min-height: 42px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 12px;
    border-radius: 12px;
    cursor: pointer;
    transition: background 150ms ease;
  }

  summary:hover {
    background: var(--muted, #edf0ec);
  }

  summary:focus-visible {
    outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent);
    outline-offset: 2px;
  }

  summary span {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    color: var(--foreground, #1f2421);
    font-size: 12px;
    font-weight: 650;
  }

  summary em {
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-style: normal;
  }

  .diff-comments__layout {
    display: grid;
    grid-template-columns: minmax(260px, 0.75fr) minmax(0, 1.25fr);
    gap: 12px;
    padding: 0 12px 12px;
  }

  .diff-comments__entry {
    display: grid;
    align-content: start;
    gap: 9px;
    padding: 10px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 80%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--card, #fff) 96%, var(--muted, #edf0ec));
  }

  .diff-comments__locator {
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    align-items: end;
    gap: 8px;
  }

  .diff-comments__locator code {
    overflow: hidden;
    min-height: 34px;
    padding: 7px 9px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 82%, transparent);
    border-radius: 6px;
    background: #111713;
    color: #d7ddd8;
    font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    text-overflow: ellipsis;
    white-space: pre;
  }

  aside {
    display: grid;
    align-content: start;
    gap: 9px;
  }

  label {
    display: grid;
    gap: 6px;
    color: var(--muted-foreground, #687169);
    font-size: 12px;
    font-weight: 600;
  }

  input,
  textarea {
    box-sizing: border-box;
    width: 100%;
    padding: 9px 10px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 8px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    font: inherit;
    font-size: 12px;
    line-height: 1.5;
  }

  input {
    min-height: 34px;
    padding-block: 0;
    font-variant-numeric: tabular-nums;
  }

  textarea {
    resize: vertical;
  }

  input:focus-visible,
  textarea:focus-visible {
    outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent);
    outline-offset: 1px;
  }

  .diff-comments__entry > button,
  aside > button,
  article button {
    appearance: none;
    display: inline-flex;
    min-height: 32px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 10px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 6px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    font: inherit;
    font-size: 11px;
    font-weight: 550;
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
  }

  .diff-comments__entry > button:hover:not(:disabled),
  aside > button:hover:not(:disabled),
  article button:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--primary, #1f2421) 30%, var(--border, #dce1db));
    background: var(--muted, #edf0ec);
  }

  button:focus-visible {
    outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  aside > button.fix {
    border-color: #0f7b55;
    background: #0f7b55;
    color: #fff;
  }

  aside > button.fix:hover:not(:disabled) {
    background: color-mix(in srgb, #0f7b55 88%, white);
    color: #fff;
  }

  .diff-comments__list {
    display: grid;
    gap: 7px;
    max-height: 240px;
    overflow: auto;
  }

  .diff-comments__entry > button.comment {
    justify-self: start;
  }

  article {
    display: grid;
    gap: 6px;
    padding: 9px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 80%, transparent);
    border-radius: 8px;
    background: var(--muted, #edf0ec);
  }

  article.resolved {
    opacity: 0.66;
  }

  article header,
  article div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  article strong {
    color: var(--foreground, #1f2421);
    font-size: 12px;
    font-weight: 650;
  }

  article em {
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-style: normal;
  }

  article p,
  .diff-comments__empty {
    margin: 0;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    line-height: 1.5;
  }

  article div {
    justify-content: flex-start;
  }

  article button.danger {
    color: var(--destructive, #b42318);
  }

  @media (max-width: 820px) {
    .diff-comments__layout {
      grid-template-columns: 1fr;
    }

    input,
    aside > button,
    .diff-comments__entry > button,
    article button {
      min-height: 40px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    summary,
    button {
      transition: none;
    }
  }
</style>
