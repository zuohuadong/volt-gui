const INTERNAL_TRANSCRIPT_TAGS = "response-language|reasoning-language|memory-update|background-jobs|active-goal|capability-route|think|analysis|tool_call|tool_calls";
const INTERNAL_TRANSCRIPT_BLOCK = new RegExp(`<?<(${INTERNAL_TRANSCRIPT_TAGS})(?:\\s[^>]*)?>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
const UNCLOSED_INTERNAL_TRANSCRIPT_BLOCK = new RegExp(`<?<(?:${INTERNAL_TRANSCRIPT_TAGS})(?:\\s[^>]*)?>[\\s\\S]*$`, "i");
const ORPHAN_INTERNAL_TRANSCRIPT_CLOSE = new RegExp(`<\\/(?:${INTERNAL_TRANSCRIPT_TAGS})\\s*>`, "gi");

export function stripInternalTranscriptBlocks(value: string): string {
  return mapOutsideCodeFences(value, (section) => {
    let visible = section.replace(INTERNAL_TRANSCRIPT_BLOCK, "");
    // Provider output can be truncated mid-block. Fail closed instead of
    // rendering partial reasoning or tool arguments as a user-visible answer.
    visible = visible.replace(UNCLOSED_INTERNAL_TRANSCRIPT_BLOCK, "");
    visible = visible.replace(ORPHAN_INTERNAL_TRANSCRIPT_CLOSE, "");
    return visible;
  }).trimStart();
}

export function visibleTranscriptText(value: string): string {
  return mapOutsideCodeFences(stripInternalTranscriptBlocks(value), collapseProseRepeats);
}

function mapOutsideCodeFences(value: string, transform: (section: string) => string): string {
  const sections = value.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
  return sections.map((section, index) => index % 2 === 1 ? section : transform(section)).join("");
}

function collapseProseRepeats(value: string): string {
  const blocks = value.split(/\n{2,}/);
  const visible: string[] = [];
  let previousProse = "";
  for (const block of blocks) {
    if (!isPlainProseBlock(block)) {
      visible.push(block);
      previousProse = "";
      continue;
    }
    const collapsed = collapseRepeatedSentences(block);
    const normalized = collapsed.trim().replace(/\s+/g, " ");
    if (normalized.length >= 24 && normalized === previousProse) continue;
    visible.push(collapsed);
    previousProse = normalized;
  }
  return visible.join("\n\n");
}

function isPlainProseBlock(value: string): boolean {
  return !value.split("\n").some((line) => /^(?:\s{4}|\s*(?:[-*+]\s|\d+[.)]\s|>|#{1,6}\s|\|))/.test(line));
}

function collapseRepeatedSentences(value: string): string {
  return value
    .replace(/([^ \t\r\n。！？][^。！？\n]{15,}[。！？])(?:[ \t\r\n]*\1)+/gu, "$1")
    .replace(/([^ \t\r\n。！？][^。！？\n]{5,}[。！？])(?:[ \t\r\n]*\1){2,}/gu, "$1");
}
