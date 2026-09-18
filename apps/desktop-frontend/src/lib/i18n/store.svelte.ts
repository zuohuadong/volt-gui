import type { Locale, TranslationDict, TranslationParams } from "./types";
import { zhCN } from "./zh-CN";
import { enUS } from "./en-US";

const DICTIONARIES: Record<Locale, TranslationDict> = {
  "zh-CN": zhCN,
  "en-US": enUS,
};

const STORAGE_KEY = "volt_desktop_locale";

function getInitialLocale(): Locale {
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved === "zh-CN" || saved === "en-US") return saved;
    } catch {
      // ignore storage errors
    }
  }
  return "zh-CN";
}

class I18nState {
  locale = $state<Locale>(getInitialLocale());

  setLocale(nextLocale: Locale): void {
    if (this.locale === nextLocale) return;
    this.locale = nextLocale;
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem(STORAGE_KEY, nextLocale);
      } catch {
        // ignore
      }
    }
  }

  getLocale(): Locale {
    return this.locale;
  }

  toggleLocale(): Locale {
    const next = this.locale === "zh-CN" ? "en-US" : "zh-CN";
    this.setLocale(next);
    return next;
  }

  t(key: string, params?: TranslationParams): string {
    const currentDict = DICTIONARIES[this.locale] || zhCN;
    let value = getNestedValue(currentDict, key);

    if (value === undefined && this.locale !== "zh-CN") {
      value = getNestedValue(zhCN, key);
    }

    if (value === undefined) {
      return key;
    }

    if (typeof value !== "string") {
      return key;
    }

    return formatTemplate(value, params);
  }
}

function getNestedValue(dict: TranslationDict, path: string): string | TranslationDict | undefined {
  const segments = path.split(".");
  let current: unknown = dict;

  for (const segment of segments) {
    if (current && typeof current === "object" && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }

  return current as string | TranslationDict | undefined;
}

function formatTemplate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const val = params[key];
    if (val === undefined || val === null) return match;
    return String(val);
  });
}

export const i18n = new I18nState();

export function t(key: string, params?: TranslationParams): string {
  return i18n.t(key, params);
}

export function getLocale(): Locale {
  return i18n.getLocale();
}

export function setLocale(locale: Locale): void {
  i18n.setLocale(locale);
}

export function toggleLocale(): Locale {
  return i18n.toggleLocale();
}
