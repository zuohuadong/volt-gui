<script lang="ts">
  import { Menu, PanelRightOpen } from "@lucide/svelte";

  interface Props {
    workspace: string;
    project: string;
    agent: string;
    model: string;
    permission: string;
    memory: string;
    mode: "work" | "code";
    activeInspector: string;
    onOpenDrawer: () => void;
    onInspector: (id: string) => void;
  }

  let { workspace, project, agent, model, permission, memory, mode, activeInspector, onOpenDrawer, onInspector }: Props = $props();
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
  .task-context { display: grid; grid-template-columns: auto minmax(0,1fr) auto; align-items: center; gap: 10px; min-width: 0; padding: 8px 12px; border: 1px solid var(--border, #dce1db); border-radius: 12px; background: var(--card, #fff); }
  .drawer-button { display: none; place-items: center; width: 32px; height: 32px; border: 1px solid var(--border, #dce1db); border-radius: 9px; background: var(--card, #fff); color: inherit; }
  .context-values { display: grid; grid-template-columns: repeat(6, minmax(0,1fr)); min-width: 0; }
  .context-values span { display: grid; min-width: 0; gap: 2px; padding: 0 9px; border-right: 1px solid var(--border, #dce1db); }
  .context-values span:last-child { border-right: 0; }
  em { color: var(--muted-foreground, #687169); font-size: 11px; font-style: normal; font-weight: 650; text-transform: uppercase; }
  strong { overflow: hidden; color: var(--foreground, #1f2421); font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .inspector-tabs { display: flex; align-items: center; gap: 3px; }
  .inspector-tabs button { min-height: 32px; padding: 0 8px; border: 0; border-radius: 7px; background: transparent; color: var(--muted-foreground, #687169); font-size: 12px; }
  .inspector-tabs button.active { background: #1f2421; color: #fff; }
  .inspector-entry button { display: inline-flex; align-items: center; gap: 5px; padding-inline: 9px; border: 1px solid var(--border, #dce1db); background: var(--card, #fff); color: var(--foreground, #1f2421); }
  button:focus-visible { outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent); outline-offset: 2px; }
  @media (max-width: 1180px) { .task-context { grid-template-columns: minmax(0,1fr); } .inspector-tabs { overflow-x: auto; } }
  @media (max-width: 720px) {
    .task-context { position: sticky; top: 0; z-index: 30; grid-template-columns: auto minmax(0,1fr); padding: 7px 9px; border-radius: 0 0 12px 12px; }
    .drawer-button { display: grid; width: 40px; height: 40px; }
    .context-values { display: flex; overflow-x: auto; scrollbar-width: none; }
    .context-values span { flex: 0 0 118px; }
    .inspector-tabs { grid-column: 1 / -1; }
    .inspector-tabs button { min-height: 40px; }
  }
</style>
