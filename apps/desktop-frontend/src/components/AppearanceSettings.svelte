<script lang="ts">
  import { ChevronDown, Monitor, Moon, RotateCcw, SlidersHorizontal, Sun } from "@lucide/svelte";
  import { setMode, userPrefersMode } from "mode-watcher";
  import { Button } from "$components/ui/button";
  import { SettingsGroup } from "@svadmin/ui";
  import { t } from "$lib/i18n";
  import {
    DEFAULT_UI_CUSTOMIZATION,
    type UiCodeFontFamily,
    type UiCustomizationPatch,
    type UiCustomizationState,
    type UiDensity,
    type UiFontFamily,
    type UiFontSize,
  } from "$lib/ui-customization";

  interface Props {
    readonly customization: UiCustomizationState;
    readonly onUpdate: (patch: Omit<UiCustomizationPatch, "schemaVersion">) => void;
  }

  let { customization, onUpdate }: Props = $props();

  const themes = [
    { value: "light", icon: Sun, label: "app.themeLight" },
    { value: "dark", icon: Moon, label: "app.themeDark" },
    { value: "system", icon: Monitor, label: "app.themeSystem" },
  ] as const;

  function resetAppearance(): void {
    onUpdate({
      density: DEFAULT_UI_CUSTOMIZATION.density,
      fontFamily: DEFAULT_UI_CUSTOMIZATION.fontFamily,
      fontSize: DEFAULT_UI_CUSTOMIZATION.fontSize,
      codeFontFamily: DEFAULT_UI_CUSTOMIZATION.codeFontFamily,
      sidebar: DEFAULT_UI_CUSTOMIZATION.sidebar,
      activity: DEFAULT_UI_CUSTOMIZATION.activity,
      composerRows: DEFAULT_UI_CUSTOMIZATION.composerRows,
    });
  }
</script>

<SettingsGroup title={t("appearance.title")} description={t("appearance.description")}>
  <div class="appearance-settings">
    <div class="appearance-theme-block">
      <div class="appearance-field-heading">
        <span>{t("appearance.theme")}</span>
        <small>{t("appearance.themeDesc")}</small>
      </div>
      <div class="appearance-theme-grid" role="group" aria-label={t("appearance.theme")}>
        {#each themes as theme (theme.value)}
          <button type="button" class:active={userPrefersMode.current === theme.value} aria-pressed={userPrefersMode.current === theme.value} onclick={() => setMode(theme.value)}>
            <theme.icon size={16} />
            <span>{t(theme.label)}</span>
          </button>
        {/each}
      </div>
    </div>

    <div class="appearance-compact-grid">
      <label class="appearance-field" for="text-size">
        <span>{t("appearance.fontSize")}</span>
        <select id="text-size" value={customization.fontSize} onchange={(event) => onUpdate({ fontSize: event.currentTarget.value as UiFontSize })}>
          <option value="small">{t("appearance.small")}</option>
          <option value="medium">{t("appearance.medium")}</option>
          <option value="large">{t("appearance.large")}</option>
        </select>
      </label>
      <label class="appearance-field" for="density">
        <span>{t("appearance.density")}</span>
        <select id="density" value={customization.density} onchange={(event) => onUpdate({ density: event.currentTarget.value as UiDensity })}>
          <option value="comfortable">{t("customization.comfortableDensity")}</option>
          <option value="compact">{t("customization.compactDensity")}</option>
        </select>
        <small>{t("appearance.densityDesc")}</small>
      </label>
    </div>

    <details class="settings-subsection">
      <summary><SlidersHorizontal size={14} /><span><strong>{t("settings.displayAdvancedTitle")}</strong><small>{t("settings.displayAdvancedDesc")}</small></span><ChevronDown size={14} /></summary>
      <div class="appearance-compact-grid">
        <label class="appearance-field" for="interface-font">
          <span>{t("appearance.font")}</span>
          <select id="interface-font" value={customization.fontFamily} onchange={(event) => onUpdate({ fontFamily: event.currentTarget.value as UiFontFamily })}>
            <option value="system">{t("appearance.systemFont")}</option>
            <option value="inter">Inter</option>
            <option value="yahei">{t("appearance.yahei")}</option>
          </select>
        </label>
        <label class="appearance-field" for="code-font">
          <span>{t("appearance.codeFont")}</span>
          <select id="code-font" value={customization.codeFontFamily} onchange={(event) => onUpdate({ codeFontFamily: event.currentTarget.value as UiCodeFontFamily })}>
            <option value="system-mono">{t("appearance.defaultCodeFont")}</option>
            <option value="jetbrains">JetBrains Mono</option>
            <option value="cascadia">Cascadia Code</option>
          </select>
        </label>
        <label class="appearance-field" for="composer-rows">
          <span>{t("appearance.composerRows")}</span>
          <select id="composer-rows" value={customization.composerRows} onchange={(event) => onUpdate({ composerRows: Number(event.currentTarget.value) as 2 | 3 | 4 })}>
            <option value="2">{t("customization.composerRows", { count: 2 })}</option>
            <option value="3">{t("customization.composerRows", { count: 3 })}</option>
            <option value="4">{t("customization.composerRows", { count: 4 })}</option>
          </select>
        </label>
      </div>
      <div class="appearance-toggle-grid">
        <label class="appearance-toggle" for="sidebar-state">
          <span>{t("appearance.sidebar")}</span>
          <input id="sidebar-state" type="checkbox" checked={customization.sidebar === "expanded"} onchange={(event) => onUpdate({ sidebar: event.currentTarget.checked ? "expanded" : "collapsed" })} />
        </label>
        <label class="appearance-toggle" for="activity-state">
          <span>{t("appearance.activity")}</span>
          <input id="activity-state" type="checkbox" checked={customization.activity === "visible"} onchange={(event) => onUpdate({ activity: event.currentTarget.checked ? "visible" : "hidden" })} />
        </label>
      </div>
      <div class="appearance-preview" aria-label={t("appearance.preview")}>
        <p>{t("appearance.sample")}</p>
        <code>const greeting = "Hello, world!";</code>
      </div>
      <div class="appearance-actions">
        <Button variant="ghost" size="sm" onclick={resetAppearance}><RotateCcw size={14} />{t("appearance.resetAll")}</Button>
      </div>
    </details>
  </div>
</SettingsGroup>