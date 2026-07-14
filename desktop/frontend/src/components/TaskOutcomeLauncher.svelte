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
  .outcome-launcher {
    display: grid;
    gap: 16px;
    width: min(100%, 920px);
  }

  header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  header > span {
    flex: 0 0 auto;
    padding: 4px 8px;
    border-radius: 999px;
    background: #1f2421;
    color: #fff;
    font-size: 11px;
    font-weight: 650;
    line-height: 1.35;
  }

  header div {
    display: grid;
    gap: 4px;
  }

  header strong {
    color: var(--foreground, #1f2421);
    font-size: 16px;
    font-weight: 650;
    line-height: 1.35;
  }

  header p {
    margin: 0;
    color: var(--muted-foreground, #687169);
    font-size: 12px;
    line-height: 1.5;
  }

  .template-grid {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 8px;
  }

  button {
    appearance: none;
    display: grid;
    grid-template-columns: 34px minmax(0, 1fr) auto;
    align-items: start;
    gap: 10px;
    min-width: 0;
    min-height: 116px;
    padding: 12px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 12px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    box-shadow: 0 1px 0 rgb(15 23 42 / 0.02);
    text-align: left;
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease, box-shadow 150ms ease, transform 150ms ease;
  }

  button:hover {
    border-color: color-mix(in srgb, #1f2421 32%, var(--border, #dce1db));
    box-shadow: 0 8px 24px rgb(15 23 42 / 0.06);
    transform: translateY(-1px);
  }

  button.active {
    border-color: color-mix(in srgb, #0f7b55 58%, var(--border, #dce1db));
    background: color-mix(in srgb, var(--card, #fff) 94%, #0f7b55 6%);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #0f7b55 12%, transparent);
  }

  button:focus-visible {
    outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent);
    outline-offset: 2px;
  }

  button > span {
    display: grid;
    width: 34px;
    height: 34px;
    place-items: center;
    border-radius: 8px;
    background: var(--muted, #edf0ec);
    color: var(--muted-foreground, #687169);
  }

  button.active > span {
    background: color-mix(in srgb, #0f7b55 10%, var(--card, #fff));
    color: #0f7b55;
  }

  button div {
    display: grid;
    min-width: 0;
    gap: 5px;
  }

  button strong {
    font-size: 12px;
    font-weight: 650;
    line-height: 1.4;
  }

  button p {
    margin: 0;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    line-height: 1.5;
  }

  @media (max-width: 1100px) {
    .template-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 560px) {
    .template-grid {
      grid-template-columns: 1fr;
    }

    button {
      min-height: 92px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }

    button:hover {
      transform: none;
    }
  }
</style>
