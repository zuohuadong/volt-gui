<script lang="ts">
  import { ArrowDown, ArrowUp, CornerDownRight, MoreHorizontal, Pencil, Play, Trash2, X } from "@lucide/svelte";

  import type { QueuedThreadMessage } from "../lib/task-lifecycle";

  let {
    messages,
    onEdit,
    onDelete,
    onMove,
    onSteer,
    onResume,
  }: {
    messages: QueuedThreadMessage[];
    onEdit: (id: string, display: string) => void;
    onDelete: (id: string) => void;
    onMove: (id: string, offset: -1 | 1) => void;
    onSteer: (id: string) => void | Promise<void>;
    onResume: (id: string) => void;
  } = $props();

  let editingId = $state("");
  let editDraft = $state("");

  function beginEdit(message: QueuedThreadMessage) {
    editingId = message.id;
    editDraft = message.display;
  }

  function cancelEdit() {
    editingId = "";
    editDraft = "";
  }

  function saveEdit(id: string) {
    const value = editDraft.trim();
    if (!value) return;
    onEdit(id, value);
    cancelEdit();
  }

  function statusLabel(message: QueuedThreadMessage) {
    if (message.status === "paused") return "已暂停";
    if (message.status === "sending") return "发送中";
    if (message.status === "failed") return "发送失败";
    return "待发送";
  }
</script>

{#if messages.length}
  <section class="thread-queue" aria-label="Thread 待发送消息" data-testid="thread-message-queue">
    <header>
      <div>
        <strong>后续消息</strong>
        <span>{messages.length} 条，将按顺序处理</span>
      </div>
      <em>可立即指导当前 Turn</em>
    </header>

    <div class="thread-queue__list">
      {#each messages as message, index (message.id)}
        <article class:paused={message.status === "paused"} class:failed={message.status === "failed"}>
          <div class="thread-queue__index">{index + 1}</div>
          <div class="thread-queue__content">
            {#if editingId === message.id}
              <textarea bind:value={editDraft} rows="2" aria-label={`编辑第 ${index + 1} 条后续消息`}></textarea>
              <div class="thread-queue__edit-actions">
                <button type="button" onclick={() => saveEdit(message.id)}>保存</button>
                <button type="button" onclick={cancelEdit}><X size={13} /> 取消</button>
              </div>
            {:else}
              <p>{message.display}</p>
              <span>{statusLabel(message)}{message.error ? ` · ${message.error}` : ""}</span>
            {/if}
          </div>
          {#if editingId !== message.id}
            <div class="thread-queue__actions">
              {#if message.status === "paused" || message.status === "failed"}
                <button type="button" title="恢复到待发送队列" onclick={() => onResume(message.id)}><Play size={13} /> 恢复</button>
              {/if}
              <button class="thread-queue__steer" type="button" title="立即作为当前 Turn 指导发送" disabled={message.status === "sending"} onclick={() => onSteer(message.id)}><CornerDownRight size={13} /> Steer</button>
              <details class="thread-queue__more">
                <summary aria-label={`第 ${index + 1} 条消息的更多操作`} title="更多操作"><MoreHorizontal size={14} /></summary>
                <div>
                  <button type="button" disabled={message.status === "sending"} onclick={() => beginEdit(message)}><Pencil size={13} /> 编辑</button>
                  <button type="button" disabled={index === 0 || message.status === "sending"} onclick={() => onMove(message.id, -1)}><ArrowUp size={13} /> 上移</button>
                  <button type="button" disabled={index === messages.length - 1 || message.status === "sending"} onclick={() => onMove(message.id, 1)}><ArrowDown size={13} /> 下移</button>
                  <button class="danger" type="button" disabled={message.status === "sending"} onclick={() => onDelete(message.id)}><Trash2 size={13} /> 删除</button>
                </div>
              </details>
            </div>
          {/if}
        </article>
      {/each}
    </div>
  </section>
{/if}

<style>
  .thread-queue {
    display: grid;
    gap: 10px;
    margin: 0 12px 10px;
    padding: 11px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 12px;
    background: var(--card, #fff);
  }

  header,
  header > div,
  article,
  .thread-queue__actions,
  .thread-queue__edit-actions {
    display: flex;
    align-items: center;
  }

  header {
    justify-content: space-between;
    gap: 12px;
  }

  header > div {
    min-width: 0;
    gap: 7px;
  }

  header strong {
    color: var(--foreground, #1f2421);
    font-size: 12px;
    font-weight: 650;
  }

  header span,
  header em,
  .thread-queue__content > span {
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-style: normal;
    line-height: 1.4;
  }

  .thread-queue__list {
    display: grid;
    gap: 6px;
    /* 让工作台外层负责滚动，避免行内浮层被局部滚动容器裁切。 */
    overflow: visible;
  }

  article {
    gap: 8px;
    min-width: 0;
    min-height: 44px;
    padding: 7px 8px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 80%, transparent);
    border-radius: 8px;
    background: var(--card, #fff);
    transition: border-color 150ms ease, background 150ms ease;
  }

  article.paused {
    background: color-mix(in srgb, var(--card, #fff) 92%, #9a5b00 8%);
  }

  article.failed {
    border-color: color-mix(in srgb, var(--destructive, #b42318) 28%, var(--border, #dce1db));
  }

  .thread-queue__index {
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    border-radius: 5px;
    background: var(--muted, #edf0ec);
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-weight: 700;
  }

  .thread-queue__content {
    min-width: 0;
    flex: 1;
  }

  .thread-queue__content p {
    display: -webkit-box;
    overflow: hidden;
    margin: 0 0 3px;
    color: var(--foreground, #1f2421);
    font-size: 12px;
    line-height: 1.45;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  textarea {
    width: 100%;
    box-sizing: border-box;
    resize: vertical;
    min-height: 58px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 7px;
    padding: 8px 9px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    font: inherit;
    font-size: 12px;
    line-height: 1.5;
  }

  .thread-queue__actions,
  .thread-queue__edit-actions {
    flex: 0 0 auto;
    gap: 3px;
  }

  .thread-queue__more {
    position: relative;
  }

  .thread-queue__more summary {
    display: grid;
    width: 32px;
    height: 32px;
    place-items: center;
    border: 1px solid var(--border, #dce1db);
    border-radius: 6px;
    background: var(--card, #fff);
    color: var(--muted-foreground, #687169);
    cursor: pointer;
    list-style: none;
    transition: border-color 150ms ease, background 150ms ease;
  }

  .thread-queue__more summary::-webkit-details-marker {
    display: none;
  }

  .thread-queue__more summary:hover {
    border-color: color-mix(in srgb, var(--primary, #1f2421) 30%, var(--border, #dce1db));
    background: var(--muted, #edf0ec);
  }

  .thread-queue__more summary:focus-visible {
    outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent);
    outline-offset: 2px;
  }

  .thread-queue__more > div {
    position: absolute;
    top: calc(100% + 5px);
    right: 0;
    z-index: 20;
    display: grid;
    gap: 2px;
    width: 128px;
    padding: 5px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 8px;
    background: var(--card, #fff);
    box-shadow: 0 12px 30px rgb(15 23 42 / 0.12);
  }

  .thread-queue__more > div button {
    width: 100%;
    justify-content: flex-start;
    border-color: transparent;
  }

  .thread-queue__more > div button.danger {
    color: var(--destructive, #b42318);
  }

  .thread-queue__steer {
    color: #0f7b55;
    font-weight: 650;
  }

  button {
    appearance: none;
    display: inline-flex;
    min-width: 32px;
    min-height: 32px;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 6px;
    padding: 0 8px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    cursor: pointer;
    font-size: 11px;
    font-weight: 550;
    transition: border-color 150ms ease, background 150ms ease, color 150ms ease;
  }

  button:hover:not(:disabled) {
    border-color: color-mix(in srgb, var(--primary, #1f2421) 30%, var(--border, #dce1db));
    background: var(--muted, #edf0ec);
  }

  button:focus-visible,
  textarea:focus-visible {
    outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent);
    outline-offset: 2px;
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.4;
  }

  @media (max-width: 640px) {
    header {
      align-items: flex-start;
      flex-direction: column;
      gap: 2px;
    }

    article {
      align-items: flex-start;
      flex-wrap: wrap;
    }

    .thread-queue__actions {
      width: 100%;
      justify-content: flex-end;
      padding-left: 25px;
    }

    button,
    .thread-queue__more summary {
      min-height: 40px;
    }

    .thread-queue__more summary {
      width: 40px;
      height: 40px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    article,
    button {
      transition: none;
    }

    .thread-queue__more summary {
      transition: none;
    }
  }
</style>
