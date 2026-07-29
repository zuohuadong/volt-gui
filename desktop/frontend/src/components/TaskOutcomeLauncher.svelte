<script lang="ts">
  import { BarChart3, CalendarCheck, Check, ClipboardCheck, FileSearch, FileText, Files, ListTodo, PackageCheck, ShieldCheck, Sparkles, Wrench } from "@lucide/svelte";

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

  const launchSteps = [
    { no: "01", title: "描述目标", desc: "用一句话说清想要的结果，可直接粘贴资料。" },
    { no: "02", title: "交给执行者", desc: "确认 Agent、模型与权限，其余交给它自动推进。" },
    { no: "03", title: "复核交付", desc: "只在需要你决定时打扰，每份结果都可回溯。" },
  ];
</script>

<section class="outcome-launcher" data-testid="outcome-template-launcher">
  <header>
    <span class="launcher-eyebrow"><Sparkles size={12} /> 开始新任务</span>
    <strong>想完成什么？</strong>
    <p>选择一个方向快速开始，或直接在下方描述你的任务。</p>
  </header>
  <div class="template-grid">
    {#each templates.slice(0, 3) as template (template.id)}
      {@const Icon = icons[template.id]}
      <button
        class:active={selectedId === template.id}
        type="button"
        data-outcome-template={template.id}
        aria-label={`${template.title}：${template.summary}`}
        onclick={() => onSelect(template.id)}
      >
        <span class="template-icon"><Icon size={16} /></span>
        {#if selectedId === template.id}<span class="template-check"><Check size={13} /></span>{/if}
        <strong>{template.title}</strong>
        <em>{template.summary}</em>
      </button>
    {/each}
  </div>
  {#if templates.length > 3}
    <details class="more-templates">
      <summary>更多模板</summary>
      <div class="template-grid template-grid--more">
        {#each templates.slice(3) as template (template.id)}
          {@const Icon = icons[template.id]}
          <button
            class:active={selectedId === template.id}
            type="button"
            data-outcome-template={template.id}
            aria-label={`${template.title}：${template.summary}`}
            onclick={() => onSelect(template.id)}
          >
            <span class="template-icon"><Icon size={16} /></span>
            {#if selectedId === template.id}<span class="template-check"><Check size={13} /></span>{/if}
            <strong>{template.title}</strong>
            <em>{template.summary}</em>
          </button>
        {/each}
      </div>
    </details>
  {/if}
  <ol class="launch-steps" aria-label="上手三步">
    {#each launchSteps as step (step.no)}
      <li>
        <b>{step.no}</b>
        <div><strong>{step.title}</strong><span>{step.desc}</span></div>
      </li>
    {/each}
  </ol>
</section>

<style>
  .outcome-launcher {
    display: grid;
    gap: 22px;
    width: min(100%, 920px);
  }

  header {
    display: grid;
    justify-items: center;
    gap: 9px;
    text-align: center;
  }

  .launcher-eyebrow {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    min-height: 24px;
    padding: 0 11px;
    border: 1px solid color-mix(in srgb, var(--accent, #2d6a4f) 22%, var(--border, #dce1db));
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent, #2d6a4f) 6%, var(--card, #fff));
    color: color-mix(in srgb, var(--accent, #2d6a4f) 82%, var(--foreground, #1f2421));
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  header strong {
    color: var(--foreground, #1f2421);
    font-size: clamp(26px, 3vw, 34px);
    font-weight: 600;
    line-height: 1.2;
    letter-spacing: -0.035em;
  }

  header p {
    margin: 0;
    color: var(--muted-foreground, #687169);
    font-size: 12.5px;
    line-height: 1.55;
  }

  .template-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  button {
    appearance: none;
    position: relative;
    display: grid;
    align-content: start;
    justify-items: start;
    gap: 8px;
    min-width: 0;
    min-height: 128px;
    padding: 14px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 82%, transparent);
    border-radius: 14px;
    background: var(--card, #fff);
    color: var(--foreground, #1f2421);
    text-align: left;
    cursor: pointer;
    transition: border-color 160ms ease, background 160ms ease;
  }

  button:hover {
    z-index: 2;
    border-color: color-mix(in srgb, var(--accent, #2d6a4f) 34%, var(--border, #dce1db));
    background: var(--muted, #edf0ec);
  }

  button.active {
    border-color: color-mix(in srgb, var(--accent, #2d6a4f) 52%, var(--border, #dce1db));
    background: color-mix(in srgb, var(--accent, #2d6a4f) 5%, var(--card, #fff));
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent, #2d6a4f) 18%, transparent);
  }

  button:focus-visible {
    z-index: 2;
    outline: 2px solid color-mix(in srgb, var(--accent, #2d6a4f) 48%, transparent);
    outline-offset: 2px;
  }

  .template-icon {
    display: grid;
    width: 30px;
    height: 30px;
    place-items: center;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 70%, transparent);
    border-radius: 9px;
    background: color-mix(in srgb, var(--muted, #edf0ec) 62%, var(--card, #fff));
    color: color-mix(in srgb, var(--foreground, #1f2421) 72%, var(--muted-foreground, #687169));
    transition: color 160ms ease, border-color 160ms ease;
  }

  button:hover .template-icon,
  button.active .template-icon {
    border-color: color-mix(in srgb, var(--accent, #2d6a4f) 30%, var(--border, #dce1db));
    color: color-mix(in srgb, var(--accent, #2d6a4f) 88%, var(--foreground, #1f2421));
  }

  .template-check {
    position: absolute;
    top: 10px;
    right: 10px;
    display: grid;
    width: 20px;
    height: 20px;
    place-items: center;
    border-radius: 999px;
    background: color-mix(in srgb, var(--accent, #2d6a4f) 92%, #000);
    color: #fff;
  }

  button strong {
    min-width: 0;
    overflow: hidden;
    font-size: 12.5px;
    font-weight: 650;
    line-height: 1.4;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  button em {
    display: -webkit-box;
    overflow: hidden;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    font-style: normal;
    font-weight: 450;
    line-height: 1.5;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }

  .more-templates {
    justify-self: center;
    width: 100%;
  }

  .more-templates > summary {
    width: max-content;
    margin: 0 auto;
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    cursor: pointer;
  }

  .template-grid--more {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 12px;
  }

  .template-grid--more button {
    min-height: 104px;
  }

  .launch-steps {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .launch-steps li {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-width: 0;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--border, #dce1db) 62%, transparent);
    border-radius: 12px;
    background: var(--surface-muted, #f1f1ef);
  }

  .launch-steps b {
    flex: 0 0 auto;
    margin-top: 1px;
    color: color-mix(in srgb, var(--accent, #2d6a4f) 58%, var(--muted-foreground, #687169));
    font-size: 11px;
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.04em;
  }

  .launch-steps li > div {
    display: grid;
    gap: 3px;
    min-width: 0;
  }

  .launch-steps strong {
    color: var(--foreground, #1f2421);
    font-size: 12px;
    font-weight: 600;
  }

  .launch-steps span {
    color: var(--muted-foreground, #687169);
    font-size: 11px;
    line-height: 1.5;
  }

  @media (max-width: 640px) {
    .template-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .launch-steps {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 560px) {
    .template-grid {
      grid-template-columns: 1fr;
    }

    button {
      min-height: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    button,
    .template-icon {
      transition: none;
    }
  }
</style>
