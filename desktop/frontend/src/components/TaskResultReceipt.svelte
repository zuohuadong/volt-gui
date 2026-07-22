<script lang="ts">
  import { AlertCircle, CheckCircle2, Clock3 } from "@lucide/svelte";

  import type { ReceiptSectionID, TaskResultReceipt } from "../lib/workbench-ia";

  interface Props { receipt: TaskResultReceipt; }
  let { receipt }: Props = $props();

  const labels: Record<ReceiptSectionID, string> = {
    goal: "目标",
    runtime: "执行配置",
    changes: "改动",
    verification: "验证",
    artifacts: "产物",
    dataPath: "数据去向",
    rollback: "回滚",
  };
  const order = Object.keys(labels) as ReceiptSectionID[];
</script>

<section class="receipt" data-testid="task-result-receipt" data-receipt-state={receipt.state}>
  <header>
    <div><span>Task Result Receipt</span><strong>可验证交付收据</strong></div>
    <em class:failed={receipt.state === "failed"}>{receipt.state === "running" ? "执行中" : receipt.state === "failed" ? "失败待处理" : "待证据复核"}</em>
  </header>
  <div class="receipt-grid">
    {#each order as sectionId (sectionId)}
      {@const section = receipt.sections[sectionId]}
      <article class:failed={section.status === "failed"} class:ready={section.status === "ready"} data-receipt-section={sectionId}>
        <div>
          {#if section.status === "ready"}<CheckCircle2 size={14} />{:else if section.status === "failed"}<AlertCircle size={14} />{:else}<Clock3 size={14} />{/if}
          <strong>{labels[sectionId]}</strong>
        </div>
        {#if section.items.length}<ul>{#each section.items as item (item)}<li title={item}>{item}</li>{/each}</ul>{/if}
        <p>{section.note}</p>
      </article>
    {/each}
  </div>
</section>

<style>
  .receipt {
    display: grid;
    gap: 12px;
    padding: 14px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 12px;
    background: var(--card, #fff);
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  header div {
    display: grid;
    gap: 3px;
  }

  header span {
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.06em;
    line-height: 1.35;
    text-transform: uppercase;
  }

  header strong {
    color: var(--foreground, #1f2421);
    font-size: 14px;
    font-weight: 650;
    line-height: 1.35;
  }

  header em {
    padding: 5px 9px;
    border-radius: 999px;
    background: #fff4de;
    color: #9a5b00;
    font-size: 11px;
    font-style: normal;
    font-weight: 650;
    line-height: 1.35;
    white-space: nowrap;
  }

  header em.failed {
    background: #fdecea;
    color: var(--destructive, #b42318);
  }

  .receipt-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    grid-auto-rows: 1fr;
    gap: 8px;
  }

  article {
    display: grid;
    grid-column: span 4;
    align-content: start;
    min-width: 0;
    min-height: 112px;
    padding: 10px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 78%, transparent);
    border-radius: 8px;
    background: var(--muted, #edf0ec);
  }

  article.ready {
    border-color: color-mix(in srgb, #0f7b55 22%, var(--border, #dce1db));
    background: color-mix(in srgb, var(--card, #fff) 91%, #0f7b55 9%);
  }

  article.failed {
    border-color: color-mix(in srgb, var(--destructive, #b42318) 24%, var(--border, #dce1db));
    background: #fff7f6;
  }

  article[data-receipt-section="goal"],
  article[data-receipt-section="runtime"],
  article[data-receipt-section="dataPath"],
  article[data-receipt-section="rollback"] {
    grid-column: span 6;
  }

  article > div {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--muted-foreground, #687169);
  }

  article.ready > div {
    color: #0f7b55;
  }

  article.failed > div {
    color: var(--destructive, #b42318);
  }

  article strong {
    color: var(--foreground, #1f2421);
    font-size: 12px;
    font-weight: 650;
    line-height: 1.4;
  }

  article p,
  li {
    min-width: 0;
    overflow-wrap: anywhere;
    word-break: break-word;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    line-height: 1.5;
  }

  article p {
    margin: 6px 0 0;
  }

  ul {
    margin: 6px 0 0;
    padding-left: 16px;
  }

  li + li {
    margin-top: 4px;
  }

  @media (max-width: 980px) {
    article,
    article[data-receipt-section="goal"],
    article[data-receipt-section="runtime"],
    article[data-receipt-section="dataPath"],
    article[data-receipt-section="rollback"] {
      grid-column: span 6;
    }
  }

  @media (max-width: 560px) {
    header {
      align-items: flex-start;
      flex-direction: column;
    }

    .receipt-grid {
      grid-template-columns: 1fr;
      grid-auto-rows: auto;
    }

    article,
    article[data-receipt-section="goal"],
    article[data-receipt-section="runtime"],
    article[data-receipt-section="dataPath"],
    article[data-receipt-section="rollback"] {
      grid-column: auto;
      min-height: 0;
    }
  }
</style>
