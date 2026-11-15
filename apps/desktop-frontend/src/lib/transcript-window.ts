import type { TranscriptGroup } from "./transcript-groups";

export const DEFAULT_TRANSCRIPT_GROUP_WINDOW = 80;

export type TranscriptWindow = {
  readonly visibleGroups: TranscriptGroup[];
  readonly hiddenGroupCount: number;
  readonly totalGroupCount: number;
};

/**
 * 长会话只渲染尾部若干 group，避免全量 DOM；隐藏前缀仍可通过扩大 window 展开。
 */
export function windowTranscriptGroups(
  groups: readonly TranscriptGroup[],
  limit = DEFAULT_TRANSCRIPT_GROUP_WINDOW,
): TranscriptWindow {
  const totalGroupCount = groups.length;
  const safeLimit = Math.max(1, Math.floor(limit));
  if (totalGroupCount <= safeLimit) {
    return {
      visibleGroups: groups as TranscriptGroup[],
      hiddenGroupCount: 0,
      totalGroupCount,
    };
  }
  const hiddenGroupCount = totalGroupCount - safeLimit;
  return {
    visibleGroups: groups.slice(hiddenGroupCount) as TranscriptGroup[],
    hiddenGroupCount,
    totalGroupCount,
  };
}
