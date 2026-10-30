<script lang="ts">
  import { Bot, Globe, Info, Mic, Palette, Settings2 } from "@lucide/svelte";
  import { t } from "$lib/i18n";

  export type SettingsSection = "general" | "appearance" | "models" | "voice" | "advanced" | "about";

  interface Props {
    readonly activeSection: SettingsSection;
    readonly onSelect: (section: SettingsSection) => void;
  }

  let { activeSection, onSelect }: Props = $props();
</script>

<nav class="settings-section-tabs" aria-label={t("settings.sectionNav")}>
  <div class="settings-nav-group">
    <span class="settings-nav-group-title">{t("settings.basicsGroup")}</span>
    <button type="button" class:active={activeSection === "general"} aria-current={activeSection === "general" ? "page" : undefined} onclick={() => onSelect("general")}>
      <Globe size={14} />
      <span>{t("settings.generalTitle")}</span>
    </button>
    <button type="button" class:active={activeSection === "appearance"} aria-current={activeSection === "appearance" ? "page" : undefined} onclick={() => onSelect("appearance")}>
      <Palette size={14} />
      <span>{t("appearance.title")}</span>
    </button>
    <button type="button" class:active={activeSection === "models"} aria-current={activeSection === "models" ? "page" : undefined} onclick={() => onSelect("models")}>
      <Bot size={14} />
      <span>{t("settings.modelsTitle")}</span>
    </button>
    <button type="button" class:active={activeSection === "voice"} aria-current={activeSection === "voice" ? "page" : undefined} onclick={() => onSelect("voice")}>
      <Mic size={14} />
      <span>{t("settings.voiceTitle")}</span>
    </button>
  </div>
  <div class="settings-nav-group">
    <span class="settings-nav-group-title">{t("settings.advancedGroup")}</span>
    <button type="button" class:active={activeSection === "advanced"} aria-current={activeSection === "advanced" ? "page" : undefined} onclick={() => onSelect("advanced")}>
      <Settings2 size={14} />
      <span>{t("settings.advancedTitle")}</span>
    </button>
    <button type="button" class:active={activeSection === "about"} aria-current={activeSection === "about" ? "page" : undefined} onclick={() => onSelect("about")}>
      <Info size={14} />
      <span>{t("settings.aboutTitle")}</span>
    </button>
  </div>
</nav>
