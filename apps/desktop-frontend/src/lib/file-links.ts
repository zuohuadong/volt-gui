// 交付文件链接：模型经常输出 [_交付核对.md](C:\Users\x\Workspace\交付核对.md)。
// 渲染层不能把 Markdown 源码和本机绝对路径直接丢给用户（#331），所以先把这类链接
// 抽出来，正文只保留说明，文件入口由独立的、可点击的卡片承担。

export type LocalFileLink = { label: string; path: string };
export type LocalFileLinkSplit = { text: string; links: LocalFileLink[] };

const MARKDOWN_LINK = /\[([^\]\n]{0,200})\]\(([^)\n]{1,400})\)/gu;
const SCHEME = /^[a-z][a-z0-9+.-]*:/iu;
const WINDOWS_ABSOLUTE = /^[a-z]:[\\/]/iu;
const UNC = /^\\\\/u;
const POSIX_ABSOLUTE = /^\//u;

/** 判断链接目标是不是本机文件路径；http(s)、mailto 等外部协议一律不算。 */
export function isLocalFilePath(target: string): boolean {
  const value = target.trim().replaceAll("\\ ", " ").replace(/^<|>$/gu, "");
  if (!value || SCHEME.test(value) && !WINDOWS_ABSOLUTE.test(value)) return false;
  return WINDOWS_ABSOLUTE.test(value) || UNC.test(value) || POSIX_ABSOLUTE.test(value);
}

/** 用户可见的文件名：去掉内部命名前缀 `_`，回退到路径最后一段。 */
export function displayFileName(label: string, target: string): string {
  const trimmed = label.trim().replace(/^_+/u, "");
  if (trimmed) return trimmed;
  const segments = target.trim().replaceAll("\\", "/").split("/");
  return (segments.at(-1) ?? "").replace(/^_+/u, "") || target.trim();
}

/** 拆分正文与本机文件链接；代码块中的内容原样保留。 */
// 上游（或链接安全过滤）会把渲染不了的链接替换成 `[blocked]` 这类方括号占位符（#355）。
// 用户看到的是错误码而不是文件名，所以正文里一律去掉这些占位符；真正打不开时由
// 交付卡片给出业务语言的失败提示。
const INTERNAL_PLACEHOLDER = /\[(?:blocked|redacted|internal|hidden|filtered|omitted)\]/giu;

/** 去掉方括号内部占位符，并收拾因此留下的多余空格与标点。 */
export function stripInternalPlaceholders(text: string): string {
  const stripped = String(text ?? "").replace(INTERNAL_PLACEHOLDER, "");
  if (stripped === text) return text;
  return stripped
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]+([，。；：、,.!?])/gu, "$1")
    .replace(/[ \t]+\n/gu, "\n")
    .trim();
}

/** 正文里直接提到的文件名（没有 Markdown 链接时用来生成可点击入口）。 */
const BARE_FILE_MENTION = /(?:^|[\s（(、，,:：])([\w\-.\u4e00-\u9fa5]{1,80}\.(?:md|markdown|txt|csv|tsv|json|jsonl|ya?ml|docx?|xlsx?|pptx?|pdf|html?|py|ts|tsx|js|mjs|cjs|rs|java|cs|cpp|hpp|h|sql|log|zip|png|jpe?g|svg))(?=$|[\s）)、，,。:：；;])/gu;

/**
 * 抽出正文里裸文件名（模型经常只写「文件已创建：回归核对.md」而不给链接）。
 * 只返回文件名，不含路径；重复项会被去掉。
 */
export function extractBareFileMentions(text: string): string[] {
  const names = new Set<string>();
  for (const match of String(text ?? "").matchAll(BARE_FILE_MENTION)) {
    const name = match[1]?.trim();
    if (name) names.add(name);
  }
  return [...names];
}

export function splitLocalFileLinks(text: string): LocalFileLinkSplit {
  const links: LocalFileLink[] = [];
  const rewritten = text.split(/(```[\s\S]*?```)/u).map((chunk, index) => {
    // 奇数下标是代码围栏，里面的“链接”不是交付链接。
    if (index % 2 === 1) return chunk;
    return chunk.replace(MARKDOWN_LINK, (raw, label: string, target: string) => {
      if (!isLocalFilePath(target)) return raw;
      links.push({ label: displayFileName(label, target), path: target.trim().replaceAll("\\ ", " ") });
      return "";
    });
  }).join("");
  const cleaned = stripInternalPlaceholders(rewritten)
    .replace(/[ \t]{2,}/gu, " ")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
  return { text: cleaned, links };
}
