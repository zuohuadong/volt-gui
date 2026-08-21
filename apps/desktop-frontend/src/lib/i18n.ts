// Desktop localization dictionary and translator (Svelte + pure TS).
import { en, type DictKey } from "../locales/en";
import { zh } from "../locales/zh";
import { zhTW } from "../locales/zh-TW";

export type Locale = "en" | "zh" | "zh-TW";
export type { DictKey };
export type LangPref = "" | "en" | "zh" | "zh-TW";

const DICTS: Record<Locale, Record<DictKey, string>> = { en, zh, "zh-TW": zhTW };
const STORAGE_KEY = "reasonix-lang";

export const SPINNER_WORDS: Record<Locale, string[]> = {
  en: [
    "Frolicking", "Pondering", "Noodling", "Brewing", "Conjuring", "Cogitating",
    "Percolating", "Ruminating", "Simmering", "Synthesizing", "Tinkering",
    "Marinating", "Crunching", "Hatching", "Mulling", "Whirring", "Forging",
    "Spelunking", "Puttering", "Vibing",
  ],
  zh: [
    "嬉游中", "沉思中", "鼓捣中", "酝酿中", "施法中", "苦思中",
    "渗滤中", "反刍中", "文火慢炖", "合成中", "修补中",
    "腌制入味", "嘎吱运算", "孵化中", "盘算中", "嗡嗡运转", "锻造中",
    "探洞中", "摆弄中", "来感觉了",
  ],
  "zh-TW": [
    "嬉遊中", "沉思中", "鼓搗中", "醞釀中", "施法中", "苦思中",
    "滲濾中", "反芻中", "文火慢燉", "合成中", "修補中",
    "醃製入味", "嘎吱運算", "孵化中", "盤算中", "嗡嗡運轉", "鍛造中",
    "探洞中", "擺弄中", "來感覺了",
  ],
};

export function detectLocale(pref: LangPref): Locale {
  if (pref === "en" || pref === "zh" || pref === "zh-TW") return pref;
  const nav = typeof navigator !== "undefined" ? navigator.language.toLowerCase() : "en";
  if (nav.startsWith("zh-tw") || nav.startsWith("zh-hant") || nav === "zh-hk" || nav === "zh-mo") return "zh-TW";
  return nav.startsWith("zh") ? "zh" : "en";
}

export function normalizeLangPref(v: unknown): LangPref {
  return v === "en" || v === "zh" || v === "zh-TW" ? v : "";
}

export function readLegacyLangPref(): LangPref {
  const v = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  return normalizeLangPref(v);
}

export function clearLegacyLangPref(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* private mode / no storage */
  }
}

let currentLocale: Locale = detectLocale(readLegacyLangPref() || "");

function translate(locale: Locale, key: DictKey, vars?: Record<string, string | number>): string {
  const s = DICTS[locale]?.[key] ?? DICTS.en[key] ?? key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function t(key: DictKey, vars?: Record<string, string | number>): string {
  return translate(currentLocale, key, vars);
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(next: Locale): void {
  currentLocale = next;
  if (typeof document !== "undefined") {
    document.documentElement.lang = next === "zh" ? "zh-CN" : next === "zh-TW" ? "zh-TW" : "en";
  }
}

export type Translator = (key: DictKey, vars?: Record<string, string | number>) => string;

export function useT(): Translator {
  return t;
}
