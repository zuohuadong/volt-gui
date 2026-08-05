const INLINE_TABLE_DIVIDER = /^(\s*\|?.+?\|)\s+(\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*)$/;

export function normalizeMalformedMarkdownTables(markdown: string): string {
  let fence = "";
  return markdown.replace(/\r\n|\r/g, "\n").split("\n").flatMap((line) => {
    const marker = /^\s{0,3}(```|~~~)/.exec(line)?.[1] ?? "";
    if (marker) fence = fence === marker ? "" : fence || marker;
    if (fence || marker) return [line];
    const match = INLINE_TABLE_DIVIDER.exec(line);
    if (!match || tableCellCount(match[1]) !== tableCellCount(match[2])) return [line];
    return [match[1].trimEnd(), match[2].trim()];
  }).join("\n");
}

function tableCellCount(tableLine: string): number {
  return tableLine.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").length;
}
