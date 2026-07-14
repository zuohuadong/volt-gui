<script lang="ts">
  import {
    Archive,
    Activity,
    Boxes,
    BriefcaseBusiness,
    CalendarCheck,
    ChevronDown,
    ClipboardCheck,
    Code2,
    Folder,
    FolderOpen,
    Gauge,
    GitBranch,
    Library,
    LayoutDashboard,
    Menu,
    PackageCheck,
    Plus,
    RotateCcw,
    Settings2,
    Trash2,
    X,
  } from "@lucide/svelte";

  import type { ProjectTaskNode, TaskThread, WorkspaceOption } from "../lib/workbench-ia";

  export interface UnifiedNavItem {
    id: string;
    label: string;
    group: string;
    desc?: string;
  }

  interface Props {
    brandName: string;
    brandMarkSrc?: string;
    workspaces: WorkspaceOption[];
    activeWorkspaceId: string;
    projects: ProjectTaskNode[];
    activeProjectId: string;
    activeTaskId: string;
    navItems: UnifiedNavItem[];
    activeNavId: string;
    mode: "work" | "code";
    governanceActive: boolean;
    drawerOpen: boolean;
    collapsed: boolean;
    projectDockCollapsed: boolean;
    onWorkspaceChange: (workspaceId: string) => void;
    onChooseWorkspace: () => void;
    onNav: (navId: string) => void;
    onModeChange: (mode: "work" | "code") => void;
    onProjectToggle: (projectId: string) => void;
    onProjectOpen: (projectId: string) => void;
    onTaskOpen: (projectId: string, taskId: string) => void;
    onTaskCreate: (projectId: string) => void;
    onTaskArchive: (projectId: string, taskId: string) => void;
    onTaskDelete: (projectId: string, taskId: string) => void;
    onProjectDockToggle: () => void;
    onDrawerClose: () => void;
    onCollapseToggle: () => void;
    onGovernance: () => void;
    taskTimeLabel: (task: TaskThread) => string;
  }

  let {
    brandName,
    brandMarkSrc = "",
    workspaces,
    activeWorkspaceId,
    projects,
    activeProjectId,
    activeTaskId,
    navItems,
    activeNavId,
    mode,
    governanceActive,
    drawerOpen,
    collapsed,
    projectDockCollapsed,
    onWorkspaceChange,
    onChooseWorkspace,
    onNav,
    onModeChange,
    onProjectToggle,
    onProjectOpen,
    onTaskOpen,
    onTaskCreate,
    onTaskArchive,
    onTaskDelete,
    onProjectDockToggle,
    onDrawerClose,
    onCollapseToggle,
    onGovernance,
    taskTimeLabel,
  }: Props = $props();

  const navIcons = {
    today: LayoutDashboard,
    tasks: ClipboardCheck,
    projects: FolderOpen,
    deliveries: PackageCheck,
    automations: CalendarCheck,
    knowledge: Library,
    codeConversation: Code2,
    codeOverview: Gauge,
    codeWorkspace: FolderOpen,
    codeContext: Activity,
    codeChanges: GitBranch,
    codeCheckpoints: RotateCcw,
  } as const;

  const navGroups = $derived.by(() => Array.from(new Set(navItems.map((item) => item.group))));

  function iconFor(id: string) {
    return navIcons[id as keyof typeof navIcons] ?? Boxes;
  }

  function selectProject(projectId: string) {
    onProjectOpen(projectId);
    onDrawerClose();
  }

  function selectTask(projectId: string, taskId: string) {
    onTaskOpen(projectId, taskId);
    onDrawerClose();
  }
</script>

{#if drawerOpen}
  <button class="drawer-scrim" type="button" aria-label="关闭导航抽屉" onclick={onDrawerClose}></button>
{/if}

<aside class:drawer-open={drawerOpen} class:collapsed class="unified-sidebar" data-testid="unified-sidebar">
  <header class="sidebar-brand">
    <div class="brand-mark">
      {#if brandMarkSrc}<img src={brandMarkSrc} alt="" />{:else}<span>{brandName.slice(0, 1)}</span>{/if}
    </div>
    <div class="brand-copy"><strong>{brandName}</strong><span>统一任务工作台</span></div>
    <button class="desktop-collapse" type="button" aria-label="收起侧栏" onclick={onCollapseToggle}><Menu size={17} /></button>
    <button class="mobile-close" type="button" aria-label="关闭导航抽屉" onclick={onDrawerClose}><X size={18} /></button>
  </header>

  <div class="mode-switch" role="tablist" aria-label="工作模式">
    <button class:active={mode === "work"} type="button" role="tab" aria-label="Work 工作台" aria-selected={mode === "work"} onclick={() => { onModeChange("work"); onDrawerClose(); }}>
      <BriefcaseBusiness size={15} />
      <span><strong>Work</strong><em>任务与交付</em></span>
    </button>
    <button class:active={mode === "code"} type="button" role="tab" aria-label="Code 工作台" aria-selected={mode === "code"} onclick={() => { onModeChange("code"); onDrawerClose(); }}>
      <Code2 size={15} />
      <span><strong>Code</strong><em>开发与检查</em></span>
    </button>
  </div>

  <div class="workspace-switcher" data-testid="workspace-selector">
    <label for="workspace-select">Workspace</label>
    <div>
      <select id="workspace-select" value={activeWorkspaceId} onchange={(event) => onWorkspaceChange(event.currentTarget.value)}>
        {#each workspaces as workspace (workspace.id)}
          <option value={workspace.id}>{workspace.name}</option>
        {:else}
          <option value="">尚未打开工作区</option>
        {/each}
      </select>
      <button type="button" aria-label="选择本地 Workspace" title="选择本地 Workspace" onclick={onChooseWorkspace}><Plus size={14} /></button>
    </div>
    <p>{workspaces.find((workspace) => workspace.id === activeWorkspaceId)?.root || "仅从真实 Tab 或本地目录建立 Workspace"}</p>
  </div>

  <nav class="primary-nav" aria-label="主导航">
    {#each navGroups as group (group)}
      <section>
        <span class="nav-group-label">{group}</span>
        {#each navItems.filter((item) => item.group === group) as item (item.id)}
          {@const Icon = iconFor(item.id)}
          <button class:active={activeNavId === item.id} type="button" aria-label={item.label} onclick={() => { onNav(item.id); onDrawerClose(); }}>
            <Icon size={15} /><span><strong>{item.label}</strong>{#if item.desc}<em>{item.desc}</em>{/if}</span>
          </button>
        {/each}
      </section>
    {/each}
  </nav>

  <section class="project-tree" data-testid="project-task-tree">
    <header>
      <button class:expanded={!projectDockCollapsed} type="button" aria-expanded={!projectDockCollapsed} onclick={onProjectDockToggle}><ChevronDown size={13} /></button>
      <div><strong>{mode === "code" ? "当前工程" : "项目与任务"}</strong><span>{mode === "code" ? "Workspace 对应的任务上下文" : "按项目组织任务与交付"}</span></div>
    </header>
    {#if !projectDockCollapsed}
      <div class="project-list">
        {#each projects as project (project.id)}
          <section class:active={activeProjectId === project.id} class="project-node" data-project-id={project.id}>
            <div class="project-row">
              <button class:expanded={project.expanded} type="button" aria-label={project.expanded ? `收起 ${project.name}` : `展开 ${project.name}`} onclick={() => onProjectToggle(project.id)}><ChevronDown size={12} /></button>
              <button class="project-open" type="button" onclick={() => selectProject(project.id)}>
                {#if project.kind === "inbox"}<Archive size={14} />{:else}<Folder size={14} />{/if}
                <span>{project.name}</span>
              </button>
              <button type="button" aria-label={`在 ${project.name} 创建任务`} onclick={() => onTaskCreate(project.id)}><Plus size={13} /></button>
            </div>
            {#if project.expanded}
              <div class="task-list">
                {#each project.tasks.filter((task) => !task.archivedAtMs) as task (task.id)}
                  <div class:active={activeTaskId === task.id} class="task-row" data-task-id={task.id}>
                    <button class="task-open" type="button" onclick={() => selectTask(project.id, task.id)}><span>{task.title}</span><em>{taskTimeLabel(task)}</em></button>
                    <button type="button" aria-label={`归档 ${task.title}`} onclick={() => onTaskArchive(project.id, task.id)}><Archive size={11} /></button>
                    <button class="danger" type="button" aria-label={`删除 ${task.title}`} onclick={() => onTaskDelete(project.id, task.id)}><Trash2 size={11} /></button>
                  </div>
                {:else}
                  <button class="empty-task" type="button" onclick={() => onTaskCreate(project.id)}>创建第一个任务 <Plus size={11} /></button>
                {/each}
              </div>
            {/if}
          </section>
        {/each}
      </div>
    {/if}
  </section>

  <footer>
    <button class:active={governanceActive} type="button" aria-pressed={governanceActive} onclick={() => { onGovernance(); onDrawerClose(); }}><Settings2 size={15} /><span>配置与治理</span><em>设置、能力与安全</em></button>
  </footer>
</aside>

<style>
  .unified-sidebar {
    position: relative;
    z-index: 45;
    display: grid;
    grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
    width: var(--sidebar-width, 252px);
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid var(--border, #dce1db);
    background: var(--muted, #edf0ec);
    color: var(--foreground, #1f2421);
  }

  button, select { font: inherit; }
  button { cursor: pointer; }
  .sidebar-brand { display: grid; grid-template-columns: 34px minmax(0, 1fr) 32px; align-items: center; gap: 9px; min-height: 66px; padding: 11px 12px; border-bottom: 1px solid var(--border, #dce1db); }
  .brand-mark { display: grid; place-items: center; width: 34px; height: 34px; overflow: hidden; border-radius: 10px; color: #fff; background: #1f2421; }
  .brand-mark img { width: 100%; height: 100%; object-fit: contain; }
  .brand-copy { display: grid; min-width: 0; gap: 2px; }
  .brand-copy strong, .brand-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .brand-copy strong { font-size: 13px; }
  .brand-copy span { color: var(--muted-foreground, #687169); font-size: 11px; }
  .desktop-collapse, .mobile-close, .workspace-switcher button, .project-tree button, footer button { border: 0; background: transparent; color: inherit; }
  .desktop-collapse, .workspace-switcher button, .project-tree button { min-width: 32px; min-height: 32px; }
  .mobile-close { display: none; }

  .mode-switch { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px; margin: 8px 8px 0; padding: 3px; border: 1px solid var(--border, #dce1db); border-radius: 10px; background: color-mix(in srgb, var(--card, #fff) 70%, transparent); }
  .mode-switch button { display: grid; grid-template-columns: 20px minmax(0,1fr); align-items: center; min-width: 0; min-height: 39px; padding: 4px 7px; border: 0; border-radius: 7px; background: transparent; color: var(--muted-foreground, #687169); text-align: left; }
  .mode-switch button.active { background: #1f2421; color: #fff; }
  .mode-switch span, .mode-switch strong, .mode-switch em { display: block; min-width: 0; }
  .mode-switch strong { font-size: 12px; font-weight: 650; }
  .mode-switch em { margin-top: 1px; overflow: hidden; font-size: 11px; font-style: normal; opacity: .78; text-overflow: ellipsis; white-space: nowrap; }

  .workspace-switcher { display: grid; gap: 5px; margin: 9px 8px 5px; padding: 9px; border: 1px solid var(--border, #dce1db); border-radius: 11px; background: var(--card, #fff); }
  .workspace-switcher label { color: var(--muted-foreground, #687169); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .workspace-switcher > div { display: grid; grid-template-columns: minmax(0, 1fr) 32px; gap: 5px; }
  .workspace-switcher select { min-width: 0; height: 32px; padding: 0 8px; border: 1px solid var(--border, #dce1db); border-radius: 8px; background: var(--card, #fff); color: inherit; font-size: 12px; }
  .workspace-switcher button { display: grid; place-items: center; border: 1px solid var(--border, #dce1db); border-radius: 8px; }
  .workspace-switcher p { margin: 0; overflow: hidden; color: var(--muted-foreground, #687169); font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }

  .primary-nav { display: grid; gap: 8px; padding: 9px 8px 10px; border-bottom: 1px solid var(--border, #dce1db); }
  .primary-nav section { display: grid; gap: 2px; }
  .nav-group-label { padding: 0 9px 3px; color: var(--muted-foreground, #687169); font-size: 11px; font-weight: 650; letter-spacing: .07em; }
  .primary-nav button { display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; min-height: 36px; padding: 4px 9px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--muted-foreground, #687169); text-align: left; }
  .primary-nav button.active { border-color: color-mix(in srgb, #0f7b55 30%, var(--border, #dce1db)); background: color-mix(in srgb, var(--card, #fff) 86%, #0f7b55 14%); color: #0f7b55; }
  .primary-nav button > span, .primary-nav strong, .primary-nav em { display: block; min-width: 0; }
  .primary-nav strong { font-size: 12px; font-weight: 620; }
  .primary-nav em { margin-top: 1px; overflow: hidden; color: var(--muted-foreground, #687169); font-size: 11px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }

  .project-tree { min-height: 0; overflow: hidden; padding: 7px 8px; }
  .project-tree > header { display: grid; grid-template-columns: 32px minmax(0, 1fr); align-items: center; min-height: 38px; }
  .project-tree > header button { transition: transform .15s ease; }
  .project-tree > header button:not(.expanded) { transform: rotate(-90deg); }
  .project-tree > header div { display: grid; gap: 1px; }
  .project-tree > header strong { font-size: 12px; }
  .project-tree > header span { color: var(--muted-foreground, #687169); font-size: 11px; }
  .project-list { display: grid; gap: 3px; max-height: calc(100% - 38px); overflow-y: auto; }
  .project-node { padding: 3px; border: 1px solid transparent; border-radius: 9px; }
  .project-node.active { border-color: color-mix(in srgb, #0f7b55 26%, var(--border, #dce1db)); background: color-mix(in srgb, var(--card, #fff) 88%, #0f7b55 12%); }
  .project-row { display: grid; grid-template-columns: 32px minmax(0, 1fr) 32px; align-items: center; }
  .project-row > button:first-child:not(.expanded) { transform: rotate(-90deg); }
  .project-open { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; min-width: 0; min-height: 32px; text-align: left; }
  .project-open span { overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .task-list { display: grid; gap: 2px; padding: 2px 0 3px 23px; }
  .task-row { display: grid; grid-template-columns: minmax(0, 1fr) 32px 32px; align-items: center; border-radius: 7px; }
  .task-row.active { background: color-mix(in srgb, var(--card, #fff) 86%, #0f7b55 14%); color: #0f7b55; }
  .task-open { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; min-width: 0; min-height: 32px; text-align: left; }
  .task-open span { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .task-open em { color: var(--muted-foreground, #687169); font-size: 11px; font-style: normal; }
  .task-row .danger { color: var(--destructive, #b42318); }
  .empty-task { display: flex; align-items: center; gap: 5px; min-height: 32px; color: var(--muted-foreground, #687169) !important; font-size: 12px; }

  footer { padding: 9px 10px 12px; border-top: 1px solid var(--border, #dce1db); }
  footer button { display: grid; grid-template-columns: 22px minmax(0,1fr); width: 100%; min-height: 38px; padding: 4px 8px; border-radius: 8px; text-align: left; }
  footer button:hover { background: var(--card, #fff); }
  footer button.active { border: 1px solid color-mix(in srgb, #0f7b55 30%, var(--border, #dce1db)); background: color-mix(in srgb, var(--card, #fff) 86%, #0f7b55 14%); color: #0f7b55; }
  footer span, footer em { grid-column: 2; }
  footer span { font-size: 12px; font-weight: 600; }
  footer em { color: var(--muted-foreground, #687169); font-size: 11px; font-style: normal; }

  button:focus-visible,
  select:focus-visible { outline: 2px solid color-mix(in srgb, #0f7b55 55%, transparent); outline-offset: 2px; }

  .drawer-scrim { display: none; }
  .collapsed { width: 68px; }
  .collapsed .brand-copy, .collapsed .workspace-switcher, .collapsed .mode-switch span, .collapsed .nav-group-label, .collapsed .primary-nav button > span, .collapsed .project-tree, .collapsed footer span, .collapsed footer em { display: none; }
  .collapsed .mode-switch { grid-template-columns: 1fr; margin-inline: 10px; }
  .collapsed .mode-switch button { grid-template-columns: 1fr; justify-items: center; padding: 0; }
  .collapsed .primary-nav button { grid-template-columns: 1fr; justify-items: center; padding-inline: 0; }
  .collapsed .sidebar-brand { grid-template-columns: 34px 32px; }

  @media (max-width: 720px) {
    .drawer-scrim { position: fixed; inset: 0; z-index: 60; display: block; border: 0; background: rgba(15, 23, 42, .32); }
    .unified-sidebar { position: fixed; inset: 0 auto 0 0; z-index: 70; width: min(84vw, 320px); transform: translateX(-102%); transition: transform .2s ease; box-shadow: 18px 0 36px rgba(15,23,42,.18); }
    .unified-sidebar.drawer-open { transform: translateX(0); }
    .desktop-collapse { display: none; }
    .mobile-close { display: grid; min-width: 40px; min-height: 40px; place-items: center; }
    .sidebar-brand { grid-template-columns: 34px minmax(0,1fr) 40px; }
    .unified-sidebar.collapsed { width: min(84vw, 320px); }
    .collapsed .brand-copy { display: grid; }
    .collapsed .workspace-switcher { display: grid; }
    .collapsed .mode-switch { grid-template-columns: repeat(2,minmax(0,1fr)); margin-inline: 8px; }
    .collapsed .mode-switch button { grid-template-columns: 20px minmax(0,1fr); justify-items: stretch; padding: 4px 7px; }
    .collapsed .mode-switch span, .collapsed .nav-group-label, .collapsed .primary-nav button > span, .collapsed footer span, .collapsed footer em { display: block; }
    .collapsed .primary-nav button { grid-template-columns: 22px minmax(0,1fr); justify-items: stretch; padding: 4px 9px; }
    .collapsed .project-tree { display: block; }
    .mode-switch button,
    .workspace-switcher button,
    .project-tree button,
    .primary-nav button,
    footer button { min-height: 40px; }
    .workspace-switcher button,
    .project-tree button { min-width: 40px; }
    .workspace-switcher > div { grid-template-columns: minmax(0, 1fr) 40px; }
    .workspace-switcher select { height: 40px; }
    .project-tree > header { grid-template-columns: 40px minmax(0, 1fr); }
    .project-row { grid-template-columns: 40px minmax(0, 1fr) 40px; }
    .task-row { grid-template-columns: minmax(0, 1fr) 40px 40px; }
  }
</style>
