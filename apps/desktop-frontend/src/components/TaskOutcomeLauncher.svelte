<script lang="ts">
  import { BarChart3, CalendarCheck, Check, ClipboardCheck, FileSearch, FileText, Files, ListTodo, PackageCheck, ShieldCheck, Wrench } from "@lucide/svelte";

  import type { OutcomeTemplate, TaskOutcomeTemplateID } from "../lib/workbench-ia";

  interface Props {
    templates: OutcomeTemplate[];
    selectedId: TaskOutcomeTemplateID;
    onSelect: (id: TaskOutcomeTemplateID) => void;
  }

  let { templates, selectedId, onSelect }: Props = $props();
  let moreTemplatesOpen = $state(false);
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
  <header><strong>想完成什么？</strong><p>选择一个方向，或直接在下方描述任务。</p></header>
  <div class="template-grid">
    {#each templates.slice(0, 3) as template (template.id)}
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
  {#if templates.length > 3}
    <div class="more-templates">
      <button
        class="more-templates__trigger"
        type="button"
        aria-expanded={moreTemplatesOpen}
        aria-controls="more-outcome-templates"
        onclick={() => (moreTemplatesOpen = !moreTemplatesOpen)}
      >
        {moreTemplatesOpen ? "收起模板" : "更多模板"}
      </button>
      {#if moreTemplatesOpen}
        <div id="more-outcome-templates" class="template-grid template-grid--more">
          {#each templates.slice(3) as template (template.id)}
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
      {/if}
    </div>
  {/if}
</section>

<style>
  .outcome-launcher {
    display: grid;
    gap: 18px;
    width: min(100%, 920px);
  }

  header {
    display: grid;
    justify-items: center;
    gap: 7px;
    text-align: center;
  }

  header strong {
    color: var(--foreground, #1f2421);
    font-size: clamp(25px, 3vw, 34px);
    font-weight: 560;
    line-height: 1.2;
    letter-spacing: -0.035em;
  }

  header p {
    margin: 0;
    color: var(--muted-foreground, #687169);
    font-size: 12px;
    line-height: 1.5;
  }

  .template-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 12px;
    overflow: visible;
  }

  .template-grid button {
    appearance: none;
    position: relative;
    display: flex;
    align-items: start;
    align-content: space-between;
    justify-content: flex-start;
    gap: 22px;
    min-width: 0;
    min-height: 126px;
    padding: 16px;
    border: 1px solid var(--border, #dce1db);
    border-radius: 14px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    text-align: left;
    cursor: pointer;
    transition: border-color 150ms ease, background 150ms ease;
  }

  .template-grid button:hover {
    z-index: 40;
    border-color: color-mix(in srgb, #1f2421 32%, var(--border, #dce1db));
    background: var(--muted, #edf0ec);
  }

  .template-grid button.active {
    border-color: color-mix(in srgb, var(--foreground, #1f2421) 44%, var(--border, #dce1db));
    background: color-mix(in srgb, var(--card, #fff) 94%, var(--foreground, #1f2421) 6%);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--foreground, #1f2421) 8%, transparent);
  }

  .template-grid button:focus-visible {
    z-index: 40;
    outline: 2px solid color-mix(in srgb, var(--foreground, #1f2421) 48%, transparent);
    outline-offset: 2px;
  }

  .template-icon {
    display: grid;
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    place-items: center;
    border-radius: 6px;
    background: color-mix(in srgb, var(--card, #fff) 78%, var(--muted, #edf0ec));
    color: var(--muted-foreground, #687169);
  }

  .template-grid button.active .template-icon {
    background: color-mix(in srgb, var(--foreground, #1f2421) 10%, var(--card, #fff));
    color: var(--foreground, #1f2421);
  }

  .template-grid button strong {
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

  .template-grid button:hover .template-tooltip,
  .template-grid button:focus-visible .template-tooltip {
    opacity: 1;
    transform: translateY(0);
  }

  .template-grid button > :global(svg) {
    flex: 0 0 auto;
    margin-left: auto;
  }

  .more-templates {
    justify-self: center;
    width: 100%;
  }

  .more-templates__trigger {
    display: block;
    width: max-content;
    min-height: 32px;
    margin: 0 auto;
    padding: 0 8px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    cursor: pointer;
  }

  .more-templates__trigger:hover {
    background: var(--muted, #edf0ec);
    color: var(--foreground, #1f2421);
  }

  .more-templates__trigger:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--accent, #2d6a4f) 48%, transparent);
    outline-offset: 2px;
  }

  .template-grid--more {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 12px;
  }

  .template-grid--more button {
    min-height: 72px;
    gap: 10px;
  }

  @media (max-width: 560px) {
    .template-grid {
      grid-template-columns: 1fr;
    }

    .template-grid button {
      min-height: 48px;
    }

    .template-tooltip {
      right: 0;
      left: auto;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .template-grid button {
      transition: none;
    }

    .template-tooltip { transition: none; }
  }
</style>
