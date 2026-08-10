const INTERNAL_TRANSCRIPT_TAGS = "response-language|reasoning-language|memory-update|background-jobs|active-goal|capability-route|think|analysis|tool_call|tool_calls";
const INTERNAL_TRANSCRIPT_BLOCK = new RegExp(`<?<(${INTERNAL_TRANSCRIPT_TAGS})(?:\\s[^>]*)?>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
const UNCLOSED_INTERNAL_TRANSCRIPT_BLOCK = new RegExp(`<?<(?:${INTERNAL_TRANSCRIPT_TAGS})(?:\\s[^>]*)?>[\\s\\S]*$`, "i");
const ORPHAN_INTERNAL_TRANSCRIPT_CLOSE = new RegExp(`<\\/(?:${INTERNAL_TRANSCRIPT_TAGS})\\s*>`, "gi");
const INTERNAL_HOST_NOTICE_PREFIX = /^(?:Internal host instruction:|Host calculation check failed:|The numeric answer needs calculator verification;)/i;

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
  return mapOutsideCodeFences(preparedTranscriptText(value), collapseProseRepeats);
}

export function visibleAssistantTranscriptText(value: string): string {
  return mapOutsideCodeFences(preparedTranscriptText(value), (section) => collapseProseRepeats(stripInternalHostNotices(section)));
}

function preparedTranscriptText(value: string): string {
  return stripOpeningPlanningAside(stripInternalTranscriptBlocks(value));
}

function stripInternalHostNotices(value: string): string {
  return value.split("\n").filter((line) => !INTERNAL_HOST_NOTICE_PREFIX.test(line.trimStart())).join("\n");
}

function stripOpeningPlanningAside(value: string): string {
  const match = /^([\s\S]*?)\n{2,}(#{1,6}\s+\S[\s\S]*)$/.exec(value);
  if (!match) return value;
  const aside = match[1].trim();
  if (!aside || aside.length > 240 || /(?:^|\n)\s*(?:[-*#>|]|\d+[.)])/.test(aside)) return value;
  const markers = aside.match(/(?:我需要先|我得先|让我先|让我来|我先(?:分析|整理|检查|思考|核对|确认)|接下来我(?:需要|会)先?)/g) ?? [];
  return markers.length >= 2 ? match[2] : value;
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
