<script lang="ts">
  import { t } from "$lib/i18n";
  import type { KnowledgeScope } from "$lib/knowledge";

  let {
    scope = $bindable<KnowledgeScope>("local"),
    externalUnavailable = false,
    onConfigure,
  }: {
    scope: KnowledgeScope;
    externalUnavailable?: boolean;
    onConfigure?: () => void;
  } = $props();
  const scopes = ["local", "external", "all"] as const;
  const labels = { local: "scopeLocal", external: "scopeExternal", all: "scopeAll" } as const;
  const isBlocked = (option: KnowledgeScope): boolean => externalUnavailable && option !== "local";
</script>

<fieldset>
  <legend>{t("knowledge.scopeLabel")}</legend>
  <div class="scope-options">
    {#each scopes as option}
      <label class:selected={scope === option} class:disabled={isBlocked(option)}>
        <input type="radio" bind:group={scope} value={option} disabled={isBlocked(option)} />
        {t(`knowledge.${labels[option]}`)}
        {#if isBlocked(option)}<small>{t("knowledge.scopeUnavailable")}</small>{/if}
      </label>
    {/each}
  </div>
  {#if externalUnavailable}
    <p class="scope-note" role="status">{t("knowledge.scopeExternalUnavailable")}{#if onConfigure}<button type="button" onclick={onConfigure}>{t("knowledge.scopeConfigure")}</button>{/if}</p>
  {/if}
</fieldset>

<style>
  fieldset { border: 0; padding: 0; margin: 8px 0; min-width: 0; }
  legend { font-size: 12px; margin-bottom: 6px; color: var(--muted-foreground); }
  .scope-options { display: flex; flex-wrap: wrap; gap: 4px; }
  label { display: flex; gap: 6px; align-items: center; padding: 6px 12px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; cursor: pointer; }
  label.selected { background: var(--muted); border-color: var(--primary); }
  label.disabled { cursor: not-allowed; opacity: 0.6; }
  label small { color: var(--muted-foreground); font-size: 11px; }
  .scope-note { margin: 6px 0 0; font-size: 11px; color: var(--muted-foreground); display: flex; gap: 6px; align-items: center; }
  .scope-note button { border: 1px solid var(--border); border-radius: 4px; background: var(--card); font-size: 11px; padding: 1px 8px; cursor: pointer; }
  input { accent-color: var(--primary); }
</style>
