/**
 * 引用对话里的一段原文（"选择引用"）。
 *
 * 目的和 Codex 的选区引用一致：用户指着某一段（通常是助手回答或自己的问题）说
 * "就这段"，模型不用猜指的是哪里。所以引用块必须带可读的来源，并按原文逐字保留
 * ——不做 Markdown 转义、不改反斜杠和空格，否则原文就变了（#349 的同一条要求）。
 */
export type QuoteRole = "user" | "assistant" | "tool" | "system";

export type QuoteRequest = {
  readonly text: string;
  readonly role: QuoteRole;
  /** 消息 id，只用于界面去重/诊断，不写进引用正文。 */
  readonly messageId?: string;
};

/** 引用正文上限：再长就截断，避免一次选区把整轮对话塞回输入框。 */
export const QUOTE_MAX_CHARS = 600;

/** 每行行尾空白来自 HTML 选区，不是用户写的；只修这一处，其余保持原样。 */
export function normalizeQuoteText(raw: string): string {
  const lines = (raw ?? "")
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/u, ""));
  // 只去掉两端的空行；首行缩进属于原文（引用代码块时不能吃掉）。
  while (lines.length > 0 && lines[0] === "") lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  return lines
    .join("\n")
    // 连续空行压到最多一行，避免引用块里出现大段空白。
    .replace(/\n{3,}/gu, "\n\n");
}

const roleLabel = (role: QuoteRole): string => {
  switch (role) {
    case "user": return "我";
    case "assistant": return "助手";
    case "tool": return "工具输出";
    default: return "系统";
  }
};

export type QuoteBuildResult = {
  readonly ok: boolean;
  readonly text: string;
  readonly charCount: number;
  readonly truncated: boolean;
};

/**
 * 生成要插进输入框的引用块。
 *
 * 选区为空（或只有空白）时不返回 `ok`，调用方据此保持输入框不变。
 */
export function buildQuoteReference(request: QuoteRequest, maxChars = QUOTE_MAX_CHARS): QuoteBuildResult {
  const normalized = normalizeQuoteText(request.text ?? "");
  if (!normalized) return { ok: false, text: "", charCount: 0, truncated: false };
  const truncated = normalized.length > maxChars;
  const body = truncated ? `${normalized.slice(0, maxChars).trimEnd()}…` : normalized;
  const label = roleLabel(request.role);
  const lines = body.split("\n").map((line) => (line ? `> ${line}` : ">"));
  const header = truncated
    ? `> 引用${label}原文（已截断，原文 ${normalized.length} 字）：`
    : `> 引用${label}原文：`;
  return {
    ok: true,
    text: [header, ...lines].join("\n"),
    charCount: normalized.length,
    truncated,
  };
}

/**
 * 把引用块并进草稿：已有内容就空一行接在后面，不覆盖用户正在写的东西。
 * 返回的文本直接写回输入框。
 */
export function appendQuoteToDraft(draft: string, quote: string): string {
  if (!quote) return draft;
  const existing = draft.replace(/\s+$/u, "");
  return existing ? `${existing}\n\n${quote}` : quote;
}
