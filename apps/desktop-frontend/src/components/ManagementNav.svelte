<script lang="ts">
  import {
    Blocks,
    BookOpen,
    Bot,
    Cable,
    ClipboardList,
    ChevronDown,
    FolderOpen,
    HardDrive,
    MessageSquare,
    Network,
    Settings2,
    ShieldAlert,
    Target,
    UserRoundCog,
  } from "@lucide/svelte";

  export type ManagementTab =
    | "overview"
    | "sessions"
    | "goals"
    | "subagents"
    | "agents"
    | "models"
    | "workspaces"
    | "mounts"
    | "plugins"
    | "mcp"
    | "knowledge"
    | "settings"
    | "runtime";

  interface Props {
    readonly activeTab: ManagementTab;
    readonly ariaLabel: string;
    readonly labels: Record<ManagementTab, string>;
    readonly moreLabel: string;
    readonly onSelect: (tab: ManagementTab) => void;
  }

  let { activeTab, ariaLabel, labels, moreLabel, onSelect }: Props = $props();

  const primaryTabs = [
    { id: "overview", icon: ClipboardList },
    { id: "sessions", icon: MessageSquare },
    { id: "models", icon: Bot },
    { id: "settings", icon: Settings2 },
    { id: "runtime", icon: ShieldAlert },
  ] as const;

  const advancedTabs = [
    { id: "goals", icon: Target },
    { id: "subagents", icon: Network },
    { id: "agents", icon: UserRoundCog },
    { id: "workspaces", icon: FolderOpen },
    { id: "mounts", icon: HardDrive },
    { id: "plugins", icon: Blocks },
    { id: "mcp", icon: Cable },
    { id: "knowledge", icon: BookOpen },
  ] as const;

  const advancedActive = $derived(advancedTabs.some((tab) => tab.id === activeTab));
</script>

<nav class="management-nav" aria-label={ariaLabel}>
  {#each primaryTabs as tab (tab.id)}
    <button
      type="button"
      class:active={activeTab === tab.id}
      aria-current={activeTab === tab.id ? "page" : undefined}
      onclick={() => onSelect(tab.id)}
    >
      <tab.icon size={15} /><span>{labels[tab.id]}</span>
    </button>
  {/each}
  <details class="management-nav-advanced" open={advancedActive}>
    <summary><span>{moreLabel}</span><ChevronDown size={14} /></summary>
    <div>
      {#each advancedTabs as tab (tab.id)}
        <button
          type="button"
          class:active={activeTab === tab.id}
          aria-current={activeTab === tab.id ? "page" : undefined}
          onclick={() => onSelect(tab.id)}
        >
          <tab.icon size={15} /><span>{labels[tab.id]}</span>
        </button>
      {/each}
    </div>
  </details>
</nav>
