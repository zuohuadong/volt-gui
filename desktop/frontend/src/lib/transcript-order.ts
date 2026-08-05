import type { TranscriptItem } from "./types";

export function insertTurnTranscriptItem(transcriptItems: TranscriptItem[], incomingItem: TranscriptItem): TranscriptItem[] {
  if (incomingItem.role !== "reasoning" && incomingItem.role !== "tool") return [...transcriptItems, incomingItem];

  let pendingAnswerIndex = -1;
  for (let index = transcriptItems.length - 1; index >= 0; index -= 1) {
    if (transcriptItems[index].role === "user") break;
    if (transcriptItems[index].role === "assistant" && transcriptItems[index].pending) {
      pendingAnswerIndex = index;
      break;
    }
  }
  if (pendingAnswerIndex < 0) return [...transcriptItems, incomingItem];

  return [
    ...transcriptItems.slice(0, pendingAnswerIndex),
    incomingItem,
    ...transcriptItems.slice(pendingAnswerIndex),
  ];
}
