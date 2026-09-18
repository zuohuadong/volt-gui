export * from "./types";
export { zhCN } from "./zh-CN";
export { enUS } from "./en-US";
export {
  i18n,
  t,
  getLocale,
  setLocale,
  toggleLocale,
} from "./store.svelte";

export const AVAILABLE_LOCALES = [
  { code: "zh-CN", label: "简体中文", nativeName: "简体中文" },
  { code: "en-US", label: "English", nativeName: "English" },
] as const;
