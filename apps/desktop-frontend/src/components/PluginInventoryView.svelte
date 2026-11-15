<script lang="ts">
import {
  Activity, Blocks, BookOpen, Bot, Check, CheckSquare, Compass, Cpu,
  FileCode, FileText, FolderOpen, GitFork, Globe, HardDrive, HelpCircle,
  Layers, Minimize2, Network, RefreshCw, Search, ShieldAlert, Sparkles,
  Terminal, TerminalSquare, Workflow, Wrench, X,
} from "@lucide/svelte";
import { Button } from "$components/ui/button";
import { Input } from "$components/ui/input";
import { DataState, SettingsGroup } from "@svadmin/ui";
import type { DshClient, ManagedPluginEntry, PluginInventoryEntry } from "$lib/dsh-client";
import {
  PLUGIN_CATEGORIES,
  filterEnrichedPlugins,
  separatePluginsAndMcp,
  type PluginCategory,
} from "$lib/plugin-i18n";
import { t, i18n } from "$lib/i18n";

type Props = {
  entries: PluginInventoryEntry[];
  onRefresh?: () => void;
  client?: DshClient;
  onNotice?: (message: string) => void;
  onError?: (message: string) => void;
};

let { entries, onRefresh, client, onNotice, onError }: Props = $props();

/** 官方 `listPlugins` 给出的可写身份；读不到时保持只读，绝不猜 patchId。 */
let managed = $state<Record<string, ManagedPluginEntry>>({});
let toggleBusy = $state("");

$effect(() => {
  if (!client) return;
  let cancelled = false;
  void client.listManagedPlugins()
    .then((result) => {
      if (cancelled) return;
      managed = Object.fromEntries(result.entries.map((entry) => [entry.entryId, entry]));
    })
    .catch(() => { if (!cancelled) managed = {}; });
  return () => { cancelled = true; };
});

/** 官方的只读原因是带连字符的枚举，翻译键用下划线：显式映射，不拼字符串。 */
function readOnlyReasonLabel(reason: string): string {
  if (reason === "management-required") return t("plugins.readOnly_management_required");
  if (reason === "unaddressable") return t("plugins.readOnly_unaddressable");
  return t("plugins.readOnly");
}

async function togglePlugin(entryId: string, enabled: boolean): Promise<void> {
  if (!client) return;
  toggleBusy = entryId;
  try {
    const result = await client.setPluginEnabled(entryId, enabled);
    // 五种结果都不是"成功"的同义词：overridden 说明写进去了但没生效。
    if (result.application === "failed") onError?.(result.error?.message || t("plugins.toggleFailed"));
    else if (result.application === "cancelled") onError?.(t("plugins.toggleCancelled"));
    else if (result.application === "overridden") onError?.(t("plugins.toggleOverridden"));
    else if (result.application === "restart-required") onNotice?.(t("plugins.restartRequired"));
    else onNotice?.(enabled ? t("plugins.enabledNotice") : t("plugins.disabledNotice"));
    onRefresh?.();
  } catch (error) {
    onError?.(error instanceof Error ? error.message : String(error));
  } finally {
    toggleBusy = "";
  }
}

let searchQuery = $state("");
let selectedCategory = $state<PluginCategory | "all">("all");

const currentLocale = $derived(i18n.locale);
const partitioned = $derived(separatePluginsAndMcp(entries, currentLocale));
const purePlugins = $derived(partitioned.plugins);
const filteredPlugins = $derived(filterEnrichedPlugins(purePlugins, searchQuery, selectedCategory));

const enabledCount = $derived(purePlugins.filter((p) => p.enabled).length);
const activeFiberCount = $derived(purePlugins.filter((p) => p.fiberPhase === "active").length);

const categoryCounts = $derived.by(() => {
  const counts: Record<string, number> = { all: purePlugins.length };
  for (const p of purePlugins) {
    counts[p.info.category] = (counts[p.info.category] || 0) + 1;
  }
  return counts;
});

const categoriesList = $derived(
  (Object.keys(PLUGIN_CATEGORIES) as PluginCategory[]).filter(
    (cat) => cat !== "mcp" && (categoryCounts[cat] || 0) > 0,
  ),
);

function getCategoryIcon(cat: PluginCategory) {
  switch (cat) {
    case "core": return Bot;
    case "tools": return Wrench;
    case "terminal": return Terminal;
    case "filesystem": return FolderOpen;
    case "planning": return Compass;
    case "subagents": return Network;
    case "compaction": return Minimize2;
    case "skills": return Sparkles;
    case "model": return Cpu;
    case "workflow": return Workflow;
    case "infrastructure": return Layers;
    case "browser": return Globe;
    default: return Blocks;
  }
}

function getFiberPhaseLabel(phase?: string | null): string {
  if (phase === "active") return t("plugins.fiberActive");
  if (phase === "failed") return t("plugins.fiberFailed");
  return phase || t("plugins.fiberNone");
}

</script>

<SettingsGroup
  title={t("plugins.title")}
  description={t("plugins.description")}
>
  <div class="plugin-view-header">
    <div class="plugin-stats-bar">
      {#if onRefresh}
        <Button variant="outline" size="sm" onclick={onRefresh}>
          <RefreshCw size={13} />
          <span>{t("plugins.refresh")}</span>
        </Button>
      {/if}
      <span class="management-capability">{t("plugins.totalCount", { count: purePlugins.length })}</span>
      <span class="management-capability">{t("plugins.enabledCount", { count: enabledCount })}</span>
      <span class="management-capability">{t("plugins.activeFiberCount", { count: activeFiberCount })}</span>
    </div>

    <div class="plugin-search-box">
      <Search size={14} />
      <Input
        aria-label={t("plugins.searchAriaLabel")}
        placeholder={t("plugins.searchPlaceholder")}
        bind:value={searchQuery}
      />
      {#if searchQuery}
        <button
          class="plugin-clear-btn"
          aria-label={t("plugins.clearSearch")}
          onclick={() => (searchQuery = "")}
        >
          <X size={13} />
        </button>
      {/if}
    </div>
  </div>

  <div class="plugin-category-nav" role="tablist" aria-label={t("plugins.categoryNavAria")}>
    <button
      class="plugin-cat-chip"
      class:active={selectedCategory === "all"}
      onclick={() => (selectedCategory = "all")}
    >
      <span>{t("plugins.categoryAll")}</span>
      <span class="cat-count">{categoryCounts.all || 0}</span>
    </button>

    {#each categoriesList as cat (cat)}
      <button
        class="plugin-cat-chip"
        class:active={selectedCategory === cat}
        onclick={() => (selectedCategory = cat)}
      >
        <span>{t(`plugins.categories.${cat}`)}</span>
        <span class="cat-count">{categoryCounts[cat] || 0}</span>
      </button>
    {/each}
  </div>

  {#if purePlugins.length === 0}
    <DataState
      state="empty"
      title={t("plugins.emptyListTitle")}
      description={t("plugins.emptyListDesc")}
    />
  {:else if filteredPlugins.length === 0}
    <div class="plugin-empty-search">
      <Search size={24} />
      <p>{t("plugins.emptySearchTitle", { query: searchQuery })}</p>
      <Button
        variant="outline"
        size="sm"
        onclick={() => {
          searchQuery = "";
          selectedCategory = "all";
        }}
      >
        {t("plugins.clearFilters")}
      </Button>
    </div>
  {:else}
    <div class="plugin-card-grid">
      {#each filteredPlugins as plugin (plugin.entryId)}
        {@const IconComp = getCategoryIcon(plugin.info.category)}
        <div
          class="plugin-card"
          class:plugin-card--disabled={!plugin.enabled}
          class:plugin-card--active={plugin.fiberPhase === "active"}
        >
          <div class="plugin-card-top">
            <div class="plugin-card-header-left">
              <span class="plugin-card-icon">
                <IconComp size={16} />
              </span>
              <div class="plugin-card-title-wrap">
                <div class="plugin-card-title-row">
                  <strong>{plugin.info.name}</strong>
                  <span class="plugin-category-badge">{plugin.info.categoryLabel}</span>
                </div>
              </div>
            </div>

            <div class="plugin-card-badges">
              <span
                class={`status-badge-capsule ${plugin.enabled ? "status-badge-capsule--success" : "status-badge-capsule--neutral"}`}
              >
                {plugin.enabled ? t("common.enabled") : t("common.disabled")}
              </span>
              <span class={`plugin-phase plugin-phase--${plugin.fiberPhase || "none"}`}>
                {getFiberPhaseLabel(plugin.fiberPhase)}
              </span>
              {#if managed[plugin.entryId]?.patchId}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={toggleBusy === plugin.entryId}
                  title={plugin.enabled ? t("plugins.disableHint") : t("plugins.enableHint")}
                  onclick={() => void togglePlugin(plugin.entryId, !plugin.enabled)}
                >{plugin.enabled ? t("plugins.disableAction") : t("plugins.enableAction")}</Button>
              {:else if managed[plugin.entryId]?.readOnlyReason}
                <small class="plugin-readonly" title={readOnlyReasonLabel(managed[plugin.entryId].readOnlyReason ?? "")}>{t("plugins.readOnly")}</small>
              {/if}
            </div>
          </div>

          <div class="plugin-card-description-block">
            <span class="plugin-card-description-label">{t("plugins.chineseDescription")}</span>
            <p class="plugin-card-description">{plugin.info.description}</p>
          </div>

          {#if plugin.info.tags && plugin.info.tags.length > 0}
            <div class="plugin-card-footer">
              <div class="plugin-tag-list">
                {#each plugin.info.tags as tag, tagIndex (`${tag}:${tagIndex}`)}
                  <span class="plugin-keyword-tag">{tag}</span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}

  <div class="knowledge-note">
    <ShieldAlert size={14} />
    <span>
      {t("plugins.note")}
    </span>
  </div>
</SettingsGroup>
