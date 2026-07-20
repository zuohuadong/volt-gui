export const TYPOGRAPHY_REGIONS = ["interface", "conversation", "composer", "code", "metadata"] as const;

export type TypographyRegion = (typeof TYPOGRAPHY_REGIONS)[number];
export type RegionFontFamily = "inherit" | "system" | "yahei" | "pingfang" | "noto" | "cascadia" | "jetbrains" | "sfmono" | "custom";

export type RegionTypography = {
  followGlobal: boolean;
  fontFamily: RegionFontFamily;
  customFontName: string;
  fontSize: number;
};

export type TypographyPreferences = Record<TypographyRegion, RegionTypography>;

export const TYPOGRAPHY_STORAGE_KEY = "voltui-region-typography-v1";
export const TYPOGRAPHY_REGION_META: Record<TypographyRegion, { baseSize: number; min: number; max: number }> = {
  interface: { baseSize: 13, min: 11, max: 18 },
  conversation: { baseSize: 14, min: 12, max: 22 },
  composer: { baseSize: 14, min: 12, max: 22 },
  code: { baseSize: 12, min: 10, max: 20 },
  metadata: { baseSize: 11, min: 9, max: 16 },
};

const FONT_STACKS: Record<Exclude<RegionFontFamily, "custom">, string> = {
  inherit: "",
  system: "var(--font-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans SC', sans-serif)",
  yahei: "'Microsoft YaHei UI', 'Microsoft YaHei', 'PingFang SC', sans-serif",
  pingfang: "'PingFang SC', 'Noto Sans SC', 'Microsoft YaHei', sans-serif",
  noto: "'Noto Sans SC', 'Noto Sans', 'PingFang SC', sans-serif",
  cascadia: "'Cascadia Code', 'Cascadia Mono', Consolas, ui-monospace, monospace",
  jetbrains: "'JetBrains Mono', 'Cascadia Code', 'SF Mono', Consolas, ui-monospace, monospace",
  sfmono: "'SF Mono', SFMono-Regular, ui-monospace, Menlo, Monaco, monospace",
};

function defaultRegion(region: TypographyRegion): RegionTypography {
  return { followGlobal: true, fontFamily: "inherit", customFontName: "", fontSize: TYPOGRAPHY_REGION_META[region].baseSize };
}

export function createDefaultTypographyPreferences(): TypographyPreferences {
  return Object.fromEntries(TYPOGRAPHY_REGIONS.map((region) => [region, defaultRegion(region)])) as TypographyPreferences;
}

export function sanitizeCustomFontName(value: unknown): string {
  if (typeof value !== "string") return "";
  const normalized = value.trim().replace(/\s+/g, " ").slice(0, 120);
  return /^[\p{L}\p{N} ._-]+$/u.test(normalized) ? normalized : "";
}

export function normalizeTypographyPreferences(value: unknown): TypographyPreferences {
  const preferences = createDefaultTypographyPreferences();
  if (!value || typeof value !== "object") return preferences;
  const source = value as Record<string, unknown>;

  for (const region of TYPOGRAPHY_REGIONS) {
    const candidate = source[region];
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as Record<string, unknown>;
    const meta = TYPOGRAPHY_REGION_META[region];
    const fontSize = typeof entry.fontSize === "number" && Number.isFinite(entry.fontSize) ? entry.fontSize : meta.baseSize;
    const fontFamily = typeof entry.fontFamily === "string" && ["inherit", "system", "yahei", "pingfang", "noto", "cascadia", "jetbrains", "sfmono", "custom"].includes(entry.fontFamily)
      ? entry.fontFamily as RegionFontFamily
      : "inherit";
    preferences[region] = {
      followGlobal: entry.followGlobal !== false,
      fontFamily,
      customFontName: sanitizeCustomFontName(entry.customFontName),
      fontSize: Math.round(Math.min(meta.max, Math.max(meta.min, fontSize))),
    };
  }
  return preferences;
}

export function getTypographyPreferences(): TypographyPreferences {
  if (typeof localStorage === "undefined") return createDefaultTypographyPreferences();
  try {
    const stored = localStorage.getItem(TYPOGRAPHY_STORAGE_KEY);
    return stored ? normalizeTypographyPreferences(JSON.parse(stored)) : createDefaultTypographyPreferences();
  } catch {
    return createDefaultTypographyPreferences();
  }
}

function fontStack(preference: RegionTypography): string {
  if (preference.fontFamily === "custom") {
    const customFont = sanitizeCustomFontName(preference.customFontName);
    return customFont ? `'${customFont}', var(--font-ui, sans-serif)` : "";
  }
  return FONT_STACKS[preference.fontFamily];
}

export function applyTypographyPreferences(value: TypographyPreferences): void {
  if (typeof document === "undefined") return;
  const preferences = normalizeTypographyPreferences(value);
  for (const region of TYPOGRAPHY_REGIONS) {
    const preference = preferences[region];
    const sizeProperty = `--typography-${region}-size`;
    const fontProperty = `--typography-${region}-font`;
    if (preference.followGlobal) {
      document.documentElement.style.removeProperty(sizeProperty);
      document.documentElement.style.removeProperty(fontProperty);
      continue;
    }
    document.documentElement.style.setProperty(sizeProperty, `${preference.fontSize}px`);
    const stack = fontStack(preference);
    if (stack) document.documentElement.style.setProperty(fontProperty, stack);
    else document.documentElement.style.removeProperty(fontProperty);
  }
  try {
    localStorage.setItem(TYPOGRAPHY_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // WebView storage may be disabled; the live preferences remain applied.
  }
}

export function initTypographyPreferences(): void {
  applyTypographyPreferences(getTypographyPreferences());
}
