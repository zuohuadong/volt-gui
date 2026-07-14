<script lang="ts">
  import { Menu, PanelRightOpen } from "@lucide/svelte";

  interface Props {
    workspace: string;
    project: string;
    agent: string;
    model: string;
    permission: string;
    memory: string;
    activeInspector: string;
    onOpenDrawer: () => void;
    onInspector: (id: string) => void;
  }

  let { workspace, project, agent, model, permission, memory, activeInspector, onOpenDrawer, onInspector }: Props = $props();
  const inspectorItems = [
    { id: "task", label: "任务" },
    { id: "workspace", label: "Workspace" },
    { id: "context", label: "Context" },
    { id: "changes", label: "Diff" },
    { id: "checkpoints", label: "Checkpoints" },
  ];
</script>

<section class="task-context" data-testid="task-context-bar" aria-label="当前任务上下文">
  <button class="drawer-button" type="button" aria-label="打开导航抽屉" onclick={onOpenDrawer}><Menu size={16} /></button>
  <div class="context-values">
    <span><em>Workspace</em><strong>{workspace}</strong></span>
    <span><em>Project</em><strong>{project}</strong></span>
    <span><em>Agent Profile</em><strong>{agent}</strong></span>
    <span><em>Model</em><strong>{model}</strong></span>
    <span><em>Permission</em><strong>{permission}</strong></span>
    <span><em>Memory</em><strong>{memory}</strong></span>
  </div>
  <div class="inspector-tabs" role="tablist" aria-label="任务检查器">
    <PanelRightOpen size={13} />
    {#each inspectorItems as item (item.id)}
      <button class:active={activeInspector === item.id} type="button" role="tab" aria-selected={activeInspector === item.id} onclick={() => onInspector(item.id)}>{item.label}</button>
    {/each}
  </div>
</section>

<style>
  .task-context { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 10px; min-width: 0; padding: 8px 12px; border: 1px solid var(--aorist-line, #dfe3e8); border-radius: 12px; background: rgba(255,255,255,.94); }
  .drawer-button { display: none; place-items: center; width: 32px; height: 32px; border: 1px solid var(--aorist-line, #dfe3e8); border-radius: 9px; background: #fff; color: inherit; }
  .context-values { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); min-width: 0; }
  .context-values span { display: grid; min-width: 0; gap: 2px; padding: 0 9px; border-right: 1px solid var(--aorist-line, #e5e7eb); }
  .context-values span:last-child { border-right: 0; }
  em { color: var(--aorist-muted, #667085); font-size: 8px; font-style: normal; font-weight: 650; text-transform: uppercase; }
  strong { overflow: hidden; font-size: 9.5px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .inspector-tabs { display: flex; align-items: center; gap: 3px; }
  .inspector-tabs button { min-height: 27px; padding: 0 7px; border: 0; border-radius: 7px; background: transparent; color: var(--aorist-muted, #667085); font-size: 8.5px; }
  .inspector-tabs button.active { background: #222; color: #fff; }
  @media (max-width: 1180px) { .task-context { grid-template-columns: minmax(0,1fr); } .inspector-tabs { overflow-x: auto; } }
  @media (max-width: 720px) {
    .task-context { position: sticky; top: 0; z-index: 30; grid-template-columns: auto minmax(0,1fr); padding: 7px 9px; border-radius: 0 0 12px 12px; }
    .drawer-button { display: grid; }
    .context-values { display: flex; overflow-x: auto; scrollbar-width: none; }
    .context-values span { flex: 0 0 118px; }
    .inspector-tabs { grid-column: 1 / -1; }
  }
</style>
