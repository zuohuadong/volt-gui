<script lang="ts">
  import { BarChart3, CalendarCheck, Check, ClipboardCheck, FileSearch, FileText, Files, ListTodo, PackageCheck, ShieldCheck, Wrench } from "@lucide/svelte";

  import type { OutcomeTemplate, TaskOutcomeTemplateID } from "../lib/workbench-ia";

  interface Props {
    templates: OutcomeTemplate[];
    selectedId: TaskOutcomeTemplateID;
    onSelect: (id: TaskOutcomeTemplateID) => void;
  }

  let { templates, selectedId, onSelect }: Props = $props();
  const icons = {
    "write-document": FileText,
    "organize-materials": Files,
    "meeting-followup": CalendarCheck,
    "analyze-data": BarChart3,
    "plan-work": ListTodo,
    "review-fix": Wrench,
    "build-diagnosis": FileSearch,
    "knowledge-change": ClipboardCheck,
    "issue-delivery": ShieldCheck,
    "release-acceptance": PackageCheck,
  } as const;
</script>

<section class="outcome-launcher" data-testid="outcome-template-launcher">
  <header><span>开始</span><div><strong>先选一个结果</strong><p>不知道从哪开始？选最接近的一项，也可以直接输入。</p></div></header>
  <div class="template-grid">
    {#each templates as template (template.id)}
      {@const Icon = icons[template.id]}
      <button
        class:active={selectedId === template.id}
        type="button"
        data-outcome-template={template.id}
        title={template.summary}
        aria-label={`${template.title}：${template.summary}`}
        onclick={() => onSelect(template.id)}
      >
        <span class="template-icon"><Icon size={17} /></span>
        <strong>{template.title}</strong>
        {#if selectedId === template.id}<Check size={15} />{/if}
        <span class="template-tooltip" role="tooltip">{template.summary}</span>
      </button>
    {/each}
  </div>
</section>

<style>
  .outcome-launcher {
    display: grid;
    gap: 12px;
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
    font-size: 15px;
    font-weight: 650;
    line-height: 1.35;
  }

  header p {
    margin: 0;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    line-height: 1.5;
  }

  .template-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(132px, 1fr));
    gap: 8px;
    overflow: visible;
  }

  button {
    appearance: none;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    min-width: 0;
    min-height: 54px;
    padding: 9px 10px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 8px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    text-align: left;
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease;
  }

  button:hover {
    z-index: 40;
    border-color: color-mix(in srgb, #1f2421 32%, var(--border, #dce1db));
    background: var(--muted, #edf0ec);
  }

  button.active {
    border-color: color-mix(in srgb, #0f7b55 58%, var(--border, #dce1db));
    background: color-mix(in srgb, var(--card, #fff) 94%, #0f7b55 6%);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, #0f7b55 12%, transparent);
  }

  button:focus-visible {
    z-index: 40;
    outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent);
    outline-offset: 2px;
  }

  .template-icon {
    display: grid;
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 6px;
    background: var(--muted, #edf0ec);
    color: var(--muted-foreground, #687169);
  }

  button.active .template-icon {
    background: color-mix(in srgb, #0f7b55 10%, var(--card, #fff));
    color: #0f7b55;
  }

  button strong {
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    font-weight: 650;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .template-tooltip {
    position: absolute;
    z-index: 20;
    top: calc(100% + 7px);
    left: 0;
    display: block;
    width: max-content;
    max-width: min(260px, calc(100vw - 32px));
    height: auto;
    padding: 7px 9px;
    border: 1px solid var(--border-strong, #c7cfc7);
    border-radius: 7px;
    background: var(--surface, #fff);
    color: var(--foreground, #1f2421);
    box-shadow: 0 8px 22px rgb(15 23 42 / 0.13);
    font-size: 11px;
    font-weight: 450;
    line-height: 1.45;
    opacity: 0;
    pointer-events: none;
    transform: translateY(-3px);
    transition: opacity 120ms ease, transform 120ms ease;
    white-space: normal;
  }

  button:hover .template-tooltip,
  button:focus-visible .template-tooltip {
    opacity: 1;
    transform: translateY(0);
  }

  button > :global(svg) {
    flex: 0 0 auto;
    margin-left: auto;
  }

  @media (max-width: 560px) {
    .template-grid {
      grid-template-columns: 1fr;
    }

    button {
      min-height: 48px;
    }

    .template-tooltip {
      right: 0;
      left: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button {
      transition: none;
    }

    .template-tooltip { transition: none; }
  }
</style>
