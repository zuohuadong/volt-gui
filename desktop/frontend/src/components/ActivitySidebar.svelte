<script lang="ts">
  import {
    Activity,
    ArrowDown,
    ArrowUp,
    Bot,
    Check,
    Code2,
    Database,
    FolderGit2,
    FolderOpen,
    Globe2,
    MessageSquare,
    Pencil,
    Plus,
    Trash2,
    X,
  } from "@lucide/svelte";
  import type { ActivityMode, ProjectNode, TabMeta } from "../lib/types";
  import { t } from "../lib/i18n";

  const colorSwatches = ["blue", "teal", "violet", "amber", "rose", "slate"] as const;
  const swatchValues: Record<string, string> = {
    blue: "#2563eb",
    teal: "#0f766e",
    violet: "#7c3aed",
    amber: "#d97706",
    rose: "#e11d48",
    slate: "#475569",
  };

  let {
    activityMode,
    tabs,
    activeTab,
    projectTree,
    resources,
    onActivity,
    onTab,
    onCloseTab,
    onNewTab,
    onMoveTab,
    onOpenTopic,
    onNewTopic,
    onRenameProject,
    onSetProjectColor,
    onMoveProject,
    onRenameTopic,
    onTrashTopic,
  }: {
    activityMode: ActivityMode;
    tabs: TabMeta[];
    activeTab?: TabMeta;
    projectTree: ProjectNode[];
    resources: Array<{ name: string; total: number }>;
    onActivity: (mode: ActivityMode) => void;
    onTab: (tab: TabMeta) => void;
    onCloseTab: (tab: TabMeta) => void;
    onNewTab: () => void;
    onMoveTab: (tab: TabMeta, direction: "up" | "down") => void;
    onOpenTopic: (node: ProjectNode) => void;
    onNewTopic: (node: ProjectNode) => void;
    onRenameProject: (node: ProjectNode, title: string) => void;
    onSetProjectColor: (node: ProjectNode, color: string) => void;
    onMoveProject: (node: ProjectNode, direction: "up" | "down") => void;
    onRenameTopic: (node: ProjectNode, title: string) => void;
    onTrashTopic: (node: ProjectNode) => void;
  } = $props();

  let editingKey = $state("");
  let editingValue = $state("");

  const projectNodes = $derived(projectTree.filter((node) => node.kind === "project"));

  function startRename(node: ProjectNode) {
    editingKey = node.key;
    editingValue = node.label;
  }

  function cancelRename() {
    editingKey = "";
    editingValue = "";
  }

  function commitRename(node: ProjectNode) {
    const title = editingValue.trim();
    if (title && title !== node.label) {
      if (node.kind === "project" || node.kind === "global_folder") onRenameProject(node, title);
      if (node.kind === "topic" || node.kind === "global_topic") onRenameTopic(node, title);
    }
    cancelRename();
  }

  function topicActive(node: ProjectNode) {
    if (!activeTab || !node.topicId) return false;
    if (node.kind === "global_topic") return activeTab.scope === "global" && activeTab.topicId === node.topicId;
    return activeTab.scope === "project" && activeTab.workspaceRoot === node.root && activeTab.topicId === node.topicId;
  }

  function projectIndex(node: ProjectNode) {
    return projectNodes.findIndex((item) => item.key === node.key);
  }

  function colorValue(color?: string) {
    return swatchValues[color ?? ""] ?? swatchValues.slate;
  }
</script>

<aside class="sidebar">
  <div class="brand">
    <div class="brand__mark"><Activity size={18} /></div>
    <div>
      <strong>VoltUI</strong>
      <span>Workbench</span>
    </div>
  </div>

  <div class="activity-switch" aria-label="Activity mode">
    <button
      class={activityMode === "work" ? "is-active" : ""}
      type="button"
      aria-pressed={activityMode === "work"}
      aria-keyshortcuts="Control+1 Meta+1"
      onclick={() => onActivity("work")}
    >
      <Bot size={16} />
      {t.activity.work}
    </button>
    <button
      class={activityMode === "code" ? "is-active" : ""}
      type="button"
      aria-pressed={activityMode === "code"}
      aria-keyshortcuts="Control+2 Meta+2"
      onclick={() => onActivity("code")}
    >
      <Code2 size={16} />
      {t.activity.code}
    </button>
  </div>

  <section>
    <div class="section-heading">
      <h2>{t.activity.sessions}</h2>
      <button class="icon-button" type="button" aria-label="{t.activity.newSession}" title="{t.activity.newSession}" onclick={onNewTab}>
        <Plus size={14} />
      </button>
    </div>
    <div class="nav-list">
      {#each tabs as tab, index (tab.id)}
        <div class={tab.id === activeTab?.id ? "nav-row is-active" : "nav-row"}>
          <button type="button" onclick={() => onTab(tab)}>
            <FolderGit2 size={15} />
            <span>{tab.topicTitle || tab.workspaceName || t.activity.untitled}</span>
          </button>
          <button class="icon-button" type="button" aria-label={t.activity.moveUp} title={t.activity.moveUp} disabled={index === 0} onclick={() => onMoveTab(tab, "up")}>
            <ArrowUp size={14} />
          </button>
          <button
            class="icon-button"
            type="button"
            aria-label="Move tab down"
            title="Move tab down"
            disabled={index === tabs.length - 1}
            onclick={() => onMoveTab(tab, "down")}
          >
            <ArrowDown size={14} />
          </button>
          <button class="icon-button" type="button" aria-label="Close tab" onclick={() => onCloseTab(tab)}>
            <X size={14} />
          </button>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <div class="section-heading">
      <h2>{t.activity.workspaces}</h2>
    </div>
    <div class="project-tree" data-testid="project-tree">
      {#each projectTree as node (node.key)}
        <div class="project-group" data-kind={node.kind} data-root={node.root ?? ""} style:--project-color={colorValue(node.projectColor)}>
          <div class="project-row">
            <button class="project-title" type="button" onclick={() => onNewTopic(node)}>
              {#if node.kind === "global_folder"}
                <Globe2 size={15} />
              {:else}
                <FolderOpen size={15} />
              {/if}
              {#if editingKey === node.key}
                <input
                  aria-label="Project title"
                  bind:value={editingValue}
                  onkeydown={(event) => {
                    if (event.key === "Enter") commitRename(node);
                    if (event.key === "Escape") cancelRename();
                  }}
                  onclick={(event) => event.stopPropagation()}
                />
              {:else}
                <span>{node.label}</span>
              {/if}
            </button>
            {#if editingKey === node.key}
              <button class="icon-button" type="button" aria-label="Save project title" onclick={() => commitRename(node)}>
                <Check size={14} />
              </button>
            {:else}
              <button class="icon-button" type="button" aria-label={t.activity.rename} title={t.activity.rename} onclick={() => startRename(node)}>
                <Pencil size={14} />
              </button>
            {/if}
            {#if node.kind === "project"}
              <button
                class="icon-button"
                type="button"
                aria-label={t.activity.moveUp}
                title={t.activity.moveUp}
                disabled={projectIndex(node) <= 0}
                onclick={() => onMoveProject(node, "up")}
              >
                <ArrowUp size={14} />
              </button>
              <button
                class="icon-button"
                type="button"
                aria-label={t.activity.moveDown}
                title={t.activity.moveDown}
                disabled={projectIndex(node) === projectNodes.length - 1}
                onclick={() => onMoveProject(node, "down")}
              >
                <ArrowDown size={14} />
              </button>
            {/if}
            <button class="icon-button" type="button" aria-label={t.activity.newTopic} title={t.activity.newTopic} data-testid="new-topic" onclick={() => onNewTopic(node)}>
              <Plus size={14} />
            </button>
          </div>
          <div class="swatches" aria-label="Project color">
            {#each colorSwatches as color (color)}
              <button
                class:active={node.projectColor === color}
                style:--swatch={colorValue(color)}
                type="button"
                aria-label={`Set ${color} color`}
                title={color}
                onclick={() => onSetProjectColor(node, color)}
              ></button>
            {/each}
          </div>
          <div class="topic-list">
            {#each node.children ?? [] as child (child.key)}
              <div class={topicActive(child) ? "topic-row is-active" : "topic-row"} data-topic={child.topicId ?? ""} data-kind={child.kind}>
                <button type="button" onclick={() => onOpenTopic(child)}>
                  <MessageSquare size={14} />
                  {#if editingKey === child.key}
                    <input
                      aria-label="Topic title"
                      bind:value={editingValue}
                      onkeydown={(event) => {
                        if (event.key === "Enter") commitRename(child);
                        if (event.key === "Escape") cancelRename();
                      }}
                      onclick={(event) => event.stopPropagation()}
                    />
                  {:else}
                    <span>{child.label || t.activity.untitled}</span>
                  {/if}
                  {#if child.running}
                    <em>{t.activity.running}</em>
                  {:else if child.open}
                    <em>{t.activity.open}</em>
                  {/if}
                </button>
                {#if editingKey === child.key}
                  <button class="icon-button" type="button" aria-label="Save topic title" onclick={() => commitRename(child)}>
                    <Check size={14} />
                  </button>
                {:else}
                  <button class="icon-button" type="button" aria-label={t.activity.rename} title={t.activity.rename} onclick={() => startRename(child)}>
                    <Pencil size={14} />
                  </button>
                {/if}
                <button class="icon-button" type="button" aria-label={t.activity.moveTopicToTrash} title={t.activity.moveTopicToTrash} onclick={() => onTrashTopic(child)}>
                  <Trash2 size={14} />
                </button>
              </div>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  </section>

</aside>
