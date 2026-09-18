import { t } from "./i18n";

export const UI_CUSTOMIZATION_SCHEMA = "voltui/ui-patch-v1" as const;

export type UiDensity = "compact" | "comfortable";
export type UiVisibility = "visible" | "hidden";

export interface UiQuickAction {
  readonly label: string;
  readonly prompt: string;
}

export interface UiCustomizationPatch {
  readonly schemaVersion: typeof UI_CUSTOMIZATION_SCHEMA;
  readonly title?: string;
  readonly subtitle?: string;
  readonly density?: UiDensity;
  readonly sidebar?: "expanded" | "collapsed";
  readonly activity?: UiVisibility;
  readonly composerRows?: 2 | 3 | 4;
  readonly quickActions?: readonly UiQuickAction[];
}

export interface UiCustomizationState {
  readonly title: string;
  readonly subtitle: string;
  readonly density: UiDensity;
  readonly sidebar: "expanded" | "collapsed";
  readonly activity: UiVisibility;
  readonly composerRows: 2 | 3 | 4;
  readonly quickActions: readonly UiQuickAction[];
}

export const DEFAULT_UI_CUSTOMIZATION: UiCustomizationState = {
  title: "",
  subtitle: "",
  density: "comfortable",
  sidebar: "expanded",
  activity: "hidden",
  composerRows: 3,
  quickActions: [],
};

const MAX_TITLE_LENGTH = 80;
const MAX_SUBTITLE_LENGTH = 160;
const MAX_QUICK_ACTIONS = 3;
const MAX_PROMPT_LENGTH = 240;
const forbiddenText = /<\/?[a-z][^>]*>|(?:javascript:|data:|https?:\/\/)/i;

export type UiCustomizationParseResult =
  | { readonly ok: true; readonly value: UiCustomizationPatch }
  | { readonly ok: false; readonly error: string };

function boundedText(value: unknown, max: number, label: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim().length === 0 || value.length > max || forbiddenText.test(value)) {
    throw new Error(t("customization.invalidField", { label }));
  }
  return value.trim();
}

function parsePatch(value: unknown): UiCustomizationPatch {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(t("customization.patchMustBeObject"));
  const record = value as Record<string, unknown>;
  if (record.schemaVersion !== UI_CUSTOMIZATION_SCHEMA) throw new Error(t("customization.unsupportedPatchVersion"));
  const allowed = new Set([
    "schemaVersion", "title", "subtitle", "density", "sidebar", "activity", "composerRows", "quickActions",
  ]);
  for (const key of Object.keys(record)) if (!allowed.has(key)) throw new Error(t("customization.unknownPatchField", { key }));

  const density = record.density === undefined ? undefined : record.density;
  if (density !== undefined && density !== "compact" && density !== "comfortable") throw new Error(t("customization.invalidDensity"));
  const sidebar = record.sidebar === undefined ? undefined : record.sidebar;
  if (sidebar !== undefined && sidebar !== "expanded" && sidebar !== "collapsed") throw new Error(t("customization.invalidSidebar"));
  const activity = record.activity === undefined ? undefined : record.activity;
  if (activity !== undefined && activity !== "visible" && activity !== "hidden") throw new Error(t("customization.invalidActivity"));
  const composerRows = record.composerRows === undefined ? undefined : record.composerRows;
  if (composerRows !== undefined && composerRows !== 2 && composerRows !== 3 && composerRows !== 4) throw new Error(t("customization.invalidComposerRows"));

  let quickActions: UiQuickAction[] | undefined;
  if (record.quickActions !== undefined) {
    if (!Array.isArray(record.quickActions) || record.quickActions.length > MAX_QUICK_ACTIONS) throw new Error(t("customization.invalidQuickActionCount"));
    quickActions = record.quickActions.map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error(t("customization.quickActionMustBeObject"));
      const action = item as Record<string, unknown>;
      const label = boundedText(action.label, 32, "quickAction.label");
      const prompt = boundedText(action.prompt, MAX_PROMPT_LENGTH, "quickAction.prompt");
      if (!label || !prompt) throw new Error(t("customization.quickActionMissingFields"));
      return { label, prompt };
    });
  }

  return {
    schemaVersion: UI_CUSTOMIZATION_SCHEMA,
    title: boundedText(record.title, MAX_TITLE_LENGTH, "title"),
    subtitle: boundedText(record.subtitle, MAX_SUBTITLE_LENGTH, "subtitle"),
    density,
    sidebar,
    activity,
    composerRows,
    quickActions,
  };
}

function candidateJsonStrings(text: string): string[] {
  const candidates: string[] = [];
  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  for (const match of text.matchAll(fence)) candidates.push(match[1]);
  const objectStart = /\{\s*"schemaVersion"/g;
  for (const match of text.matchAll(objectStart)) {
    const start = match.index;
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = start; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (character === "\\") escaped = true;
        else if (character === '"') quoted = false;
        continue;
      }
      if (character === '"') quoted = true;
      else if (character === "{") depth += 1;
      else if (character === "}" && --depth === 0) {
        candidates.push(text.slice(start, index + 1));
        break;
      }
    }
  }
  return candidates;
}

export function parseUiCustomization(text: string): UiCustomizationParseResult {
  for (const candidate of candidateJsonStrings(text)) {
    try {
      return { ok: true, value: parsePatch(JSON.parse(candidate)) };
    } catch {
      // Continue searching; an assistant may include an explanatory JSON block first.
    }
  }
  return { ok: false, error: t("customization.patchNotFound") };
}

export function applyUiCustomization(
  current: UiCustomizationState,
  patch: UiCustomizationPatch,
): UiCustomizationState {
  return {
    title: patch.title ?? current.title,
    subtitle: patch.subtitle ?? current.subtitle,
    density: patch.density ?? current.density,
    sidebar: patch.sidebar ?? current.sidebar,
    activity: patch.activity ?? current.activity,
    composerRows: patch.composerRows ?? current.composerRows,
    quickActions: patch.quickActions ?? current.quickActions,
  };
}

export function isUiCustomizationIntent(text: string): boolean {
  const target = /(界面|布局|侧栏|活动面板|工作台|输入框|快捷操作|标题|副标题|密度|interface|layout|sidebar|activity panel|workbench|composer|quick action|\btitle\b|\bsubtitle\b|\bdensity\b)/iu;
  const change = /(调整|修改|改变|改成|改为|切换|收起|展开|显示|隐藏|自定义|定制|紧凑|舒适|增加|减少|collapse|expand|hide|show|switch|change|customize|compact|comfortable)/iu;
  return target.test(text) && change.test(text);
}

export function buildUiCustomizationPrompt(text: string): string {
  return `${text}\n\n[Volt UI customization protocol]\n${t("customization.protocol", { schema: UI_CUSTOMIZATION_SCHEMA })}`;
}
