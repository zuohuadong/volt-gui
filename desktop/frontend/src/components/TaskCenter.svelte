<script lang="ts">
  import { Archive, ArchiveRestore, ClipboardCheck, Plus, RotateCcw, Trash2 } from "@lucide/svelte";

  type TaskCenterTab = "active" | "todos" | "archived";

  interface TaskCenterTask {
    id: string;
    projectId: string;
    projectName: string;
    title: string;
    updatedAt: string;
    stateLabel: string;
    stateTone: string;
  }

  interface TaskCenterTodo {
    id: string;
    title: string;
    description: string;
    due: string;
    status: string;
  }

  interface TaskCenterArchivedProject {
    id: string;
    name: string;
    tasks: { id: string; title: string; updatedAt: string }[];
  }

  interface Props {
    activeTab: TaskCenterTab;
    tasks: TaskCenterTask[];
    todos: TaskCenterTodo[];
    archivedProjects: TaskCenterArchivedProject[];
    archivedCount: number;
    onTabChange: (tab: TaskCenterTab) => void;
    onNewTask: () => void;
    onNewTodo: () => void;
    onOpenTask: (projectId: string, taskId: string) => void;
    onRestoreTask: (projectId: string, taskId: string) => void;
    onDeleteTask: (projectId: string, taskId: string) => void;
  }

  let {
    activeTab,
    tasks,
    todos,
    archivedProjects,
    archivedCount,
    onTabChange,
    onNewTask,
    onNewTodo,
    onOpenTask,
    onRestoreTask,
    onDeleteTask,
  }: Props = $props();
</script>

<section class="task-center-page" data-testid="task-center">
  <header class="task-center-head">
    <div>
      <span>Task Center</span>
      <h1>任务</h1>
      <p>从这里继续任务、处理待办，或找回已经归档的任务。</p>
    </div>
    <button class="task-center-primary" type="button" onclick={onNewTask}><Plus size={15} /> 新建任务</button>
  </header>

  <div class="task-center-tabs" role="tablist" aria-label="任务视图">
    <button class:active={activeTab === "active"} type="button" role="tab" aria-selected={activeTab === "active"} onclick={() => onTabChange("active")}>
      <ClipboardCheck size={14} />进行中 <em>{tasks.length}</em>
    </button>
    <button class:active={activeTab === "todos"} type="button" role="tab" aria-selected={activeTab === "todos"} onclick={() => onTabChange("todos")}>
      <RotateCcw size={14} />待办 <em>{todos.length}</em>
    </button>
    <button class:active={activeTab === "archived"} type="button" role="tab" aria-selected={activeTab === "archived"} onclick={() => onTabChange("archived")}>
      <Archive size={14} />已归档 <em>{archivedCount}</em>
    </button>
  </div>

  {#if activeTab === "active"}
    <section class="task-center-list" aria-label="进行中的任务">
      {#each tasks as task (task.id)}
        <button class="task-center-row" type="button" onclick={() => onOpenTask(task.projectId, task.id)}>
          <span class="task-center-row__icon"><ClipboardCheck size={16} /></span>
          <span class="task-center-row__body"><strong>{task.title}</strong><em>{task.projectName} · {task.updatedAt}</em></span>
          <span class={`task-center-state task-center-state--${task.stateTone}`}>{task.stateLabel}</span>
        </button>
      {:else}
        <article class="task-center-empty">
          <ClipboardCheck size={20} />
          <strong>还没有进行中的任务</strong>
          <p>从一个真实目标开始，Volt 会把执行过程和结果保存在这里。</p>
          <button type="button" onclick={onNewTask}><Plus size={14} /> 新建第一个任务</button>
        </article>
      {/each}
    </section>
  {:else if activeTab === "todos"}
    <section class="task-center-list" aria-label="待办事项">
      <div class="task-center-subhead"><div><strong>待办事项</strong><span>把下一步动作留在任务上下文里。</span></div><button type="button" onclick={onNewTodo}><Plus size={14} /> 新增待办</button></div>
      {#each todos as todo (todo.id)}
        <article class="task-center-todo"><div><strong>{todo.title}</strong><p>{todo.description}</p><em>{todo.due}</em></div><span>{todo.status}</span></article>
      {:else}
        <article class="task-center-empty"><RotateCcw size={20} /><strong>暂无待办</strong><p>需要记住下一步时，在这里新增一条待办。</p><button type="button" onclick={onNewTodo}><Plus size={14} /> 新增待办</button></article>
      {/each}
    </section>
  {:else}
    <section class="task-center-list" aria-label="已归档任务">
      {#each archivedProjects as project (project.id)}
        <section class="task-center-archive-group"><header><div><strong>{project.name}</strong><span>{project.tasks.length} 个已归档任务</span></div><ArchiveRestore size={16} /></header><div>
          {#each project.tasks as task (task.id)}
            <article class="task-center-archive-row"><div><strong>{task.title}</strong><span>{task.updatedAt}</span></div><aside><button type="button" aria-label={`恢复 ${task.title}`} title="恢复任务" onclick={() => onRestoreTask(project.id, task.id)}><RotateCcw size={13} /> 恢复</button><button class="danger" type="button" aria-label={`删除归档任务 ${task.title}`} title="永久删除" onclick={() => onDeleteTask(project.id, task.id)}><Trash2 size={13} /></button></aside></article>
          {/each}
        </div></section>
      {:else}
        <article class="task-center-empty"><ArchiveRestore size={20} /><strong>还没有归档任务</strong><p>归档后的任务会保留在这里，之后仍可恢复。</p></article>
      {/each}
    </section>
  {/if}
</section>

<style>
  .task-center-page { min-height: 100%; padding: 26px clamp(18px, 4vw, 52px) 42px; background: var(--background, #f3f5f2); color: var(--foreground, #1f2421); }
  .task-center-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; max-width: 980px; margin: 0 auto; }
  .task-center-head > div { min-width: 0; }
  .task-center-head span, .task-center-head h1, .task-center-head p { display: block; }
  .task-center-head span { color: var(--muted-foreground, #687169); font-size: 11px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
  .task-center-head h1 { margin: 5px 0 4px; font-size: 24px; line-height: 1.2; letter-spacing: -.03em; }
  .task-center-head p { margin: 0; color: var(--muted-foreground, #687169); font-size: 13px; }
  .task-center-primary, .task-center-subhead > button, .task-center-empty button { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 12px; border: 1px solid var(--foreground, #1f2421); border-radius: 7px; background: var(--foreground, #1f2421); color: #fff; font-size: 12px; font-weight: 650; white-space: nowrap; }
  .task-center-tabs { display: flex; gap: 4px; max-width: 980px; margin: 24px auto 12px; padding: 3px; border: 1px solid var(--border, #dce1db); border-radius: 9px; background: var(--card, #fff); }
  .task-center-tabs button { display: inline-flex; align-items: center; gap: 6px; min-height: 34px; padding: 0 11px; border: 0; border-radius: 6px; background: transparent; color: var(--muted-foreground, #687169); font-size: 12px; font-weight: 600; }
  .task-center-tabs button.active { background: color-mix(in srgb, var(--card, #fff) 82%, var(--foreground, #1f2421) 8%); color: var(--foreground, #1f2421); }
  .task-center-tabs em { min-width: 18px; padding: 1px 5px; border-radius: 999px; background: var(--muted, #edf0ec); color: inherit; font-size: 10px; font-style: normal; text-align: center; }
  .task-center-list { display: grid; gap: 7px; max-width: 980px; margin: 0 auto; }
  .task-center-row, .task-center-todo, .task-center-archive-group { border: 1px solid var(--border, #dce1db); border-radius: 10px; background: var(--card, #fff); }
  .task-center-row { display: grid; grid-template-columns: 34px minmax(0, 1fr) auto; align-items: center; gap: 10px; width: 100%; padding: 11px 13px; color: inherit; text-align: left; }
  .task-center-row:hover { border-color: var(--border-strong, #c7cfc7); background: #fcfdfc; }
  .task-center-row__icon { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 8px; background: color-mix(in srgb, var(--card, #fff) 82%, var(--foreground, #1f2421) 8%); color: var(--foreground, #1f2421); }
  .task-center-row__body, .task-center-todo > div, .task-center-archive-row > div { display: grid; min-width: 0; gap: 3px; }
  .task-center-row__body strong, .task-center-todo strong, .task-center-archive-row strong { overflow: hidden; font-size: 13px; text-overflow: ellipsis; white-space: nowrap; }
  .task-center-row__body em, .task-center-todo em, .task-center-archive-row span { color: var(--muted-foreground, #687169); font-size: 11px; font-style: normal; }
  .task-center-state { padding: 3px 7px; border-radius: 999px; background: var(--muted, #edf0ec); color: var(--muted-foreground, #687169); font-size: 11px; white-space: nowrap; }
  .task-center-state--running { background: var(--success-soft, #e7f5ef); color: var(--success, #0f7b55); }
  .task-center-state--warning { background: var(--warning-soft, #fff4de); color: var(--warning, #9a5b00); }
  .task-center-state--danger { background: var(--danger-soft, #fdecea); color: var(--danger, #b42318); }
  .task-center-subhead { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 4px; }
  .task-center-subhead > div { display: grid; gap: 2px; }
  .task-center-subhead strong { font-size: 14px; }
  .task-center-subhead span { color: var(--muted-foreground, #687169); font-size: 11px; }
  .task-center-subhead > button { min-height: 30px; padding-inline: 10px; }
  .task-center-todo { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; }
  .task-center-todo p { margin: 0; color: var(--muted-foreground, #687169); font-size: 12px; }
  .task-center-todo > span { color: var(--muted-foreground, #687169); font-size: 11px; white-space: nowrap; }
  .task-center-empty { display: grid; justify-items: center; gap: 8px; padding: 54px 20px; border: 1px dashed var(--border-strong, #c7cfc7); border-radius: 10px; background: color-mix(in srgb, var(--card, #fff) 72%, transparent); text-align: center; }
  .task-center-empty > :global(svg) { color: var(--muted-foreground, #687169); }
  .task-center-empty strong { font-size: 14px; }
  .task-center-empty p { max-width: 420px; margin: 0; color: var(--muted-foreground, #687169); font-size: 12px; }
  .task-center-empty button { margin-top: 4px; }
  .task-center-archive-group { overflow: hidden; }
  .task-center-archive-group > header { display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border, #dce1db); }
  .task-center-archive-group > header > div { display: grid; gap: 2px; }
  .task-center-archive-group > header strong { font-size: 13px; }
  .task-center-archive-group > header span { color: var(--muted-foreground, #687169); font-size: 11px; }
  .task-center-archive-group > header > :global(svg) { color: var(--muted-foreground, #687169); }
  .task-center-archive-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 14px; }
  .task-center-archive-row + .task-center-archive-row { border-top: 1px solid var(--border, #dce1db); }
  .task-center-archive-row aside { display: flex; gap: 4px; }
  .task-center-archive-row button { display: inline-flex; align-items: center; gap: 4px; min-height: 28px; padding: 0 7px; border: 1px solid transparent; border-radius: 6px; background: transparent; color: var(--muted-foreground, #687169); font-size: 11px; }
  .task-center-archive-row button:hover { border-color: var(--border, #dce1db); background: var(--muted, #edf0ec); color: var(--foreground, #1f2421); }
  .task-center-archive-row button.danger:hover { color: var(--danger, #b42318); }
  @media (max-width: 720px) {
    .task-center-page { padding: 20px 14px 28px; }
    .task-center-head { display: grid; gap: 14px; }
    .task-center-primary { justify-self: start; }
    .task-center-tabs { margin-top: 18px; overflow-x: auto; }
    .task-center-tabs button { flex: 0 0 auto; }
    .task-center-row { grid-template-columns: 30px minmax(0, 1fr); }
    .task-center-state { grid-column: 2; justify-self: start; }
    .task-center-subhead { align-items: flex-start; }
    .task-center-todo { align-items: flex-start; }
  }
</style>
