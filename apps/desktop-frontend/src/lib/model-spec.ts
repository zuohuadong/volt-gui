// 模型规格里的数字要统一口径（#361）：中文界面里 `300.000` 会被读成 300 点几，
// 同一页出现点号与逗号两种千分位会让人怀疑数值有误。这里固定用逗号分组并补单位。

const GROUPING = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, useGrouping: true });

/** 字符串里的「千分位点」要当分组符处理：`300.000` 是 30 万，不是 300。 */
function normalizeSpecDigits(raw: string): string {
  const trimmed = raw.trim().replace(/[\s_]/gu, "");
  return /^\d{1,3}(?:\.\d{3})+$/u.test(trimmed) ? trimmed.replaceAll(".", "") : trimmed.replaceAll(",", "");
}

/** 统一的千分位格式；无法解析的值原样返回空串，不显示占位符。 */
export function formatSpecNumber(value: number | string | undefined | null): string {
  if (value === undefined || value === null) return "";
  const numeric = typeof value === "number" ? value : Number(normalizeSpecDigits(String(value)));
  if (!Number.isFinite(numeric)) return "";
  return GROUPING.format(Math.trunc(numeric));
}

/** 「上下文 1,048,576 tokens」：数字与单位一起给出，避免用户猜是字符还是 token。 */
export function formatTokenSpec(value: number | string | undefined | null): string {
  const formatted = formatSpecNumber(value);
  return formatted ? `${formatted} tokens` : "";
}

/**
 * 规格差异说明：同一页面里输出上限不一致时，标明该项取自模型自身配置，
 * 而不是把数字悄悄改成看起来一致（数据是上游给的，不能编）。
 */
export function describeSpecDifference(values: ReadonlyArray<number | undefined>): boolean {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  return new Set(known).size > 1;
}
/**
 * 模型名里的英文括号别名（如 `VLM (Qwen Text Alias)`）是内部代号（#361）：
 * 对选择模型没有帮助，展示时去掉，但保留原始 id 供排查。
 */
export function stripInternalAlias(name: string): string {
  const raw = String(name ?? "").trim();
  // 只收“内部代号”这种明确写法，`(8B)`、`（离线）` 这类有用信息一律保留。
  const stripped = raw.replace(/\s*[（(][^()（）]*\balias\b[^()（）]*[)）]\s*$/iu, "").trim();
  return stripped || raw;
}
