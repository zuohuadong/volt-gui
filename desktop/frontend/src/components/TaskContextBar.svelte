<script lang="ts">
  import {
    Bot,
    ChevronRight,
    Cpu,
    FolderKanban,
    Layers3,
    Menu,
    PanelRightOpen,
    ShieldCheck,
  } from "@lucide/svelte";

  interface Props {
    workspace: string;
    project: string;
    agent: string;
    model: string;
    permission: string;
    memory: string;
    memoryEmpty?: boolean;
    mode: "work" | "code";
    displayMode?: "office" | "developer";
    activeInspector: string;
    onOpenDrawer: () => void;
    onOpenAgent: () => void;
    onOpenModels: () => void;
    onOpenPermission: () => void;
    onOpenMemory: () => void;
    onInspector: (id: string) => void;
  }

  let {
    workspace,
    project,
    agent,
    model,
    permission,
    memory,
    memoryEmpty = false,
    mode,
    displayMode = "developer",
    activeInspector,
    onOpenDrawer,
    onOpenAgent,
    onOpenModels,
    onOpenPermission,
    onOpenMemory,
    onInspector,
  }: Props = $props();
  const officeMode = $derived(displayMode === "office");
  let configExpandedRequested = $state(false);
  const configExpanded = $derived(officeMode && configExpandedRequested);
  const inspectorItems = [
    { id: "task", label: "任务" },
    { id: "workspace", label: "工作区" },
    { id: "context", label: "上下文" },
    { id: "changes", label: "变更" },
    { id: "checkpoints", label: "检查点" },
  ];
</script>

<section class="task-context" data-testid="task-context-bar" aria-label="当前任务上下文">
  <button class="drawer-button" type="button" aria-label="打开导航抽屉" onclick={onOpenDrawer}><Menu size={16} /></button>
  <div class="context-location" title={`工作区：${workspace} / 项目：${project}`}>
    <FolderKanban size={15} />
    <strong>{workspace}</strong>
    <ChevronRight size={13} />
    <span>{project}</span>
  </div>
  <div class="context-controls" aria-label="当前执行配置">
    {#if officeMode && !configExpanded}
      <button class="config-toggle" type="button" aria-label="展开任务配置" aria-expanded={configExpanded} onclick={() => (configExpandedRequested = true)}><Bot size={14} /><span>任务配置</span></button>
    {:else}
    <button type="button" aria-label={`智能体配置：${agent}`} title={`智能体配置：${agent}`} onclick={onOpenAgent}><Bot size={14} /><span>{agent}</span></button>
    <button type="button" aria-label={`模型：${model}`} title={`模型：${model}`} onclick={onOpenModels}><Cpu size={14} /><span>{model}</span></button>
    <button type="button" aria-label={`权限：${permission}`} title={`权限：${permission}`} onclick={onOpenPermission}><ShieldCheck size={14} /><span>{permission}</span></button>
    <button class:empty={memoryEmpty} type="button" aria-label={memoryEmpty ? "添加分层记忆" : `记忆：${memory}`} title={memoryEmpty ? "当前对话尚未注入分层记忆，点击添加" : `记忆：${memory}`} onclick={onOpenMemory}><Layers3 size={14} /><span>{memoryEmpty ? "添加记忆" : memory}</span></button>
    {#if officeMode}
      <button class="config-toggle" type="button" aria-label="收起任务配置" aria-expanded={configExpanded} onclick={() => (configExpandedRequested = false)}><PanelRightOpen size={14} /><span>收起</span></button>
    {/if}
    {/if}
  </div>
  {#if mode === "code"}
    <div class="inspector-tabs" role="tablist" aria-label="任务检查器">
      <PanelRightOpen size={13} />
      {#each inspectorItems as item (item.id)}
        <button class:active={activeInspector === item.id} type="button" role="tab" aria-selected={activeInspector === item.id} onclick={() => onInspector(item.id)}>{item.label}</button>
      {/each}
    </div>
  {:else}
    <div class="inspector-tabs inspector-entry">
      <button type="button" aria-label="进入 Code 工程检查" onclick={() => onInspector("workspace")}><PanelRightOpen size={13} /> 工程检查</button>
    </div>
  {/if}
</section>

<style>
  .task-context { display: flex; align-items: center; gap: 8px; min-width: 0; min-height: 42px; padding: 4px 6px 4px 10px; border: 1px solid var(--border, #dce1db); border-radius: 10px; background: var(--card, #fff); }
  .drawer-button { display: none; place-items: center; width: 32px; height: 32px; border: 1px solid var(--border, #dce1db); border-radius: 9px; background: var(--card, #fff); color: inherit; }
  .context-location { display: flex; flex: 1 1 220px; align-items: center; gap: 5px; min-width: 120px; overflow: hidden; color: var(--muted-foreground, #687169); font-size: 12px; }
  .context-location strong, .context-location span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .context-location strong { color: var(--foreground, #1f2421); font-weight: 650; }
  .context-location span { min-width: 48px; }
  .context-controls { display: flex; flex: 0 1 auto; align-items: center; gap: 4px; min-width: 0; }
  .context-controls button { display: inline-flex; align-items: center; gap: 5px; min-width: 0; min-height: 32px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--muted-foreground, #687169); font: inherit; font-size: 11px; }
  .context-controls button:hover { background: var(--muted, #edf0ec); color: var(--foreground, #1f2421); }
  .context-controls button span { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
 .context-controls button.empty { color: #9a5b00; }
  .context-controls button.config-toggle { gap: 5px; padding-inline: 9px; border: 1px solid var(--border, #dce1db); background: var(--card, #fff); color: var(--foreground, #1f2421); font-weight: 600; }
  .inspector-tabs { display: flex; align-items: center; gap: 3px; }
  .inspector-tabs button { min-height: 32px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--muted-foreground, #687169); font-size: 12px; }
  .inspector-tabs button.active { background: #1f2421; color: #fff; }
  .inspector-entry button { display: inline-flex; align-items: center; gap: 5px; padding-inline: 9px; border: 1px solid var(--border, #dce1db); background: var(--card, #fff); color: var(--foreground, #1f2421); }
  button:focus-visible { outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent); outline-offset: 2px; }
  @media (max-width: 1180px) {
    .context-controls { overflow-x: auto; scrollbar-width: none; }
    .context-controls button { flex: 0 0 auto; }
    .context-controls button span { max-width: 112px; }
    .inspector-tabs { overflow-x: auto; }
  }
  @media (max-width: 720px) {
    .task-context { position: sticky; top: 0; z-index: 30; display: grid; grid-template-columns: auto minmax(0,1fr); padding: 6px 8px; border-radius: 0 0 10px 10px; }
    .drawer-button { display: grid; width: 40px; height: 40px; }
    .context-location { min-width: 0; }
    .context-controls { grid-column: 1 / -1; width: 100%; padding-top: 2px; }
    .context-controls button { min-height: 40px; }
    .inspector-tabs { grid-column: 1 / -1; }
    .inspector-tabs button { min-height: 40px; }
  }
</style>
