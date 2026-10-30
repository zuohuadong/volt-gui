<script lang="ts">
  import { Bot, Globe, Info, Languages, Mic, Palette, Settings2, ShieldAlert } from "@lucide/svelte";
  import { StatusBadge } from "@svadmin/ui";
  import { t } from "$lib/i18n";
  import type { SettingsSection } from "$components/SettingsSectionNav.svelte";

  interface Props {
    readonly section: SettingsSection;
    readonly locale: string;
    readonly networkMode: "intranet" | "external";
    readonly providerCount: number;
    readonly credentialCount: number;
  }

  let { section, locale, networkMode, providerCount, credentialCount }: Props = $props();

  const meta = $derived.by(() => {
    if (section === "appearance") return { title: t("appearance.title"), description: t("appearance.description") };
    if (section === "models") return { title: t("settings.modelsTitle"), description: t("settings.modelsDesc") };
    if (section === "voice") return { title: t("settings.voiceTitle"), description: t("settings.voiceDesc") };
    if (section === "advanced") return { title: t("settings.advancedTitle"), description: t("settings.advancedDesc") };
    if (section === "about") return { title: t("settings.aboutTitle"), description: t("settings.aboutSectionDesc") };
    return { title: t("settings.generalTitle"), description: t("settings.generalDesc") };
  });
</script>

<header class="settings-page-hero">
  <span class="settings-page-hero-icon" aria-hidden="true">
    {#if section === "appearance"}<Palette size={19} />
    {:else if section === "models"}<Bot size={19} />
    {:else if section === "voice"}<Mic size={19} />
    {:else if section === "advanced"}<Settings2 size={19} />
    {:else if section === "about"}<Info size={19} />
    {:else}<Globe size={19} />{/if}
  </span>
  <div class="settings-page-hero-copy">
    <div class="section-label">{t("settings.title")}</div>
    <h2>{meta.title}</h2>
    <p>{meta.description}</p>
  </div>
  <div class="settings-page-hero-meta">
    <span class="settings-chip"><Languages size={12} />{locale === "en-US" ? "English" : "简体中文"}</span>
    <span class="settings-chip"><ShieldAlert size={12} />{networkMode === "external" ? t("settings.externalMode") : t("settings.intranetMode")}</span>
    {#if section === "models"}
      <StatusBadge status={providerCount > 0 ? "success" : "neutral"} label={t("settings.providerCount", { count: providerCount })} />
    {:else if section === "advanced"}
      <StatusBadge status={credentialCount > 0 ? "success" : "neutral"} label={t("settings.credentialCountLabel", { count: credentialCount })} />
    {/if}
  </div>
</header>

<style>
  .settings-page-hero { display: flex; align-items: center; gap: 14px; min-width: 0; margin-bottom: 18px; padding: 16px 18px; border: 1px solid var(--workbench-border-soft, var(--border)); border-radius: 12px; background: var(--workbench-sidebar, var(--card)); }
  .settings-page-hero-icon { display: grid; width: 40px; height: 40px; flex: 0 0 auto; place-items: center; border: 1px solid var(--workbench-border-soft, var(--border)); border-radius: 10px; background: var(--background); color: var(--primary); }
  .settings-page-hero-copy { min-width: 0; flex: 1; }
  .settings-page-hero-copy .section-label { margin-bottom: 2px; }
  .settings-page-hero-copy h2 { margin: 0; font-size: 17px; font-weight: 650; letter-spacing: 0; }
  .settings-page-hero-copy p { margin: 4px 0 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
  .settings-page-hero-meta { display: flex; align-items: center; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
  .settings-chip { display: inline-flex; align-items: center; gap: 5px; padding: 4px 8px; border: 1px solid var(--border); border-radius: 999px; background: var(--background); color: var(--muted-foreground); font-size: 10.5px; white-space: nowrap; }
  @media (max-width: 760px) {
    .settings-page-hero { align-items: flex-start; flex-wrap: wrap; }
    .settings-page-hero-meta { width: 100%; justify-content: flex-start; }
  }
</style>