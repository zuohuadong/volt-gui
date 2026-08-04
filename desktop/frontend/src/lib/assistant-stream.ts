export type AssistantTextEventKind = "text" | "message";

export function mergeStreamingText(existing: string, incoming: string) {
  if (!incoming) return existing;
  if (!existing) return incoming;
  if (incoming.startsWith(existing)) return incoming;
  if (existing.endsWith(incoming)) return existing;
  const maxOverlap = Math.min(existing.length, incoming.length);
  for (let length = maxOverlap; length > 0; length -= 1) {
    if (existing.endsWith(incoming.slice(0, length))) {
      return existing + incoming.slice(length);
    }
  }
  return existing + incoming;
}

export function reconcileAssistantText(
  existing: string,
  incoming: string,
  kind: AssistantTextEventKind,
) {
  return kind === "message" ? incoming : mergeStreamingText(existing, incoming);
}
