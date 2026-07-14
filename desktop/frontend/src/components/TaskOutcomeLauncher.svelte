<script lang="ts">
  import { Check, ClipboardCheck, FileSearch, PackageCheck, ShieldCheck, Wrench } from "@lucide/svelte";

  import type { OutcomeTemplate, TaskOutcomeTemplateID } from "../lib/workbench-ia";

  interface Props {
    templates: OutcomeTemplate[];
    selectedId: TaskOutcomeTemplateID;
    onSelect: (id: TaskOutcomeTemplateID) => void;
  }

  let { templates, selectedId, onSelect }: Props = $props();
  const icons = { "review-fix": Wrench, "build-diagnosis": FileSearch, "knowledge-change": ClipboardCheck, "issue-delivery": ShieldCheck, "release-acceptance": PackageCheck } as const;
</script>

<section class="outcome-launcher" data-testid="outcome-template-launcher">
  <header><span>第 1 步</span><div><strong>希望得到什么结果？</strong><p>结果模板约束任务输入，也生成可核验的交付收据。</p></div></header>
  <div class="template-grid">
    {#each templates as template (template.id)}
      {@const Icon = icons[template.id]}
      <button class:active={selectedId === template.id} type="button" data-outcome-template={template.id} onclick={() => onSelect(template.id)}>
        <span><Icon size={17} /></span>
        <div><strong>{template.title}</strong><p>{template.summary}</p></div>
        {#if selectedId === template.id}<Check size={15} />{/if}
      </button>
    {/each}
  </div>
</section>

<style>
  .outcome-launcher { display: grid; gap: 12px; width: min(100%, 820px); }
  header { display: flex; align-items: flex-start; gap: 10px; }
  header > span { padding: 4px 7px; border-radius: 999px; background: #222; color: #fff; font-size: 8px; font-weight: 700; }
  header div { display: grid; gap: 2px; }
  header strong { font-size: 15px; }
  header p { margin: 0; color: var(--aorist-muted, #667085); font-size: 10px; }
  .template-grid { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 7px; }
  button { display: grid; grid-template-columns: 28px minmax(0,1fr) auto; align-items: start; min-width: 0; min-height: 92px; padding: 10px; border: 1px solid var(--aorist-line, #dfe3e8); border-radius: 12px; background: #fff; color: inherit; text-align: left; }
  button:hover, button.active { border-color: #222; box-shadow: 0 7px 18px rgba(15,23,42,.07); }
  button > span { display: grid; place-items: center; width: 27px; height: 27px; border-radius: 8px; background: #f1f3f5; }
  button div { display: grid; min-width: 0; gap: 5px; }
  button strong { font-size: 10px; }
  button p { margin: 0; color: var(--aorist-muted, #667085); font-size: 8.5px; line-height: 1.45; }
  @media (max-width: 1100px) { .template-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } }
  @media (max-width: 560px) { .template-grid { grid-template-columns: 1fr; } button { min-height: 72px; } }
</style>
