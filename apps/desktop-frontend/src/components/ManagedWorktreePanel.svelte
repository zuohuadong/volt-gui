<script lang="ts">
  import { ArrowRightLeft, Camera, ChevronDown, ExternalLink, GitBranch, Plus, RefreshCw, RotateCcw } from "@lucide/svelte";

  import type { ManagedWorktree, ManagedWorktreeSnapshot } from "../lib/types";

  interface Props {
    repositoryRoot?: string;
    worktrees?: ManagedWorktree[];
    snapshots?: ManagedWorktreeSnapshot[];
    busy?: boolean;
    message?: string;
    onRefresh?: () => void | Promise<void>;
    onCreate?: (name: string) => void | Promise<void>;
    onOpen?: (worktree: ManagedWorktree) => void | Promise<void>;
    onSnapshot?: (worktreeId: string) => void | Promise<void>;
    onRestore?: (snapshotId: string, targetWorktreeId: string) => void | Promise<void>;
    onHandoff?: (sourceWorktreeId: string, targetWorktreeId: string, summary: string) => void | Promise<void>;
  }

  let {
    repositoryRoot = "",
    worktrees = [],
    snapshots = [],
    busy = false,
    message = "",
    onRefresh = () => undefined,
    onCreate = () => undefined,
    onOpen = () => undefined,
    onSnapshot = () => undefined,
    onRestore = () => undefined,
    onHandoff = () => undefined,
  }: Props = $props();

  let createName = $state("");
  let sourceWorktreeId = $state("");
  let targetWorktreeId = $state("");
  let restoreTargetWorktreeId = $state("");
  let summary = $state("");
  let expanded = $state(false);

  const readyWorktrees = $derived(worktrees.filter((worktree) => worktree.status === "ready"));

  function createWorktree() {
    const name = createName.trim();
    if (!name) return;
    onCreate(name);
    createName = "";
  }
</script>

<section class="worktree-panel" data-testid="managed-worktree-panel">
  <header>
    <div><span>隔离工作区</span><strong>隔离工作区与安全交接</strong><em>{repositoryRoot || "请选择 Git 工作区"}</em></div>
    <div class="worktree-panel__header-actions">
      <button type="button" disabled={busy || !repositoryRoot} onclick={onRefresh}><RefreshCw size={13} /> 刷新</button>
      <button class="worktree-panel__toggle" class:expanded type="button" aria-expanded={expanded} onclick={() => (expanded = !expanded)}>{expanded ? "收起" : "管理"}<ChevronDown size={14} /></button>
    </div>
  </header>

  {#if expanded}
    <div class="worktree-panel__body">
      <div class="worktree-panel__create">
        <label><span>新工作区名称</span><input placeholder="例如 review-auth-flow" bind:value={createName} /></label>
        <button type="button" disabled={busy || !repositoryRoot || !createName.trim()} onclick={createWorktree}><Plus size={13} /> 创建隔离工作区</button>
      </div>

      <div class="worktree-panel__grid">
        <div class="worktree-panel__list">
          {#each worktrees as worktree (worktree.id)}
            <article class:missing={worktree.status !== "ready"}>
              <header><span><GitBranch size={13} /> {worktree.name}</span><em>{worktree.dirty ? "有变更" : worktree.status === "ready" ? "干净" : "路径缺失"}</em></header>
              <p>{worktree.path}</p>
              <small>{worktree.branch || "detached HEAD"} · {worktree.head?.slice(0, 8) || "HEAD 未知"}</small>
              <div>
                <button type="button" disabled={busy || worktree.status !== "ready"} onclick={() => onOpen(worktree)}><ExternalLink size={12} /> 打开</button>
                <button type="button" disabled={busy || worktree.status !== "ready"} onclick={() => onSnapshot(worktree.id)}><Camera size={12} /> 快照</button>
              </div>
            </article>
          {:else}
            <p class="worktree-panel__empty">尚未创建由 Volt 管理的隔离工作区。</p>
          {/each}
        </div>

        <aside>
          <section>
            <header><strong>安全交接</strong><span>源快照只会应用到同仓库、相同提交且干净的目标工作区。</span></header>
            <label><span>源工作区</span><select bind:value={sourceWorktreeId}><option value="">请选择</option>{#each readyWorktrees as worktree (worktree.id)}<option value={worktree.id}>{worktree.name}</option>{/each}</select></label>
            <label><span>目标工作区</span><select bind:value={targetWorktreeId}><option value="">请选择</option>{#each readyWorktrees.filter((worktree) => worktree.id !== sourceWorktreeId) as worktree (worktree.id)}<option value={worktree.id}>{worktree.name}</option>{/each}</select></label>
            <label><span>交接说明</span><textarea rows="2" placeholder="说明目标、当前状态和下一步" bind:value={summary}></textarea></label>
            <button class="primary" type="button" disabled={busy || !sourceWorktreeId || !targetWorktreeId} onclick={() => onHandoff(sourceWorktreeId, targetWorktreeId, summary)}><ArrowRightLeft size={13} /> 创建快照并交接</button>
          </section>

          <section>
            <header><strong>快照恢复</strong><span>恢复前目标工作区必须保持干净，不会覆盖已有改动。</span></header>
            <label><span>恢复目标</span><select bind:value={restoreTargetWorktreeId}><option value="">请选择干净工作区</option>{#each readyWorktrees.filter((worktree) => !worktree.dirty) as worktree (worktree.id)}<option value={worktree.id}>{worktree.name}</option>{/each}</select></label>
            <div class="worktree-panel__snapshots">
              {#each snapshots.slice(0, 6) as snapshot (snapshot.id)}
                <article><span>{snapshot.id.replace("snapshot-", "#")}</span><em>{snapshot.untrackedCount} 个未跟踪文件 · {snapshot.baseHead.slice(0, 8)}</em><button type="button" disabled={busy || !restoreTargetWorktreeId || snapshot.worktreeId === restoreTargetWorktreeId} onclick={() => onRestore(snapshot.id, restoreTargetWorktreeId)}><RotateCcw size={12} /> 恢复</button></article>
              {:else}
                <p class="worktree-panel__empty">暂无快照。</p>
              {/each}
            </div>
          </section>
        </aside>
      </div>
    </div>
  {/if}

  {#if message}<p class="worktree-panel__message">{message}</p>{/if}
</section>

<style>
  .worktree-panel {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 12px;
    background: var(--card, #fff);
  }

  .worktree-panel > header,
  .worktree-panel__create,
  article > header,
  article > div {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .worktree-panel > header div {
    display: grid;
    min-width: 0;
    gap: 3px;
  }

  .worktree-panel > header .worktree-panel__header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .worktree-panel__body {
    display: grid;
    gap: 12px;
    padding-top: 12px;
    border-top: 1px solid color-mix(in srgb, var(--border, #dce1db) 78%, transparent);
  }

  .worktree-panel > header span {
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .worktree-panel > header strong {
    color: var(--foreground, #1f2421);
    font-size: 16px;
    font-weight: 650;
    line-height: 1.35;
  }

  .worktree-panel > header em {
    overflow: hidden;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button {
    appearance: none;
    display: inline-flex;
    min-height: 34px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 11px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 6px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    font: inherit;
    font-size: 12px;
    font-weight: 550;
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
  }

  button:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--primary, #1f2421) 28%, var(--border, #dce1db));
    background: var(--muted, #edf0ec);
  }

  button:focus-visible,
  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  button.primary {
    border-color: #0f7b55;
    background: #0f7b55;
    color: #fff;
  }

  button.primary:hover:not(:disabled) {
    background: color-mix(in srgb, #0f7b55 88%, white);
    color: #fff;
  }

  button.worktree-panel__toggle :global(svg) {
    transition: transform 150ms ease;
  }

  button.worktree-panel__toggle.expanded :global(svg) {
    transform: rotate(180deg);
  }

  .worktree-panel__create {
    align-items: end;
    justify-content: flex-start;
    padding: 10px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 78%, transparent);
    border-radius: 8px;
    background: var(--muted, #edf0ec);
  }

  label {
    display: grid;
    min-width: 0;
    gap: 5px;
    color: var(--muted-foreground, #687169);
    font-size: 12px;
    font-weight: 600;
  }

  .worktree-panel__create label {
    flex: 1;
  }

  input,
  select,
  textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 34px;
    padding: 6px 9px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 6px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    font: inherit;
    font-size: 12px;
    line-height: 1.45;
  }

  textarea {
    resize: vertical;
  }

  .worktree-panel__grid {
    display: grid;
    grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
    gap: 12px;
  }

  .worktree-panel__list,
  aside,
  aside section,
  .worktree-panel__snapshots {
    display: grid;
    align-content: start;
    gap: 8px;
  }

  .worktree-panel__list > article,
  aside section {
    padding: 11px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 80%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--card, #fff) 96%, var(--muted, #edf0ec));
  }

  .worktree-panel__list > article {
    transition: border-color 150ms ease, box-shadow 150ms ease;
  }

  .worktree-panel__list > article:hover {
    border-color: color-mix(in srgb, var(--primary, #1f2421) 22%, var(--border, #dce1db));
    box-shadow: 0 8px 24px rgb(15 23 42 / 0.045);
  }

  .worktree-panel__list > article.missing {
    opacity: 0.6;
  }

  article header span {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    color: var(--foreground, #1f2421);
    font-size: 12px;
    font-weight: 650;
  }

  article header em,
  article small {
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-style: normal;
    line-height: 1.4;
  }

  article p {
    overflow: hidden;
    margin: 7px 0;
    color: var(--muted-foreground, #687169);
    font: 11px/1.45 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  article > div {
    justify-content: flex-start;
    margin-top: 8px;
  }

  aside section > header {
    display: grid;
    gap: 4px;
  }

  aside section > header strong {
    color: var(--foreground, #1f2421);
    font-size: 13px;
    font-weight: 650;
  }

  aside section > header span {
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    line-height: 1.5;
  }

  .worktree-panel__snapshots article {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 7px;
    padding: 7px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 82%, transparent);
    border-radius: 7px;
    background: var(--card, #fff);
  }

  .worktree-panel__snapshots span {
    color: var(--foreground, #1f2421);
    font-size: 11px;
    font-weight: 650;
  }

  .worktree-panel__snapshots em {
    overflow: hidden;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-style: normal;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .worktree-panel__empty,
  .worktree-panel__message {
    margin: 0;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    line-height: 1.5;
  }

  .worktree-panel__message {
    padding: 8px 10px;
    border-radius: 7px;
    background: var(--muted, #edf0ec);
  }

  @media (max-width: 900px) {
    .worktree-panel__grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .worktree-panel > header {
      align-items: flex-start;
      flex-direction: column;
    }

    .worktree-panel__create {
      align-items: stretch;
      flex-direction: column;
    }

    button,
    input,
    select {
      min-height: 40px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button,
    .worktree-panel__list > article,
    button.worktree-panel__toggle :global(svg) {
      transition: none;
    }
  }
</style>
