<script lang="ts">
  import { tick } from "svelte";
  import {
    Archive,
    Activity,
    ArrowUpDown,
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
    Pencil,
    Plus,
    RotateCcw,
    Settings2,
    SquarePen,
    Trash2,
    X,
  } from "@lucide/svelte";

  import type { ProjectTaskNode, TaskThread } from "../lib/workbench-ia";

  export interface UnifiedNavItem {
    id: string;
    label: string;
    group: string;
    desc?: string;
  }

  interface Props {
    brandName: string;
    brandMarkSrc?: string;
    projects: ProjectTaskNode[];
    activeProjectId: string;
    activeTaskId: string;
    navItems: UnifiedNavItem[];
    activeNavId: string;
    mode: "work" | "code";
    governanceActive: boolean;
    displayMode: "office" | "developer";
    drawerOpen: boolean;
    collapsed: boolean;
    projectDockCollapsed: boolean;
    projectSortLabel: string;
    onNewTask: () => void;
    onNav: (navId: string) => void;
    onModeChange: (mode: "work" | "code") => void;
    onProjectToggle: (projectId: string) => void;
    onProjectOpen: (projectId: string) => void;
    onTaskOpen: (projectId: string, taskId: string) => void;
    onTaskCreate: (projectId: string) => void;
    onTaskArchive: (projectId: string, taskId: string) => void;
    onTaskDelete: (projectId: string, taskId: string) => void;
    onProjectSort: () => void;
    onProjectCreate: () => void;
    onProjectRename: (projectId: string, name: string) => void | Promise<void>;
    onProjectDockToggle: () => void;
    onDrawerClose: () => void;
    onCollapseToggle: () => void;
    onGovernance: () => void;
    taskTimeLabel: (task: TaskThread) => string;
  }

  let {
    brandName,
    brandMarkSrc = "",
    projects,
    activeProjectId,
    activeTaskId,
    navItems,
    activeNavId,
    mode,
    governanceActive,
    displayMode,
    drawerOpen,
    collapsed,
    projectDockCollapsed,
    projectSortLabel,
    onNewTask,
    onNav,
    onModeChange,
    onProjectToggle,
    onProjectOpen,
    onTaskOpen,
    onTaskCreate,
    onTaskArchive,
    onTaskDelete,
    onProjectSort,
    onProjectCreate,
    onProjectRename,
    onProjectDockToggle,
    onDrawerClose,
    onCollapseToggle,
    onGovernance,
    taskTimeLabel,
  }: Props = $props();

  let editingProjectId = $state("");
  let projectNameDraft = $state("");
  let projectRenameInput = $state<HTMLInputElement | undefined>();

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
  const newTaskShortcutLabel = typeof navigator !== "undefined" && /(Mac|iPhone|iPad)/.test(navigator.platform) ? "⌘N" : "Ctrl N";
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

  function startProjectRename(project: ProjectTaskNode) {
    if (project.kind === "inbox") return;
    editingProjectId = project.id;
    projectNameDraft = project.name;
    void tick().then(() => {
      projectRenameInput?.focus();
      projectRenameInput?.select();
    });
  }

  function cancelProjectRename() {
    editingProjectId = "";
    projectNameDraft = "";
  }

  async function commitProjectRename(projectId: string) {
    const name = projectNameDraft.trim();
    cancelProjectRename();
    if (!name) return;
    await onProjectRename(projectId, name);
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

  <nav class="primary-nav" aria-label="主导航">
    {#each navGroups as group (group)}
      <section>
        <div class="nav-group-heading">
          <span class="nav-group-label">{group}</span>
          {#if mode === "work" && group === navGroups[0]}
            <button
              class="new-task-action"
              type="button"
              aria-label="新建任务"
              aria-keyshortcuts="Meta+N Control+N"
              title={`新建任务 · ${newTaskShortcutLabel}`}
              onclick={() => { onNewTask(); onDrawerClose(); }}
            ><SquarePen size={14} /></button>
          {/if}
        </div>
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
      <aside>
        <button type="button" aria-label={`项目排序：${projectSortLabel}`} title={`项目排序：${projectSortLabel}`} onclick={onProjectSort}><ArrowUpDown size={13} /></button>
        {#if mode === "work"}<button type="button" aria-label="新建项目" title="新建项目" onclick={() => { onProjectCreate(); onDrawerClose(); }}><Plus size={14} /></button>{/if}
      </aside>
    </header>
    {#if !projectDockCollapsed}
      <div class="project-list">
        {#each projects as project (project.id)}
          <section class:active={activeProjectId === project.id} class="project-node" data-project-id={project.id}>
            <div class="project-row">
              <button class:expanded={project.expanded} type="button" aria-label={project.expanded ? `收起 ${project.name}` : `展开 ${project.name}`} onclick={() => onProjectToggle(project.id)}><ChevronDown size={12} /></button>
              {#if editingProjectId === project.id}
                <form class="project-rename" onsubmit={(event) => { event.preventDefault(); void commitProjectRename(project.id); }}>
                  <Folder size={14} />
                  <input bind:this={projectRenameInput} bind:value={projectNameDraft} aria-label={`重命名 ${project.name}`} onblur={() => void commitProjectRename(project.id)} onkeydown={(event) => { if (event.key === "Escape") cancelProjectRename(); }} />
                </form>
              {:else}
                <button class="project-open" type="button" onclick={() => selectProject(project.id)}>
                  {#if project.kind === "inbox"}<Archive size={14} />{:else}<Folder size={14} />{/if}
                  <span>{project.name}</span>
                </button>
              {/if}
              {#if project.kind === "project"}<button class="project-rename-action" type="button" aria-label={`重命名 ${project.name}`} title="重命名项目" onclick={() => startProjectRename(project)}><Pencil size={12} /></button>{:else}<span class="project-action-spacer"></span>{/if}
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
    <button class:active={governanceActive} type="button" aria-pressed={governanceActive} onclick={() => { onGovernance(); onDrawerClose(); }}><Settings2 size={15} /><span>{displayMode === "office" ? "设置" : "配置与治理"}</span><em>{displayMode === "office" ? "模型、权限与同步" : "设置、能力与安全"}</em></button>
  </footer>
</aside>

<style>
  .unified-sidebar {
    position: relative;
    z-index: 45;
    display: grid;
    grid-template-rows: auto auto auto minmax(0, 1fr) auto;
    width: var(--sidebar-width, 252px);
    height: 100dvh;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid var(--border, #dce1db);
    background: color-mix(in srgb, var(--muted, #edf0ec) 86%, var(--card, #fff));
    color: var(--foreground, #1f2421);
  }

  button { font: inherit; }
  button { cursor: pointer; }
  .sidebar-brand { display: grid; grid-template-columns: 30px minmax(0, 1fr) 32px; align-items: center; gap: 9px; min-height: 56px; padding: 9px 10px; border-bottom: 1px solid color-mix(in srgb, var(--border, #dce1db) 78%, transparent); }
  .brand-mark { display: grid; place-items: center; width: 30px; height: 30px; overflow: hidden; border-radius: 8px; color: #fff; background: #1f2421; }
  .brand-mark img { width: 100%; height: 100%; object-fit: contain; }
  .brand-copy { display: grid; min-width: 0; gap: 2px; }
  .brand-copy strong, .brand-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .brand-copy strong { font-size: 13px; }
  .brand-copy span { color: var(--muted-foreground, #687169); font-size: 11px; }
  .desktop-collapse, .mobile-close, .project-tree button, footer button { border: 0; background: transparent; color: inherit; }
  .desktop-collapse, .project-tree button { min-width: 32px; min-height: 32px; }
  .mobile-close { display: none; }

  .mode-switch { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 2px; margin: 7px 8px 2px; padding: 2px; border: 1px solid color-mix(in srgb, var(--border, #dce1db) 86%, transparent); border-radius: 9px; background: color-mix(in srgb, var(--muted, #edf0ec) 66%, var(--card, #fff)); }
  .mode-switch button { display: grid; grid-template-columns: 18px minmax(0,1fr); align-items: center; min-width: 0; min-height: 32px; padding: 3px 7px; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--muted-foreground, #687169); text-align: left; transition: background .15s ease, border-color .15s ease, color .15s ease; }
  .mode-switch button:hover { color: var(--foreground, #1f2421); }
  .mode-switch button.active { border-color: color-mix(in srgb, var(--border, #dce1db) 82%, transparent); background: var(--card, #fff); color: var(--foreground, #1f2421); box-shadow: 0 1px 2px rgba(31, 36, 33, .06); }
  .mode-switch span, .mode-switch strong, .mode-switch em { display: block; min-width: 0; }
  .mode-switch strong { font-size: 12px; font-weight: 650; }
  .mode-switch em { display: none; }

  .new-task-action { display: grid; box-sizing: border-box; width: 28px; min-width: 28px; height: 28px; min-height: 28px; padding: 0; place-items: center; border: 1px solid transparent; border-radius: 7px; background: transparent; color: var(--muted-foreground, #687169); opacity: .76; transition: background .15s ease, color .15s ease, opacity .15s ease; }
  .new-task-action:hover { background: color-mix(in srgb, var(--card, #fff) 74%, var(--foreground, #1f2421) 5%); }
  .new-task-action:hover, .new-task-action:focus-visible { color: var(--foreground, #1f2421); opacity: 1; }
  .new-task-action:active { background: color-mix(in srgb, var(--card, #fff) 66%, var(--foreground, #1f2421) 9%); }

  .primary-nav { display: grid; gap: 5px; padding: 5px 8px 9px; border-bottom: 1px solid color-mix(in srgb, var(--border, #dce1db) 78%, transparent); }
  .primary-nav section { display: grid; gap: 2px; }
  .nav-group-heading { display: grid; grid-template-columns: minmax(0, 1fr) 28px; align-items: center; min-height: 28px; padding: 0 2px 0 9px; }
  .nav-group-label { color: var(--muted-foreground, #687169); font-size: 11px; font-weight: 650; letter-spacing: .07em; }
  .primary-nav button:not(.new-task-action) { display: grid; grid-template-columns: 22px minmax(0, 1fr); align-items: center; min-height: 34px; padding: 3px 8px; border: 1px solid transparent; border-radius: 8px; background: transparent; color: var(--muted-foreground, #687169); text-align: left; transition: background .15s ease, color .15s ease; }
  .primary-nav button:not(.new-task-action):hover { background: color-mix(in srgb, var(--card, #fff) 66%, transparent); color: var(--foreground, #1f2421); }
  .primary-nav button:not(.new-task-action).active { background: color-mix(in srgb, var(--card, #fff) 78%, var(--foreground, #1f2421) 7%); color: var(--foreground, #1f2421); }
  .primary-nav button > span, .primary-nav strong, .primary-nav em { display: block; min-width: 0; }
  .primary-nav strong { font-size: 12px; font-weight: 620; }
  .primary-nav em { margin-top: 1px; overflow: hidden; color: var(--muted-foreground, #687169); font-size: 11px; font-style: normal; text-overflow: ellipsis; white-space: nowrap; }

  .project-tree { min-height: 0; overflow: hidden; padding: 7px 8px; }
  .project-tree > header { display: grid; grid-template-columns: 32px minmax(0, 1fr) auto; align-items: center; min-height: 38px; }
  .project-tree > header > button { transition: transform .15s ease; }
  .project-tree > header > button:not(.expanded) { transform: rotate(-90deg); }
  .project-tree > header div { display: grid; gap: 1px; }
  .project-tree > header strong { font-size: 12px; }
  .project-tree > header span { color: var(--muted-foreground, #687169); font-size: 11px; }
  .project-tree > header aside { display: flex; gap: 1px; }
  .project-tree > header aside button { display: grid; min-width: 28px; min-height: 28px; place-items: center; border-radius: 6px; color: var(--muted-foreground, #687169); }
  .project-tree > header aside button:hover { background: var(--card, #fff); color: var(--foreground, #1f2421); }
  .project-list { display: grid; gap: 3px; max-height: calc(100% - 38px); overflow-y: auto; }
  .project-node { padding: 3px; border: 1px solid transparent; border-radius: 9px; }
  .project-node.active { border-color: color-mix(in srgb, var(--foreground, #1f2421) 12%, var(--border, #dce1db)); background: color-mix(in srgb, var(--card, #fff) 84%, var(--foreground, #1f2421) 7%); }
  .project-row { display: grid; grid-template-columns: 32px minmax(0, 1fr) 28px 32px; align-items: center; }
  .project-row > button:first-child:not(.expanded) { transform: rotate(-90deg); }
  .project-open { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; min-width: 0; min-height: 32px; text-align: left; }
  .project-open span { overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
  .project-rename { display: grid; grid-template-columns: 18px minmax(0, 1fr); align-items: center; min-width: 0; gap: 2px; }
  .project-rename input { min-width: 0; width: 100%; height: 28px; padding: 0 5px; border: 1px solid var(--border-strong, #c7cfc7); border-radius: 6px; background: var(--card, #fff); color: var(--foreground, #1f2421); font: inherit; font-size: 12px; }
  .project-rename-action { display: grid; min-width: 28px !important; min-height: 28px !important; place-items: center; border-radius: 6px !important; color: var(--muted-foreground, #687169) !important; opacity: 0; }
  .project-row:hover .project-rename-action, .project-rename-action:focus-visible { opacity: 1; }
  .project-rename-action:hover { background: var(--card, #fff) !important; color: var(--foreground, #1f2421) !important; }
  .project-action-spacer { width: 28px; }
  .task-list { display: grid; gap: 2px; padding: 2px 0 3px 23px; }
  .task-row { display: grid; grid-template-columns: minmax(0, 1fr) 32px 32px; align-items: center; border-radius: 7px; }
  .task-row.active { background: color-mix(in srgb, var(--card, #fff) 82%, var(--foreground, #1f2421) 8%); color: var(--foreground, #1f2421); }
  .task-open { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; min-width: 0; min-height: 32px; text-align: left; }
  .task-open span { overflow: hidden; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
  .task-open em { color: var(--muted-foreground, #687169); font-size: 11px; font-style: normal; }
  .task-row .danger { color: var(--destructive, #b42318); }
  .empty-task { display: flex; align-items: center; gap: 5px; min-height: 32px; color: var(--muted-foreground, #687169) !important; font-size: 12px; }

  footer { padding: 9px 10px 12px; border-top: 1px solid var(--border, #dce1db); }
  footer button { display: grid; grid-template-columns: 22px minmax(0,1fr); width: 100%; min-height: 38px; padding: 4px 8px; border-radius: 8px; text-align: left; }
  footer button:hover { background: var(--card, #fff); }
  footer button.active { border: 1px solid color-mix(in srgb, var(--foreground, #1f2421) 14%, var(--border, #dce1db)); background: color-mix(in srgb, var(--card, #fff) 82%, var(--foreground, #1f2421) 8%); color: var(--foreground, #1f2421); }
  footer span, footer em { grid-column: 2; }
  footer span { font-size: 12px; font-weight: 600; }
  footer em { color: var(--muted-foreground, #687169); font-size: 11px; font-style: normal; }

  button:focus-visible { outline: 2px solid color-mix(in srgb, var(--foreground, #1f2421) 48%, transparent); outline-offset: 2px; }

  .drawer-scrim { display: none; }
  .collapsed { width: 68px; }
  .collapsed .brand-copy, .collapsed .mode-switch span, .collapsed .nav-group-label, .collapsed .primary-nav button > span, .collapsed .project-tree, .collapsed footer span, .collapsed footer em { display: none; }
  .collapsed .nav-group-heading { grid-template-columns: 1fr; justify-items: center; padding-inline: 0; }
  .collapsed .mode-switch { grid-template-columns: 1fr; margin-inline: 10px; }
  .collapsed .mode-switch button { grid-template-columns: 1fr; justify-items: center; padding: 0; }
  .collapsed .primary-nav button:not(.new-task-action) { grid-template-columns: 1fr; justify-items: center; padding-inline: 0; }
  .collapsed .sidebar-brand { grid-template-columns: 30px 32px; }

  @media (max-width: 720px) {
    .drawer-scrim { position: fixed; inset: 0; z-index: 60; display: block; border: 0; background: rgba(15, 23, 42, .32); }
    .unified-sidebar { position: fixed; inset: 0 auto 0 0; z-index: 70; width: min(84vw, 320px); transform: translateX(-102%); transition: transform .2s ease; box-shadow: 18px 0 36px rgba(15,23,42,.18); }
    .unified-sidebar.drawer-open { transform: translateX(0); }
    .desktop-collapse { display: none; }
    .mobile-close { display: grid; min-width: 40px; min-height: 40px; place-items: center; }
    .sidebar-brand { grid-template-columns: 30px minmax(0,1fr) 40px; }
    .unified-sidebar.collapsed { width: min(84vw, 320px); }
    .collapsed .brand-copy { display: grid; }
    .collapsed .mode-switch { grid-template-columns: repeat(2,minmax(0,1fr)); margin-inline: 8px; }
    .collapsed .mode-switch button { grid-template-columns: 20px minmax(0,1fr); justify-items: stretch; padding: 4px 7px; }
    .collapsed .mode-switch span, .collapsed .nav-group-label, .collapsed .primary-nav button > span, .collapsed footer span, .collapsed footer em { display: block; }
    .collapsed .primary-nav button:not(.new-task-action) { grid-template-columns: 22px minmax(0,1fr); justify-items: stretch; padding: 4px 9px; }
    .collapsed .project-tree { display: block; }
    .nav-group-heading { grid-template-columns: minmax(0, 1fr) 40px; padding-right: 0; }
    .new-task-action { width: 40px; min-width: 40px; height: 40px; min-height: 40px; }
    .mode-switch button,
    .project-tree button,
    .primary-nav button,
    footer button { min-height: 40px; }
    .project-tree button { min-width: 40px; }
    .project-tree > header { grid-template-columns: 40px minmax(0, 1fr) auto; }
    .project-row { grid-template-columns: 40px minmax(0, 1fr) 40px 40px; }
    .project-rename-action { min-width: 40px !important; min-height: 40px !important; opacity: 1; }
    .task-row { grid-template-columns: minmax(0, 1fr) 40px 40px; }
  }
</style>
