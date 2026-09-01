export type Locale = "zh-CN" | "en-US";

export interface LocaleOption {
  code: Locale;
  label: string;
  nativeName: string;
}

export type TranslationDict = {
  [key: string]: string | TranslationDict;
};

export type TranslationParams = Record<string, string | number | boolean | undefined | null>;
