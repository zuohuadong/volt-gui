<script lang="ts">
  import { onMount } from "svelte";
  import { Download, GitBranch, Package, RefreshCw, RotateCcw, Search, Trash2, Upload } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { Input } from "$components/ui/input";
  import { StatusBadge } from "@svadmin/ui";
  import type { DshClient } from "$lib/dsh-client";
  import { t } from "$lib/i18n";
  import {
    countSkillsByCategory,
    filterSkills,
    formatSkillSize,
    inferSkillCategory,
    SKILL_CATEGORIES,
    sortSkills,
    type SkillCategoryId,
    type SkillInstallFilter,
    type SkillSortOrder,
  } from "$lib/skill-categories";

  type SkillStoreEntry = {
    id: string;
    version: string;
    title?: string;
    description?: string;
    whenToUse?: string;
    tags?: string[];
    scenarios?: string[];
    category?: string;
    updatedAt?: string;
    maintainer?: string;
    sizeBytes?: number;
    installedAt?: string;
    installed: boolean;
    updateAvailable: boolean;
  };
  type SkillStoreState = {
    available: boolean;
    directory?: string;
    skills: SkillStoreEntry[];
    error?: string;
    remoteError?: string;
    tokenConfigured: boolean;
  };
  type SkillStoreAction = { ok: boolean; error?: string };

  const REPOSITORY_URL = "https://git.ai.xigu.team/xg/anyong-skills";
  // 与主进程、CLI 使用同一个凭据引用名。
  const TOKEN_REF = "ANYONG_SKILLS_TOKEN";
  const SORT_OPTIONS: readonly { id: SkillSortOrder; labelKey: string }[] = [
    { id: "recommended", labelKey: "skillStore.sortRecommended" },
    { id: "updated", labelKey: "skillStore.sortUpdated" },
    { id: "name", labelKey: "skillStore.sortName" },
  ];
  const INSTALL_FILTERS: readonly { id: SkillInstallFilter; labelKey: string }[] = [
    { id: "all", labelKey: "skillStore.filterAll" },
    { id: "installed", labelKey: "skillStore.filterInstalled" },
    { id: "updates", labelKey: "skillStore.filterUpdates" },
  ];

  let { client }: { client?: DshClient } = $props();

  let store = $state<SkillStoreState>();
  let loading = $state(true);
  let busyId = $state("");
  let message = $state("");
  let failed = $state(false);
  let tokenDraft = $state("");
  let tokenBusy = $state(false);
  let tokenMessage = $state("");
  let tokenFailed = $state(false);
  let tokenOpen = $state(false);
  let query = $state("");
  let category = $state<SkillCategoryId | "all">("all");
  let installFilter = $state<SkillInstallFilter>("all");
  let sortOrder = $state<SkillSortOrder>("recommended");
  let selectedId = $state("");

  const skills = $derived(store?.skills ?? []);
  const counts = $derived(countSkillsByCategory(skills));
  const visible = $derived(sortSkills(filterSkills(skills, { category, query, installFilter }), sortOrder));
  const installedCount = $derived(skills.filter((skill) => skill.installed).length);
  const updateCount = $derived(skills.filter((skill) => skill.updateAvailable).length);
  const selected = $derived(skills.find((skill) => skill.id === selectedId));

  function categoryLabel(skill: SkillStoreEntry): string {
    return t(SKILL_CATEGORIES.find((entry) => entry.id === inferSkillCategory(skill))?.labelKey ?? "skillStore.categories.other");
  }

  async function refresh(): Promise<void> {
    const shell = window.voltDesktop;
    if (!shell?.skillsList) {
      store = { available: false, skills: [], tokenConfigured: false };
      loading = false;
      return;
    }
    loading = true;
    try {
      store = await shell.skillsList();
    } catch (error) {
      store = { available: true, skills: [], tokenConfigured: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      loading = false;
    }
  }

  async function run(id: string, action: () => Promise<SkillStoreAction>): Promise<boolean> {
    busyId = id;
    message = "";
    failed = false;
    try {
      const result = await action();
      if (result.ok) {
        message = t("skillStore.actionDone");
      } else {
        failed = true;
        message = result.error || t("skillStore.actionFailed");
      }
      await refresh();
      return result.ok;
    } catch (error) {
      failed = true;
      message = error instanceof Error ? error.message : String(error);
      return false;
    } finally {
      busyId = "";
    }
  }

  function install(skill: SkillStoreEntry): void {
    const shell = window.voltDesktop;
    if (!shell?.skillsInstall) return;
    void run(skill.id, () => shell.skillsInstall(skill.id));
  }

  function remove(skill: SkillStoreEntry): void {
    const shell = window.voltDesktop;
    if (!shell?.skillsRemove) return;
    void run(skill.id, () => shell.skillsRemove(skill.id));
  }

  function rollback(skill: SkillStoreEntry): void {
    const shell = window.voltDesktop;
    if (!shell?.skillsRollback) return;
    void run(skill.id, () => shell.skillsRollback(skill.id));
  }

  /** 逐个更新，失败即停并保留已完成的结果；不做并发以免叠加归档下载。 */
  async function updateAll(): Promise<void> {
    const pending = skills.filter((skill) => skill.updateAvailable);
    if (pending.length === 0) return;
    for (const skill of pending) {
      const shell = window.voltDesktop;
      if (!shell?.skillsInstall) return;
      const ok = await run(skill.id, () => shell.skillsInstall!(skill.id));
      if (!ok) return;
    }
    message = t("skillStore.updateAllDone", { count: pending.length });
  }

  async function saveToken(): Promise<void> {
    const value = tokenDraft.trim();
    if (!client || !value) return;
    tokenBusy = true;
    tokenFailed = false;
    tokenMessage = "";
    try {
      // 写入官方 DSH credentials service，不落应用私有明文文件。
      await client.setCredential(TOKEN_REF, value);
      tokenDraft = "";
      tokenMessage = t("skillStore.tokenSaved");
      await refresh();
    } catch (error) {
      tokenFailed = true;
      tokenMessage = error instanceof Error ? error.message : String(error);
    } finally {
      tokenBusy = false;
    }
  }

  async function clearToken(): Promise<void> {
    if (!client) return;
    tokenBusy = true;
    tokenFailed = false;
    tokenMessage = "";
    try {
      await client.unsetCredential(TOKEN_REF);
      tokenDraft = "";
      tokenMessage = t("skillStore.tokenCleared");
      await refresh();
    } catch (error) {
      tokenFailed = true;
      tokenMessage = error instanceof Error ? error.message : String(error);
    } finally {
      tokenBusy = false;
    }
  }

  function openRepository(): void {
    void window.voltDesktop?.openExternal(REPOSITORY_URL);
  }

  function openSkillSource(skill: SkillStoreEntry): void {
    void window.voltDesktop?.openExternal(`${REPOSITORY_URL}/src/branch/main/skills/${skill.id}`);
  }

  function selectSkill(skill: SkillStoreEntry): void {
    selectedId = selectedId === skill.id ? "" : skill.id;
  }

  onMount(() => {
    void refresh();
  });
</script>

<section class="skill-store">
  <header class="store-head">
    <div class="store-title">
      <span class="store-icon"><Package size={16} /></span>
      <div>
        <h3>{t("skillStore.title")}</h3>
        <p>{t("skillStore.description")}</p>
      </div>
    </div>
    <div class="store-actions">
      {#if updateCount > 0}
        <Button size="sm" disabled={Boolean(busyId)} onclick={() => void updateAll()}>
          <Upload size={14} /><span>{t("skillStore.updateAll", { count: updateCount })}</span>
        </Button>
      {/if}
      <Button variant="outline" size="sm" onclick={openRepository}>
        <GitBranch size={14} /><span>{t("skillStore.openRepository")}</span>
      </Button>
      <Button variant="outline" size="sm" disabled={loading} onclick={() => void refresh()}>
        <RefreshCw size={14} /><span>{t("skillStore.refresh")}</span>
      </Button>
    </div>
  </header>

  {#if store && !store.available}
    <p class="store-warning">{t("skillStore.unavailable")}</p>
  {:else if store?.error}
    <p class="store-warning error">{store.error}</p>
  {:else}
    <div class="store-status">
      {#if store?.directory}
        <p class="store-dir">{t("skillStore.directory")}：<code>{store.directory}</code></p>
      {/if}
      <button class="token-toggle" onclick={() => (tokenOpen = !tokenOpen)}>
        {store?.tokenConfigured ? t("skillStore.tokenConfigured") : t("skillStore.noToken")}
        <span>{tokenOpen ? t("common.collapse") : t("skillStore.tokenManage")}</span>
      </button>
    </div>

    {#if tokenOpen}
      <div class="token-row">
        <div class="token-label">
          <strong>{t("skillStore.tokenTitle")}</strong>
          <small>{store?.tokenConfigured ? t("skillStore.tokenConfigured") : t("skillStore.noToken")}</small>
        </div>
        <div class="token-input">
          <Input
            type="password"
            aria-label={t("skillStore.tokenTitle")}
            placeholder={t("skillStore.tokenPlaceholder")}
            bind:value={tokenDraft}
            disabled={tokenBusy || !client}
          />
          <Button size="sm" disabled={tokenBusy || !client || !tokenDraft.trim()} onclick={() => void saveToken()}>
            {t("skillStore.tokenSave")}
          </Button>
          <Button variant="ghost" size="sm" disabled={tokenBusy || !client || !store?.tokenConfigured} onclick={() => void clearToken()}>
            {t("skillStore.tokenClear")}
          </Button>
        </div>
        {#if tokenMessage}
          <small class="token-status" class:error={tokenFailed}>{tokenMessage}</small>
        {/if}
      </div>
    {/if}

    {#if store?.remoteError}
      <p class="store-warning" title={store.remoteError}>{t("skillStore.remoteFailed")}</p>
    {/if}
    {#if message}
      <p class="store-warning" class:error={failed}>{message}</p>
    {/if}

    {#if loading}
      <p class="store-empty">{t("skillStore.loading")}</p>
    {:else if skills.length === 0}
      <p class="store-empty">{t("skillStore.empty")}</p>
    {:else}
      <div class="store-layout">
        <nav class="category-nav" aria-label={t("skillStore.categoriesLabel")}>
          <button class="category-item" class:active={category === "all"} onclick={() => (category = "all")}>
            <span>{t("skillStore.filterAll")}</span><small>{counts.all}</small>
          </button>
          {#each SKILL_CATEGORIES as entry (entry.id)}
            {#if counts[entry.id] > 0}
              <button class="category-item" class:active={category === entry.id} onclick={() => (category = entry.id)}>
                <span>{t(entry.labelKey)}</span><small>{counts[entry.id]}</small>
              </button>
            {/if}
          {/each}
        </nav>

        <div class="store-main">
          <div class="store-toolbar">
            <div class="search-box">
              <Search size={14} />
              <Input
                aria-label={t("skillStore.searchPlaceholder")}
                placeholder={t("skillStore.searchPlaceholder")}
                bind:value={query}
              />
            </div>
            <div class="filter-chips">
              {#each INSTALL_FILTERS as filter (filter.id)}
                <button
                  class="chip-button"
                  class:active={installFilter === filter.id}
                  onclick={() => (installFilter = filter.id)}
                >
                  {t(filter.labelKey)}{#if filter.id === "installed"} {installedCount}{:else if filter.id === "updates"} {updateCount}{/if}
                </button>
              {/each}
            </div>
            <label class="sort-select">
              <span>{t("skillStore.sortLabel")}</span>
              <select bind:value={sortOrder}>
                {#each SORT_OPTIONS as option (option.id)}
                  <option value={option.id}>{t(option.labelKey)}</option>
                {/each}
              </select>
            </label>
          </div>

          {#if visible.length === 0}
            <p class="store-empty">{t("skillStore.noMatch")}</p>
          {:else}
            <ul class="skill-grid">
              {#each visible as skill (skill.id)}
                <li class="skill-card" class:selected={selected?.id === skill.id}>
                  <button class="card-main" onclick={() => selectSkill(skill)}>
                    <div class="card-head">
                      <strong>{skill.title || skill.id}</strong>
                      {#if skill.updateAvailable}
                        <StatusBadge status="warning" />
                      {:else if skill.installed}
                        <StatusBadge status="success" />
                      {/if}
                    </div>
                    {#if skill.description}<p class="card-desc">{skill.description}</p>{/if}
                    <div class="card-meta">
                      <span class="meta-chip">{categoryLabel(skill)}</span>
                      <span>v{skill.version}</span>
                      {#if formatSkillSize(skill.sizeBytes)}<span>{formatSkillSize(skill.sizeBytes)}</span>{/if}
                      {#if skill.updatedAt}<span>{skill.updatedAt.slice(0, 10)}</span>{/if}
                    </div>
                  </button>
                  <div class="card-actions">
                    {#if !skill.installed}
                      <Button size="sm" disabled={busyId === skill.id} onclick={() => install(skill)}>
                        <Download size={14} /><span>{t("skillStore.install")}</span>
                      </Button>
                    {:else if skill.updateAvailable}
                      <Button size="sm" disabled={busyId === skill.id} onclick={() => install(skill)}>
                        <Upload size={14} /><span>{t("skillStore.update")}</span>
                      </Button>
                    {/if}
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </div>

        {#if selected}
          <aside class="skill-detail" aria-label={t("skillStore.detailLabel")}>
            <div class="detail-head">
              <h4>{selected.title || selected.id}</h4>
              <button class="detail-close" aria-label={t("common.close")} onclick={() => (selectedId = "")}>×</button>
            </div>
            <p class="detail-meta">
              <span class="meta-chip">{categoryLabel(selected)}</span>
              <span>v{selected.version}</span>
              {#if selected.installed}<StatusBadge status="success" />{/if}
              {#if selected.updateAvailable}<StatusBadge status="warning" />{/if}
            </p>
            {#if selected.description}<p>{selected.description}</p>{/if}
            {#if selected.whenToUse}
              <h5>{t("skillStore.whenToUse")}</h5>
              <p>{selected.whenToUse}</p>
            {/if}
            {#if selected.scenarios?.length}
              <h5>{t("skillStore.scenarios")}</h5>
              <ul>{#each selected.scenarios as scenario (scenario)}<li>{scenario}</li>{/each}</ul>
            {/if}
            {#if selected.tags?.length}
              <div class="detail-tags">{#each selected.tags as tag (tag)}<span class="meta-chip">{tag}</span>{/each}</div>
            {/if}
            <dl class="detail-facts">
              {#if selected.maintainer}<dt>{t("skillStore.maintainer")}</dt><dd>{selected.maintainer}</dd>{/if}
              {#if formatSkillSize(selected.sizeBytes)}<dt>{t("skillStore.size")}</dt><dd>{formatSkillSize(selected.sizeBytes)}</dd>{/if}
              {#if selected.updatedAt}<dt>{t("skillStore.updatedAt")}</dt><dd>{selected.updatedAt.slice(0, 10)}</dd>{/if}
              {#if selected.installedAt}<dt>{t("skillStore.installedAt")}</dt><dd>{selected.installedAt.slice(0, 10)}</dd>{/if}
            </dl>
            <div class="detail-actions">
              {#if !selected.installed}
                <Button size="sm" disabled={busyId === selected.id} onclick={() => install(selected)}>
                  <Download size={14} /><span>{t("skillStore.install")}</span>
                </Button>
              {:else if selected.updateAvailable}
                <Button size="sm" disabled={busyId === selected.id} onclick={() => install(selected)}>
                  <Upload size={14} /><span>{t("skillStore.update")}</span>
                </Button>
              {/if}
              {#if selected.installed}
                <Button variant="outline" size="sm" disabled={busyId === selected.id} onclick={() => rollback(selected)}>
                  <RotateCcw size={14} /><span>{t("skillStore.rollback")}</span>
                </Button>
                <Button variant="ghost" size="sm" disabled={busyId === selected.id} onclick={() => remove(selected)}>
                  <Trash2 size={14} /><span>{t("skillStore.remove")}</span>
                </Button>
              {/if}
              <Button variant="ghost" size="sm" onclick={() => openSkillSource(selected)}>
                <GitBranch size={14} /><span>{t("skillStore.openSource")}</span>
              </Button>
            </div>
          </aside>
        {/if}
      </div>
    {/if}
  {/if}
</section>
<style>
  .skill-store {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .store-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
  }
  .store-title {
    display: flex;
    gap: 10px;
  }
  .store-icon {
    display: grid;
    place-items: center;
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: var(--surface-muted, #f1f3f6);
    color: var(--text-secondary, #475467);
  }
  .store-title h3 {
    margin: 0;
    font-size: 15px;
  }
  .store-title p {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--text-secondary, #667085);
  }
  .store-actions {
    display: flex;
    gap: 8px;
    flex-shrink: 0;
  }
  .store-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .store-dir {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary, #667085);
  }
  .store-dir code {
    font-size: 11px;
  }
  .token-toggle {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 4px 10px;
    border: 1px solid var(--border-subtle, #e4e7ec);
    border-radius: 999px;
    background: transparent;
    font-size: 11px;
    color: var(--text-secondary, #667085);
    cursor: pointer;
  }
  .token-toggle span {
    color: var(--accent, #2563eb);
  }
  .token-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border-subtle, #e4e7ec);
    border-radius: 10px;
  }
  .token-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .token-label small {
    color: var(--text-secondary, #667085);
  }
  .token-input {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .token-status {
    color: var(--text-secondary, #667085);
  }
  .token-status.error,
  .store-warning.error {
    color: var(--danger, #b42318);
  }
  .store-warning {
    margin: 0;
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--surface-muted, #f6f7f9);
    font-size: 12px;
    color: var(--text-secondary, #475467);
  }
  .store-empty {
    margin: 0;
    padding: 16px 0;
    font-size: 12px;
    color: var(--text-secondary, #667085);
  }
  .store-layout {
    display: grid;
    grid-template-columns: 168px minmax(0, 1fr);
    gap: 14px;
    align-items: start;
  }
  .store-layout:has(.skill-detail) {
    grid-template-columns: 168px minmax(0, 1fr) 288px;
  }
  .category-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    position: sticky;
    top: 8px;
  }
  .category-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border: none;
    border-radius: 8px;
    background: transparent;
    font-size: 12px;
    color: var(--text-secondary, #475467);
    text-align: left;
    cursor: pointer;
  }
  .category-item:hover {
    background: var(--surface-muted, #f1f3f6);
  }
  .category-item.active {
    background: var(--surface-selected, #e8f0fe);
    color: var(--accent, #2563eb);
    font-weight: 600;
  }
  .category-item small {
    font-size: 11px;
    opacity: 0.8;
  }
  .store-main {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .store-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1 1 200px;
    min-width: 160px;
    color: var(--text-secondary, #667085);
  }
  .filter-chips {
    display: flex;
    gap: 6px;
  }
  .chip-button {
    padding: 4px 10px;
    border: 1px solid var(--border-subtle, #e4e7ec);
    border-radius: 999px;
    background: transparent;
    font-size: 11px;
    color: var(--text-secondary, #475467);
    cursor: pointer;
  }
  .chip-button.active {
    border-color: var(--accent, #2563eb);
    color: var(--accent, #2563eb);
  }
  .sort-select {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--text-secondary, #667085);
  }
  .sort-select select {
    font-size: 11px;
    padding: 3px 6px;
    border-radius: 6px;
    border: 1px solid var(--border-subtle, #e4e7ec);
    background: transparent;
    color: inherit;
  }
  .skill-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
    gap: 10px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .skill-card {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--border-subtle, #e4e7ec);
    border-radius: 10px;
    background: var(--surface, #fff);
  }
  .skill-card.selected {
    border-color: var(--accent, #2563eb);
    box-shadow: 0 0 0 1px var(--accent, #2563eb);
  }
  .card-main {
    display: flex;
    flex-direction: column;
    gap: 6px;
    border: none;
    background: transparent;
    padding: 0;
    text-align: left;
    cursor: pointer;
    color: inherit;
    font: inherit;
  }
  .card-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .card-desc {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary, #475467);
    display: -webkit-box;
    line-clamp: 2;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .card-meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 11px;
    color: var(--text-secondary, #667085);
  }
  .meta-chip {
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--surface-muted, #f1f3f6);
    font-size: 11px;
    color: var(--text-secondary, #475467);
  }
  .card-actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }
  .skill-detail {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--border-subtle, #e4e7ec);
    border-radius: 10px;
    background: var(--surface, #fff);
    position: sticky;
    top: 8px;
    font-size: 12px;
    line-height: 1.55;
  }
  .detail-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .detail-head h4 {
    margin: 0;
    font-size: 13px;
  }
  .detail-close {
    border: none;
    background: transparent;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    color: var(--text-secondary, #667085);
  }
  .detail-meta {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-size: 11px;
    color: var(--text-secondary, #667085);
  }
  .skill-detail h5 {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--text-secondary, #475467);
  }
  .skill-detail p {
    margin: 0;
  }
  .skill-detail ul {
    margin: 0;
    padding-left: 16px;
  }
  .detail-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .detail-facts {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 2px 10px;
    margin: 0;
    color: var(--text-secondary, #667085);
  }
  .detail-facts dt {
    font-size: 11px;
  }
  .detail-facts dd {
    margin: 0;
    font-size: 11px;
  }
  .detail-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 4px;
  }
  @media (max-width: 1180px) {
    .store-layout,
    .store-layout:has(.skill-detail) {
      grid-template-columns: 148px minmax(0, 1fr);
    }
    .skill-detail {
      grid-column: 1 / -1;
      position: static;
    }
  }
</style>
