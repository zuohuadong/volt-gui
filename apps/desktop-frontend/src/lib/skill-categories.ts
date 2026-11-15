/**
 * 技能商店的分类模型（技能商店重构 P0/P1）。
 *
 * 索引 `skills.index.json` 里 `category` 是可选字段，老索引与老仓库都没有它。
 * 因此这里做两件事：
 * 1. 把索引给的 `category`（中英文都接受）归一到固定 id；
 * 2. 缺失时按 id / 标签推断，保证旧索引也能分类展示。
 *
 * 分类按"任务域"划分，技术栈放在标签里，避免出现"按语言分类"导致同一技能多归属。
 */

export type SkillCategoryId =
  | "office"
  | "engineering"
  | "data"
  | "quality"
  | "security"
  | "hardware"
  | "other";

export interface SkillCategoryDefinition {
  readonly id: SkillCategoryId;
  /** i18n key（skillStore.categories.*）。 */
  readonly labelKey: string;
  readonly icon: "briefcase" | "code" | "chart" | "check" | "shield" | "cpu" | "box";
}

export const SKILL_CATEGORIES: readonly SkillCategoryDefinition[] = [
  { id: "office", labelKey: "skillStore.categories.office", icon: "briefcase" },
  { id: "engineering", labelKey: "skillStore.categories.engineering", icon: "code" },
  { id: "data", labelKey: "skillStore.categories.data", icon: "chart" },
  { id: "quality", labelKey: "skillStore.categories.quality", icon: "check" },
  { id: "security", labelKey: "skillStore.categories.security", icon: "shield" },
  { id: "hardware", labelKey: "skillStore.categories.hardware", icon: "cpu" },
  { id: "other", labelKey: "skillStore.categories.other", icon: "box" },
];

/** 索引里可能出现的分类别名（中英文），统一映射到固定 id。 */
const CATEGORY_ALIASES: Readonly<Record<string, SkillCategoryId>> = {
  office: "office",
  "office-docs": "office",
  document: "office",
  documents: "office",
  "办公": "office",
  "办公与文档": "office",
  engineering: "engineering",
  development: "engineering",
  dev: "engineering",
  "研发与架构": "engineering",
  "研发": "engineering",
  "开发": "engineering",
  data: "data",
  analytics: "data",
  "数据与分析": "data",
  "数据分析": "data",
  quality: "quality",
  testing: "quality",
  qa: "quality",
  "测试与质量": "quality",
  security: "security",
  compliance: "security",
  "安全与合规": "security",
  hardware: "hardware",
  semiconductor: "hardware",
  pcb: "hardware",
  "半导体与硬件": "hardware",
  other: "other",
  "其他": "other",
};

/** 按 id 前缀/关键词推断分类；顺序即优先级。 */
const ID_RULES: ReadonlyArray<readonly [RegExp, SkillCategoryId]> = [
  [/^office-|^document-|^docx-|^xlsx-|^pptx-/, "office"],
  [/^semiconductor-|^pcb-|^circuit-|^ate-/, "hardware"],
  [/^security-|security|^compliance-/, "security"],
  [/^test-plan|^qa-|^quality-|^code-review$|^prompt-evaluation$/, "quality"],
  [/^data-|^rag-|^sql-|^analytics-|^report-/, "data"],
  [/-development$|^api-design$|^architecture-|^cicd-|^devops-|^mcp-tool-builder$|^bunjs-/, "engineering"],
];

const TAG_RULES: ReadonlyArray<readonly [RegExp, SkillCategoryId]> = [
  [/办公|文档|office|docx|xlsx|pptx/i, "office"],
  [/半导体|硬件|pcb|电路/i, "hardware"],
  [/安全|合规|security|compliance/i, "security"],
  [/测试|质量|qa|testing/i, "quality"],
  [/数据|分析|报表|data|analytics|sql|检索/i, "data"],
  [/开发|架构|工程|开发工具|development|architecture|devops|ci\/cd/i, "engineering"],
];

export interface CategorizableSkill {
  readonly id: string;
  readonly category?: string;
  readonly tags?: readonly string[];
}

/** 归一化索引里的分类值；无法识别时返回 undefined。 */
export function normalizeSkillCategory(value: string | undefined): SkillCategoryId | undefined {
  if (!value) return undefined;
  const key = value.trim().toLowerCase();
  if (!key) return undefined;
  if (Object.hasOwn(CATEGORY_ALIASES, key)) return CATEGORY_ALIASES[key];
  // 索引可能写成 "Engineering / 研发"，取第一个可识别片段。
  for (const part of key.split(/[/、,|]/u)) {
    const trimmed = part.trim();
    if (Object.hasOwn(CATEGORY_ALIASES, trimmed)) return CATEGORY_ALIASES[trimmed];
  }
  return undefined;
}

/** 推断技能分类：索引优先，其次 id，最后标签，未知归入 other。 */
export function inferSkillCategory(skill: CategorizableSkill): SkillCategoryId {
  const declared = normalizeSkillCategory(skill.category);
  if (declared) return declared;
  for (const [pattern, category] of ID_RULES) {
    if (pattern.test(skill.id)) return category;
  }
  for (const tag of skill.tags ?? []) {
    for (const [pattern, category] of TAG_RULES) {
      if (pattern.test(tag)) return category;
    }
  }
  return "other";
}

export type SkillSortOrder = "recommended" | "updated" | "name";
export type SkillInstallFilter = "all" | "installed" | "updates";

export interface FilterableSkill extends CategorizableSkill {
  readonly id: string;
  readonly title?: string;
  readonly description?: string;
  readonly whenToUse?: string;
  readonly scenarios?: readonly string[];
  readonly installed?: boolean;
  readonly updateAvailable?: boolean;
  readonly updatedAt?: string;
}

function matchesQuery(skill: FilterableSkill, query: string): boolean {
  if (!query) return true;
  const haystack = [
    skill.id,
    skill.title ?? "",
    skill.description ?? "",
    skill.whenToUse ?? "",
    ...(skill.scenarios ?? []),
    ...(skill.tags ?? []),
  ].join(" ").toLowerCase();
  return haystack.includes(query);
}

export interface SkillFilterOptions {
  readonly category?: SkillCategoryId | "all";
  readonly query?: string;
  readonly installFilter?: SkillInstallFilter;
}

export function filterSkills<T extends FilterableSkill>(skills: readonly T[], options: SkillFilterOptions): T[] {
  const category = options.category ?? "all";
  const query = (options.query ?? "").trim().toLowerCase();
  const installFilter = options.installFilter ?? "all";
  return skills.filter((skill) => {
    if (category !== "all" && inferSkillCategory(skill) !== category) return false;
    if (installFilter === "installed" && !skill.installed) return false;
    if (installFilter === "updates" && !skill.updateAvailable) return false;
    return matchesQuery(skill, query);
  });
}

export function sortSkills<T extends FilterableSkill>(skills: readonly T[], order: SkillSortOrder): T[] {
  const compareName = (left: T, right: T) => (left.title || left.id).localeCompare(right.title || right.id, "zh-Hans-CN");
  const sorted = [...skills];
  if (order === "name") return sorted.sort(compareName);
  if (order === "updated") {
    return sorted.sort((left, right) => {
      const leftTime = left.updatedAt ? Date.parse(left.updatedAt) : 0;
      const rightTime = right.updatedAt ? Date.parse(right.updatedAt) : 0;
      if (leftTime !== rightTime) return rightTime - leftTime;
      return compareName(left, right);
    });
  }
  // recommended：已安装优先，其次有可用更新，最后按名称稳定排序。
  return sorted.sort((left, right) => {
    if (Boolean(left.installed) !== Boolean(right.installed)) return left.installed ? -1 : 1;
    if (Boolean(left.updateAvailable) !== Boolean(right.updateAvailable)) return left.updateAvailable ? -1 : 1;
    return compareName(left, right);
  });
}

export function countSkillsByCategory(skills: readonly FilterableSkill[]): Record<SkillCategoryId | "all", number> {
  const counts = { all: skills.length } as Record<SkillCategoryId | "all", number>;
  for (const category of SKILL_CATEGORIES) counts[category.id] = 0;
  for (const skill of skills) counts[inferSkillCategory(skill)] += 1;
  return counts;
}

/** 人类可读的大小，用于卡片信息密度控制。 */
export function formatSkillSize(bytes: number | undefined): string | undefined {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes < 0) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}