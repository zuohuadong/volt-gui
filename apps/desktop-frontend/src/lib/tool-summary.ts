// 活动记录与工具卡片面向用户，不面向研发（#357 / #358）：
// 工具名、命令行、英文报错和本机绝对路径都不该出现在默认视图里。
// 这里把工具调用压成一句业务语言摘要，并给出可读的状态句。

export type ToolStateLike = "running" | "success" | "error" | "interrupted" | string;

export type ToolStateSummary = {
  total: number;
  running: number;
  failed: number;
  interrupted: number;
  completed: number;
};

export function summarizeToolStates(states: readonly ToolStateLike[]): ToolStateSummary {
  const summary: ToolStateSummary = { total: states.length, running: 0, failed: 0, interrupted: 0, completed: 0 };
  for (const state of states) {
    if (state === "running") summary.running += 1;
    else if (state === "error") summary.failed += 1;
    else if (state === "interrupted") summary.interrupted += 1;
    else summary.completed += 1;
  }
  return summary;
}

/**
 * 汇总行的口径：局部失败不等于整轮失败。只有一项都没成功、且没有在跑的时候，
 * 才算整体失败（此时用红色）；其余情况都是中性/进行中。
 */
export type ToolSummaryKind = "running" | "all-success" | "partial" | "failed" | "empty";

export function toolSummaryKind(summary: ToolStateSummary): ToolSummaryKind {
  if (summary.total === 0) return "empty";
  if (summary.running > 0) return "running";
  if (summary.failed + summary.interrupted === 0) return "all-success";
  if (summary.completed === 0) return "failed";
  return "partial";
}

const TOOL_LABEL_RULES: ReadonlyArray<{ match: RegExp; label: string }> = [
  { match: /^(glob|list|ls|find|dir)$/u, label: "查找文件" },
  { match: /^(grep|ripgrep|rg|search)$/u, label: "检索内容" },
  { match: /^(read|cat|open|view)$/u, label: "读取文档" },
  { match: /^(write|edit|apply_patch|patch|create)$/u, label: "写入文档" },
  { match: /(browser|web)/u, label: "浏览器操作" },
  { match: /(computer|screen|cua)/u, label: "电脑操作" },
  { match: /(office|document|docx|xlsx|pptx|pdf|ocr)/u, label: "文档处理" },
  { match: /(skill)/u, label: "加载能力" },
  { match: /(shell|bash|pwsh|powershell|command|exec|terminal)/u, label: "执行命令" },
  { match: /(file|filesystem)/u, label: "文件操作" },
];

/** 工具调用的业务语言名称；`dsh-tools:glob` 这类带命名空间的名字也能识别。 */
export function toolBusinessLabel(name: string): string {
  const normalized = name.trim().toLowerCase();
  const bare = normalized.includes(":") ? normalized.split(":").at(-1) ?? normalized : normalized;
  const direct = TOOL_LABEL_RULES.find((rule) => rule.match.test(bare));
  if (direct) return direct.label;
  const loose = TOOL_LABEL_RULES.find((rule) => rule.match.test(normalized));
  return loose?.label ?? "工具调用";
}

/**
 * 展示用路径：只保留最后一段文件名，盘符、用户名与临时目录全部丢弃。
 * 完整值仍然保存在「技术详情」里，需要复制时从那里取。
 */
export function redactPathForDisplay(value: string): string {
  const cleaned = String(value ?? "").replace(/[?#].*$/u, "").trim();
  const segments = cleaned.replaceAll("\\", "/").split("/").map((segment) => segment.trim()).filter(Boolean);
  return (segments.at(-1) ?? "").replace(/^_+/u, "");
}

/**
 * 长路径的紧凑写法：只保留最后两段，前面用省略号（#359）。
 * 完整值仍可复制，页面上不再摊开整行本机路径。
 */
export function condensePath(value: string, keep = 2): string {
  const cleaned = String(value ?? "").replace(/[?#].*$/u, "").trim();
  if (!cleaned) return "";
  const normalized = cleaned.replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  if (segments.length <= keep) return segments.join("/");
  return `…/${segments.slice(-keep).join("/")}`;
}

/** 参数里能安全展示的片段：查询词或文件名；命令行与参数串一律不展示。 */
export function safeToolDetail(args: string | undefined, fallback?: string): string | undefined {
  const raw = String(args ?? "").trim();
  if (!raw) return fallback ? redactPathForDisplay(fallback) || undefined : undefined;
  const record = parseArgumentRecord(raw);
  const candidate = record?.query ?? record?.pattern ?? record?.path ?? record?.file ?? record?.name;
  if (typeof candidate === "string" && candidate.trim()) {
    const value = candidate.trim();
    // 纯查询词可以直接展示；像路径的一律脱敏成文件名。
    return /[\\/]/u.test(value) ? redactPathForDisplay(value) || undefined : truncate(value);
  }
  // 没有可读字段时退回 fallback（通常是工具 view 里的名称），绝不回显原始参数串。
  return fallback ? truncate(redactPathForDisplay(fallback) || fallback) : undefined;
}

function truncate(value: string, limit = 64): string {
  const normalized = value.replace(/[\r\n\t]+/gu, " ").replace(/\s{2,}/gu, " ").trim();
  return normalized.length > limit ? `${normalized.slice(0, limit)}…` : normalized;
}

function parseArgumentRecord(args: string): Record<string, unknown> | undefined {
  if (!args.startsWith("{")) return undefined;
  try {
    const parsed = JSON.parse(args);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 失败项的说明：讲清影响与是否继续，而不是把英文堆栈贴给用户。
 * `detail` 是可选的补充（例如「已跳过该条件」），由调用方按语言给出。
 */
export function toolErrorNeedsTechnicalDetail(message: string | undefined): boolean {
  const raw = String(message ?? "").trim();
  if (!raw) return false;
  return /error|exception|exit\s*\d|traceback|enoent|eacces|failed/iu.test(raw);
}