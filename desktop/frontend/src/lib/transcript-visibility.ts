const INTERNAL_TRANSCRIPT_BLOCK = /^\s*<?<(response-language|reasoning-language|memory-update|background-jobs|active-goal|capability-route)(?:\s[^>]*)?>[\s\S]*?<\/\1>\s*\n?/i;

export function stripInternalTranscriptBlocks(value: string): string {
  let result = value;
  let previous = "";
  while (result !== previous) {
    previous = result;
    result = result.replace(INTERNAL_TRANSCRIPT_BLOCK, "");
  }
  return result.trimStart();
}
