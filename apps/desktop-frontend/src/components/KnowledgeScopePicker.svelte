<script lang="ts">
  import { t } from "$lib/i18n";
  import type { KnowledgeScope } from "$lib/knowledge";

  let { scope = $bindable<KnowledgeScope>("local") }: { scope: KnowledgeScope } = $props();
  const scopes = ["local", "external", "all"] as const;
  const labels = { local: "scopeLocal", external: "scopeExternal", all: "scopeAll" } as const;
</script>

<fieldset>
  <legend>{t("knowledge.scopeLabel")}</legend>
  <div class="scope-options">
    {#each scopes as option}
      <label class:selected={scope === option}>
        <input type="radio" bind:group={scope} value={option} />
        {t(`knowledge.${labels[option]}`)}
      </label>
    {/each}
  </div>
</fieldset>

<style>
  fieldset { border: 0; padding: 0; margin: 8px 0; min-width: 0; }
  legend { font-size: 12px; margin-bottom: 6px; color: var(--muted-foreground); }
  .scope-options { display: flex; flex-wrap: wrap; gap: 4px; }
  label { display: flex; gap: 6px; align-items: center; padding: 6px 12px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; cursor: pointer; }
  label.selected { background: var(--muted); border-color: var(--primary); }
  input { accent-color: var(--primary); }
</style>
