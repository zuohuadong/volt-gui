<script lang="ts">
  import { Minus, Plus, RotateCcw, Type } from "@lucide/svelte";
  import { APPEARANCE_STYLES, applyAppearance, normalizeAppearanceStyle } from "../lib/appearance";
  import type { AppearanceStyle, AppearanceTheme } from "../lib/appearance";
  import {
    TYPOGRAPHY_REGIONS,
    TYPOGRAPHY_REGION_META,
    applyTypographyPreferences,
    createDefaultTypographyPreferences,
    getTypographyPreferences,
    sanitizeCustomFontName,
  } from "../lib/typography-preferences";
  import type { RegionFontFamily, RegionTypography, TypographyPreferences, TypographyRegion } from "../lib/typography-preferences";

  let {
    theme = "auto",
    themeStyle = "graphite",
    onThemeChange,
    onThemeStyleChange,
  }: {
    theme?: string;
    themeStyle?: string;
    onThemeChange: (theme: string) => void;
    onThemeStyleChange: (style: string) => void;
  } = $props();

  let selectedRegion = $state<TypographyRegion>("conversation");
  let typography = $state<TypographyPreferences>(getTypographyPreferences());
  const activeTheme = $derived<AppearanceTheme>(theme === "light" || theme === "dark" ? theme : "auto");
  const activeStyle = $derived<AppearanceStyle>(normalizeAppearanceStyle(themeStyle));
  const regionPreference = $derived(typography[selectedRegion]);
  const regionMeta = $derived(TYPOGRAPHY_REGION_META[selectedRegion]);

  const themeOptions: { value: AppearanceTheme; label: string }[] = [
    { value: "auto", label: "跟随系统" },
    { value: "light", label: "浅色" },
    { value: "dark", label: "深色" },
  ];
  const regionLabels: Record<TypographyRegion, string> = {
    interface: "界面",
    conversation: "会话",
    composer: "输入区",
    code: "代码",
    metadata: "元数据",
  };
  const styleLabels: Record<AppearanceStyle, string> = {
    graphite: "Graphite",
    porcelain: "Porcelain",
    glacier: "Glacier",
    aurora: "Aurora",
    ember: "Ember",
    midnight: "Midnight",
    sandstone: "Sandstone",
    linen: "Linen",
  };

  function selectTheme(nextTheme: AppearanceTheme) {
    onThemeChange(nextTheme);
    applyAppearance(nextTheme, activeStyle);
  }

  function selectStyle(nextStyle: AppearanceStyle) {
    onThemeStyleChange(nextStyle);
    applyAppearance(activeTheme, nextStyle);
  }

  function updateRegion(patch: Partial<RegionTypography>) {
    typography = { ...typography, [selectedRegion]: { ...regionPreference, ...patch } };
    applyTypographyPreferences(typography);
  }

  function updateFontFamily(event: Event) {
    updateRegion({ followGlobal: false, fontFamily: (event.currentTarget as HTMLSelectElement).value as RegionFontFamily });
  }

  function updateCustomFont(event: Event) {
    updateRegion({ customFontName: sanitizeCustomFontName((event.currentTarget as HTMLInputElement).value) });
  }

  function changeFontSize(delta: number) {
    const nextSize = Math.min(regionMeta.max, Math.max(regionMeta.min, regionPreference.fontSize + delta));
    updateRegion({ followGlobal: false, fontSize: nextSize });
  }

  function resetRegion() {
    const defaults = createDefaultTypographyPreferences();
    typography = { ...typography, [selectedRegion]: defaults[selectedRegion] };
    applyTypographyPreferences(typography);
  }

  function resetTypography() {
    typography = createDefaultTypographyPreferences();
    applyTypographyPreferences(typography);
  }
</script>

<div class="appearance-settings">
  <section>
    <header><div><strong>显示模式</strong><p>主题变化立即预览，点击设置弹窗底部保存后写入桌面配置。</p></div><span>{activeTheme}</span></header>
    <div class="appearance-settings__segments" role="group" aria-label="显示模式">
      {#each themeOptions as option (option.value)}
        <button class={{ active: activeTheme === option.value }} type="button" aria-pressed={activeTheme === option.value} onclick={() => selectTheme(option.value)}>{option.label}</button>
      {/each}
    </div>
  </section>

  <section>
    <header><div><strong>Volt 表面风格</strong><p>保留单一 Volt 绿强调色，只调整画布、表面和边界温度。</p></div><span>{styleLabels[activeStyle]}</span></header>
    <div class="appearance-settings__styles" role="group" aria-label="Volt 表面风格">
      {#each APPEARANCE_STYLES as style (style)}
        <button class={{ active: activeStyle === style }} data-style={style} type="button" aria-pressed={activeStyle === style} onclick={() => selectStyle(style)}>
          <i></i><span><strong>{styleLabels[style]}</strong><em>{style === "graphite" ? "Volt 默认" : "中性表面变体"}</em></span>
        </button>
      {/each}
    </div>
  </section>

  <section>
    <header><div><strong>区域字体</strong><p>为界面、会话、输入区、代码和元数据分别设置字体与字号。</p></div><button type="button" onclick={resetTypography}><RotateCcw size={13} /> 全部重置</button></header>
    <div class="typography-settings">
      <nav aria-label="字体区域">
        {#each TYPOGRAPHY_REGIONS as region (region)}
          <button class={{ active: selectedRegion === region }} type="button" aria-current={selectedRegion === region ? "page" : undefined} onclick={() => (selectedRegion = region)}>
            <span>{regionLabels[region]}</span>{#if !typography[region].followGlobal}<i aria-label="已自定义"></i>{/if}
          </button>
        {/each}
      </nav>
      <div class="typography-settings__controls">
        <label class="typography-settings__follow"><input type="checkbox" checked={regionPreference.followGlobal} onchange={(event) => updateRegion({ followGlobal: event.currentTarget.checked })} /><span>跟随全局字体</span></label>
        <label>字体
          <select value={regionPreference.fontFamily} disabled={regionPreference.followGlobal} onchange={updateFontFamily}>
            <option value="inherit">继承全局</option><option value="system">系统字体</option><option value="yahei">微软雅黑</option><option value="pingfang">苹方</option><option value="noto">Noto Sans SC</option><option value="cascadia">Cascadia</option><option value="jetbrains">JetBrains Mono</option><option value="sfmono">SF Mono</option><option value="custom">自定义</option>
          </select>
        </label>
        {#if regionPreference.fontFamily === "custom" && !regionPreference.followGlobal}
          <label>自定义字体<input value={regionPreference.customFontName} maxlength="120" placeholder="本机已安装字体名称" onblur={updateCustomFont} /></label>
        {/if}
        <div class="typography-settings__size">
          <span>字号</span>
          <div><button type="button" aria-label="减小字号" disabled={regionPreference.followGlobal || regionPreference.fontSize <= regionMeta.min} onclick={() => changeFontSize(-1)}><Minus size={13} /></button><strong>{regionPreference.fontSize}px</strong><button type="button" aria-label="增大字号" disabled={regionPreference.followGlobal || regionPreference.fontSize >= regionMeta.max} onclick={() => changeFontSize(1)}><Plus size={13} /></button></div>
        </div>
        <button class="typography-settings__reset" type="button" onclick={resetRegion}><Type size={13} /> 重置当前区域</button>
      </div>
    </div>
  </section>
</div>

<style>
  .appearance-settings { display: grid; gap: 12px; }
  section { display: grid; gap: 12px; padding: 14px; border: 1px solid var(--border, #dce1db); border-radius: 10px; background: var(--card, #fff); }
  header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
  header strong { display: block; color: var(--foreground, #1f2421); font-size: 13px; }
  header p { margin: 3px 0 0; color: var(--muted-foreground, #687169); font-size: 11px; line-height: 1.5; }
  header > span { color: var(--muted-foreground, #687169); font-size: 10px; text-transform: uppercase; }
  button, select, input { min-height: 34px; color: var(--foreground, #1f2421); background: var(--card, #fff); border: 1px solid var(--border, #dce1db); border-radius: 7px; font: inherit; }
  button { cursor: pointer; }
  button:disabled, select:disabled { cursor: not-allowed; opacity: .52; }
  .appearance-settings__segments { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .appearance-settings__segments button.active { border-color: var(--primary, #0f7b55); background: var(--accent-soft, #e7f5ef); color: var(--primary, #0f7b55); }
  .appearance-settings__styles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 7px; }
  .appearance-settings__styles button { display: grid; grid-template-columns: 20px minmax(0, 1fr); align-items: center; gap: 8px; min-height: 48px; padding: 6px 8px; text-align: left; }
  .appearance-settings__styles button.active { border-color: var(--primary, #0f7b55); background: var(--accent-soft, #e7f5ef); }
  .appearance-settings__styles i { width: 20px; height: 28px; border: 1px solid var(--border, #dce1db); border-radius: 5px; background: var(--muted, #edf0ec); box-shadow: inset 5px 0 0 var(--primary, #0f7b55); }
  .appearance-settings__styles button[data-style="porcelain"] i { background: #f0f1ee; }
  .appearance-settings__styles button[data-style="glacier"] i { background: #eaf0ef; }
  .appearance-settings__styles button[data-style="aurora"] i { background: #eaf0eb; }
  .appearance-settings__styles button[data-style="ember"] i { background: #f0eae7; }
  .appearance-settings__styles button[data-style="midnight"] i { background: #e7ece9; }
  .appearance-settings__styles button[data-style="sandstone"] i { background: #efece5; }
  .appearance-settings__styles button[data-style="linen"] i { background: #f0eee8; }
  .appearance-settings__styles strong, .appearance-settings__styles em { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .appearance-settings__styles strong { font-size: 11px; }
  .appearance-settings__styles em { margin-top: 2px; color: var(--muted-foreground, #687169); font-size: 9px; font-style: normal; }
  .typography-settings { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: 12px; }
  .typography-settings nav { display: grid; align-content: start; gap: 4px; padding-right: 10px; border-right: 1px solid var(--border, #dce1db); }
  .typography-settings nav button { display: flex; align-items: center; justify-content: space-between; padding: 0 9px; border-color: transparent; background: transparent; text-align: left; }
  .typography-settings nav button.active { border-color: var(--border, #dce1db); background: var(--accent-soft, #e7f5ef); color: var(--primary, #0f7b55); }
  .typography-settings nav i { width: 6px; height: 6px; border-radius: 999px; background: var(--primary, #0f7b55); }
  .typography-settings__controls { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 9px; }
  .typography-settings__controls label { display: grid; gap: 5px; color: var(--muted-foreground, #687169); font-size: 11px; }
  .typography-settings__controls select, .typography-settings__controls input { width: 100%; min-width: 0; padding: 0 9px; }
  .typography-settings__follow { grid-column: 1 / -1; display: flex !important; align-items: center; }
  .typography-settings__follow input { width: auto; min-height: 0; }
  .typography-settings__size { display: grid; gap: 5px; color: var(--muted-foreground, #687169); font-size: 11px; }
  .typography-settings__size > div { display: grid; grid-template-columns: 34px minmax(52px, 1fr) 34px; align-items: center; text-align: center; }
  .typography-settings__size button { padding: 0; }
  .typography-settings__size strong { color: var(--foreground, #1f2421); font-size: 12px; }
  .typography-settings__reset { align-self: end; justify-self: start; padding: 0 10px; }

  @media (max-width: 760px) {
    .appearance-settings__styles { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .typography-settings { grid-template-columns: 1fr; }
    .typography-settings nav { grid-template-columns: repeat(5, minmax(0, 1fr)); padding: 0 0 10px; border-right: 0; border-bottom: 1px solid var(--border, #dce1db); overflow-x: auto; }
  }

  @media (max-width: 520px) {
    .appearance-settings__segments, .typography-settings__controls { grid-template-columns: 1fr; }
    .typography-settings__follow { grid-column: auto; }
  }
</style>
