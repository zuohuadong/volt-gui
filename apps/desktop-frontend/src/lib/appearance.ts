import { initTypographyPreferences } from "./typography-preferences";

export type AppearanceTheme = "auto" | "light" | "dark";
export const APPEARANCE_STYLES = ["graphite", "porcelain", "glacier", "aurora", "ember", "midnight", "sandstone", "linen"] as const;
export type AppearanceStyle = (typeof APPEARANCE_STYLES)[number];

type AppearancePalette = {
  canvas: string;
  surface: string;
  muted: string;
  border: string;
  text: string;
  textMuted: string;
};

const LIGHT_PALETTES: Record<AppearanceStyle, AppearancePalette> = {
  graphite: { canvas: "#F3F5F2", surface: "#FFFFFF", muted: "#EDF0EC", border: "#DCE1DB", text: "#1F2421", textMuted: "#687169" },
  porcelain: { canvas: "#F7F7F5", surface: "#FFFFFF", muted: "#F0F1EE", border: "#DEE1DC", text: "#242824", textMuted: "#6C736B" },
  glacier: { canvas: "#F1F5F4", surface: "#FFFFFF", muted: "#EAF0EF", border: "#D7E2DF", text: "#1E2926", textMuted: "#60716C" },
  aurora: { canvas: "#F2F5F2", surface: "#FFFFFF", muted: "#EAF0EB", border: "#D8E1D9", text: "#202923", textMuted: "#657267" },
  ember: { canvas: "#F5F2F0", surface: "#FFFFFF", muted: "#F0EAE7", border: "#E1D8D3", text: "#2A2522", textMuted: "#756A64" },
  midnight: { canvas: "#EEF1EF", surface: "#FFFFFF", muted: "#E7ECE9", border: "#D4DDD8", text: "#1E2823", textMuted: "#64736B" },
  sandstone: { canvas: "#F5F3EF", surface: "#FFFFFF", muted: "#EFECE5", border: "#E1DBCE", text: "#292721", textMuted: "#756F63" },
  linen: { canvas: "#F6F5F1", surface: "#FFFFFF", muted: "#F0EEE8", border: "#E1DED4", text: "#292824", textMuted: "#716E65" },
};

const DARK_PALETTES: Record<AppearanceStyle, AppearancePalette> = {
  graphite: { canvas: "#121713", surface: "#1B211D", muted: "#232B26", border: "#344039", text: "#EDF3EE", textMuted: "#A4B0A7" },
  porcelain: { canvas: "#151714", surface: "#1E211D", muted: "#282B26", border: "#393D36", text: "#F0F2ED", textMuted: "#AAAEA5" },
  glacier: { canvas: "#101817", surface: "#182221", muted: "#202D2B", border: "#30423F", text: "#EAF3F1", textMuted: "#9FADAA" },
  aurora: { canvas: "#111813", surface: "#19221B", muted: "#212D24", border: "#304235", text: "#ECF3ED", textMuted: "#A1AEA4" },
  ember: { canvas: "#1A1513", surface: "#241D1A", muted: "#302622", border: "#493A34", text: "#F4EEEA", textMuted: "#B6A7A0" },
  midnight: { canvas: "#101512", surface: "#17201B", muted: "#1F2A24", border: "#2D3D34", text: "#E8F1EB", textMuted: "#9CACA2" },
  sandstone: { canvas: "#191713", surface: "#221F1A", muted: "#2D2922", border: "#433D32", text: "#F2EFE8", textMuted: "#B1AA9D" },
  linen: { canvas: "#181714", surface: "#211F1B", muted: "#2B2924", border: "#403D35", text: "#F2F0EB", textMuted: "#AEA99F" },
};

function resolvedTheme(theme: AppearanceTheme): "light" | "dark" {
  if (theme !== "auto") return theme;
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function normalizeAppearanceStyle(value: unknown): AppearanceStyle {
  return typeof value === "string" && APPEARANCE_STYLES.includes(value as AppearanceStyle) ? value as AppearanceStyle : "graphite";
}

export function applyAppearance(theme: AppearanceTheme, style: AppearanceStyle = "graphite"): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const resolved = resolvedTheme(theme);
  const normalizedStyle = normalizeAppearanceStyle(style);
  const palette = resolved === "dark" ? DARK_PALETTES[normalizedStyle] : LIGHT_PALETTES[normalizedStyle];
  root.classList.toggle("dark", resolved === "dark");
  root.dataset.theme = "green";
  root.dataset.themeStyle = normalizedStyle;
  root.dataset.voltThemeMode = theme;
  root.dataset.voltThemeStyle = normalizedStyle;
  root.style.setProperty("--background", palette.canvas);
  root.style.setProperty("--card", palette.surface);
  root.style.setProperty("--muted", palette.muted);
  root.style.setProperty("--border", palette.border);
  root.style.setProperty("--foreground", palette.text);
  root.style.setProperty("--muted-foreground", palette.textMuted);
  root.style.setProperty("--primary", "#0F7B55");
  root.style.removeProperty("--accent");
  root.style.setProperty("--accent-soft", resolved === "dark" ? "#17372C" : "#E7F5EF");
  root.style.colorScheme = resolved;
}

export function initAppearance(): void {
  applyAppearance("auto", "graphite");
  initTypographyPreferences();
}
