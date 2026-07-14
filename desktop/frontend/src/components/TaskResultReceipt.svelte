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
      <article class:failed={section.status === "failed"} class:ready={section.status === "ready"}>
        <div>
          {#if section.status === "ready"}<CheckCircle2 size={14} />{:else if section.status === "failed"}<AlertCircle size={14} />{:else}<Clock3 size={14} />{/if}
          <strong>{labels[sectionId]}</strong>
        </div>
        {#if section.items.length}<ul>{#each section.items as item (item)}<li>{item}</li>{/each}</ul>{/if}
        <p>{section.note}</p>
      </article>
    {/each}
  </div>
</section>

<style>
  .receipt { display: grid; gap: 10px; padding: 13px; border: 1px solid var(--aorist-line, #dfe3e8); border-radius: 13px; background: #fff; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  header div { display: grid; gap: 2px; }
  header span { color: var(--aorist-muted, #667085); font-size: 8px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  header strong { font-size: 12px; }
  header em { padding: 4px 8px; border-radius: 999px; background: #fff3cd; color: #7a4d00; font-size: 8px; font-style: normal; font-weight: 700; }
  header em.failed { background: #fee4e2; color: #b42318; }
  .receipt-grid { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 6px; }
  article { min-width: 0; padding: 9px; border: 1px solid #eceff2; border-radius: 9px; background: #fafafa; }
  article.ready { background: #f3fbf6; }
  article.failed { background: #fff6f5; }
  article > div { display: flex; align-items: center; gap: 5px; }
  article strong { font-size: 9px; }
  article p, li { color: var(--aorist-muted, #667085); font-size: 8px; line-height: 1.45; }
  article p { margin: 5px 0 0; }
  ul { margin: 5px 0 0; padding-left: 14px; }
  @media (max-width: 980px) { .receipt-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 560px) { .receipt-grid { grid-template-columns: 1fr; } }
</style>
