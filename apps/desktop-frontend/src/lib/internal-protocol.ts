/**
 * 内部生成协议泄漏过滤（#363）。
 *
 * 结构化输出契约、schema 字段名和面向模型的英文约束都属于内部实现。模型有时会把
 * 它们当正文吐出来，用户看到的是 `schemaVersion`、`surface-agent/v2`、
 * `additionalProperties` 这类既看不懂也无法操作的内容。
 *
 * 这里只做「逐行剔除 + 残留标记收敛」，不做语义改写：过滤后如果整段都是协议内容，
 * 由调用方降级成一句业务说明，而不是把半截 JSON 或空气泡留给用户。
 */

/** 一行里出现这些标记，就判定为内部协议文本。 */
const INTERNAL_PROTOCOL_MARKERS = [
  /surface-agent\/v\d+/iu,
  /schemaVersion/iu,
  /cannot-fulfill/iu,
  /insufficient_(?:permissions|context)/iu,
  /additionalProperties/iu,
  /\bminLength\b/iu,
  /\bmaxLength\b/iu,
  /\bconst\b\s*:/iu,
  /answer in prose/iu,
  /omit the fenced block/iu,
  /never invent capabilities/iu,
  /\[Volt host policy\]/iu,
  /surface contract/iu,
  /结构化输出契约/iu,
];

/** 整行都是 JSON 结构符号（`{}`、`"key": value,`、`}` 之类）。 */
const STRUCTURAL_ONLY_LINE = /^[\s{}[\],:"]*(?:"[^"]*"[\s:,\[\]{}]*)?[\s{}[\],:"]*$/u;

/** 代码块里只认真正的协议痕迹；合法的界面提案同样有 schemaVersion，不能一刀切。 */
const FENCE_PROTOCOL_MARKERS = [
  /cannot-fulfill/iu,
  /insufficient_(?:permissions|context)/iu,
  /additionalProperties/iu,
  /\bminLength\b/iu,
  /\bmaxLength\b/iu,
  /answer in prose/iu,
  /omit the fenced block/iu,
  /\[Volt host policy\]/iu,
];

export type InternalProtocolStrip = {
  /** 过滤后的正文。 */
  readonly text: string;
  /** 是否真的命中了内部协议文本。 */
  readonly leaked: boolean;
};

function isProtocolLine(line: string): boolean {
  if (INTERNAL_PROTOCOL_MARKERS.some((marker) => marker.test(line))) return true;
  const trimmed = line.trim();
  if (!trimmed) return false;
  // 裸露的字段定义行（`"schemaVersion": "surface-agent/v2",`）也属于协议内容。
  return /^"[A-Za-z_][\w]*"\s*:/u.test(trimmed) && STRUCTURAL_ONLY_LINE.test(trimmed);
}

type Row = { line: string; drop: boolean; structural: boolean };

/**
 * 从助手正文里剔除内部协议片段。
 *
 * 规则：逐行剔除命中标记的文本、丢弃含协议痕迹且不是 ```surface 的代码块，
 * 并顺带清掉紧邻这些内容的裸露结构行（`{`、`}`），不留下半截 JSON。
 * 合法的界面提案与用户要的 JSON 回答不受影响。
 */
export function stripInternalProtocol(text: string): InternalProtocolStrip {
  if (!text) return { text: "", leaked: false };
  const lines = text.split("\n");
  const rows: Row[] = [];
  let leaked = false;
  let fence: { language: string; body: string[] } | undefined;
  for (const line of lines) {
    const fenceOpen = /^\s*```(.*)$/u.exec(line);
    if (fence) {
      if (fenceOpen) {
        const language = fence.language.trim().toLowerCase();
        const protocol = language !== "surface" && fence.body.some((item) => FENCE_PROTOCOL_MARKERS.some((marker) => marker.test(item)));
        if (protocol) leaked = true;
        rows.push({ line: "```" + fence.language, drop: protocol, structural: false });
        for (const item of fence.body) rows.push({ line: item, drop: protocol, structural: false });
        rows.push({ line, drop: protocol, structural: false });
        fence = undefined;
      } else {
        fence.body.push(line);
      }
      continue;
    }
    if (fenceOpen) {
      fence = { language: fenceOpen[1] ?? "", body: [] };
      continue;
    }
    const protocol = isProtocolLine(line);
    if (protocol) leaked = true;
    rows.push({ line, drop: protocol, structural: STRUCTURAL_ONLY_LINE.test(line) && line.trim().length > 0 });
  }
  if (fence) {
    const language = fence.language.trim().toLowerCase();
    const protocol = language !== "surface" && fence.body.some((item) => FENCE_PROTOCOL_MARKERS.some((marker) => marker.test(item)));
    if (protocol) leaked = true;
    rows.push({ line: "```" + fence.language, drop: protocol, structural: false });
    for (const item of fence.body) rows.push({ line: item, drop: protocol, structural: false });
  }
  if (!leaked) return { text, leaked: false };
  // 协议内容周边裸露的结构行一并清掉。
  rows.forEach((row, index) => {
    if (row.drop || !row.structural) return;
    const before = rows[index - 1];
    const after = rows[index + 1];
    if (before?.drop || after?.drop) row.drop = true;
  });
  const cleaned = rows.filter((row) => !row.drop).map((row) => row.line)
    .join("\n").replace(/\n{3,}/gu, "\n\n").trim();
  return { text: cleaned, leaked: true };
}

/** 过滤后是否只剩空白（调用方据此降级成一句业务说明）。 */
export function isEmptyAfterStrip(value: InternalProtocolStrip): boolean {
  return value.leaked && value.text.trim().length === 0;
}
