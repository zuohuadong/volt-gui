<script lang="ts">
  import { Activity, Bot, Code2, Database, FolderGit2, X } from "@lucide/svelte";
  import type { ActivityMode, TabMeta } from "../lib/types";

  let {
    activityMode,
    tabs,
    activeTab,
    resources,
    onActivity,
    onTab,
    onCloseTab,
  }: {
    activityMode: ActivityMode;
    tabs: TabMeta[];
    activeTab?: TabMeta;
    resources: Array<{ name: string; total: number }>;
    onActivity: (mode: ActivityMode) => void;
    onTab: (tab: TabMeta) => void;
    onCloseTab: (tab: TabMeta) => void;
  } = $props();
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
    <button class={activityMode === "work" ? "is-active" : ""} type="button" onclick={() => onActivity("work")}>
      <Bot size={16} />
      Work
    </button>
    <button class={activityMode === "code" ? "is-active" : ""} type="button" onclick={() => onActivity("code")}>
      <Code2 size={16} />
      Code
    </button>
  </div>

  <section>
    <h2>Sessions</h2>
    <div class="nav-list">
      {#each tabs as tab (tab.id)}
        <div class={tab.id === activeTab?.id ? "nav-row is-active" : "nav-row"}>
          <button type="button" onclick={() => onTab(tab)}>
            <FolderGit2 size={15} />
            <span>{tab.topicTitle || tab.workspaceName || "Untitled"}</span>
          </button>
          <button class="icon-button" type="button" aria-label="Close tab" onclick={() => onCloseTab(tab)}>
            <X size={14} />
          </button>
        </div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Resources</h2>
    <div class="resource-list">
      {#each resources as resource (resource.name)}
        <span><Database size={13} /> {resource.name} <em>{resource.total}</em></span>
      {/each}
    </div>
  </section>
</aside>
