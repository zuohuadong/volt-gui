import type { TranscriptItem } from "./types";

export interface ScrollAnchorMetrics {
  beforeTop: number;
  beforeHeight: number;
  afterHeight: number;
}

export interface HistoryRequestIdentity {
  activeTabId: string;
  requestTabId: string;
  activeGeneration: number;
  requestGeneration: number;
  activeBeforeTurn?: number;
  requestBeforeTurn?: number;
}

export interface TranscriptTrimResult {
  items: TranscriptItem[];
  removedTurns: number;
}

export function prependTranscriptPage(current: TranscriptItem[], older: TranscriptItem[]) {
  const currentIDs = new Set(current.map((item) => item.id));
  return [...older.filter((item) => !currentIDs.has(item.id)), ...current];
}

export function anchoredScrollTop({ beforeTop, beforeHeight, afterHeight }: ScrollAnchorMetrics) {
  return Math.max(0, beforeTop + Math.max(0, afterHeight - beforeHeight));
}

export function isCurrentHistoryRequest({
  activeTabId,
  requestTabId,
  activeGeneration,
  requestGeneration,
  activeBeforeTurn,
  requestBeforeTurn,
}: HistoryRequestIdentity) {
  const cursorMatches = requestBeforeTurn === undefined || activeBeforeTurn === requestBeforeTurn;
  return Boolean(requestTabId) && activeTabId === requestTabId && activeGeneration === requestGeneration && cursorMatches;
}

export function trimLiveTranscript(items: TranscriptItem[], limit: number): TranscriptTrimResult {
  if (limit <= 0) return { items: [], removedTurns: items.filter((item) => item.role === "user").length };

  const next = [...items];
  let removedTurns = 0;
  while (next.length > limit) {
    const transientIndex = next.findIndex((item) => item.role === "tool" || item.role === "reasoning");
    if (transientIndex >= 0) {
      next.splice(transientIndex, 1);
      continue;
    }

    const firstUserIndex = next.findIndex((item) => item.role === "user");
    if (firstUserIndex > 0) {
      next.splice(0, firstUserIndex);
      continue;
    }
    if (firstUserIndex === 0) {
      const nextUserOffset = next.slice(1).findIndex((item) => item.role === "user");
      if (nextUserOffset >= 0) {
        next.splice(0, nextUserOffset + 1);
        removedTurns += 1;
        continue;
      }
    }

    const [removed] = next.splice(0, 1);
    if (removed?.role === "user") removedTurns += 1;
  }

  return { items: next, removedTurns };
}
