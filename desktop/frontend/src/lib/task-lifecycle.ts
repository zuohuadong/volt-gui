export const queuedMessageDeliveries = ["follow-up", "steer"] as const;
export type QueuedMessageDelivery = (typeof queuedMessageDeliveries)[number];

export const queuedMessageStatuses = ["queued", "sending", "paused", "failed"] as const;
export type QueuedMessageStatus = (typeof queuedMessageStatuses)[number];

export interface QueuedThreadMessage {
  id: string;
  tabId: string;
  display: string;
  submission: string;
  delivery: QueuedMessageDelivery;
  status: QueuedMessageStatus;
  createdAtMs: number;
  error?: string;
}

export interface QueuedThreadMessageInput {
  id: string;
  tabId: string;
  display: string;
  submission: string;
  delivery: QueuedMessageDelivery;
  createdAtMs: number;
}

export function rekeyComposerDraft({
  drafts,
  from,
  to,
  owner,
  input,
}: {
  drafts: Readonly<Record<string, string>>;
  from: string;
  to: string;
  owner: string;
  input: string;
}): { drafts: Record<string, string>; owner: string; input: string } {
  if (!from || !to || from === to) return { drafts: { ...drafts }, owner, input };
  const sourceOwned = owner === from;
  const sourceValue = sourceOwned ? input : drafts[from];
  const targetExists = Object.prototype.hasOwnProperty.call(drafts, to);
  const targetValue = drafts[to];
  const { [from]: _source, ...remaining } = drafts;
  const nextDrafts = { ...remaining };
  if (!targetExists && sourceValue) nextDrafts[to] = sourceValue;
  if (!sourceOwned) return { drafts: nextDrafts, owner, input };
  return {
    drafts: nextDrafts,
    owner: to,
    input: targetExists ? targetValue : sourceValue ?? "",
  };
}

export function enqueueQueuedMessage(
  queue: readonly QueuedThreadMessage[],
  input: QueuedThreadMessageInput,
): QueuedThreadMessage[] {
  const display = input.display.trim();
  const submission = input.submission.trim();
  if (!input.id.trim() || !input.tabId.trim() || !display || !submission) return [...queue];
  return [
    ...queue,
    {
      id: input.id,
      tabId: input.tabId,
      display,
      submission,
      delivery: input.delivery,
      status: "queued",
      createdAtMs: input.createdAtMs,
    },
  ];
}

export function updateQueuedMessage(
  queue: readonly QueuedThreadMessage[],
  id: string,
  patch: Pick<Partial<QueuedThreadMessage>, "display" | "submission" | "delivery" | "status" | "error">,
): QueuedThreadMessage[] {
  return queue.map((message) => {
    if (message.id !== id) return message;
    const display = patch.display === undefined ? message.display : patch.display.trim();
    const submission = patch.submission === undefined ? message.submission : patch.submission.trim();
    if (!display || !submission) return message;
    return {
      ...message,
      ...patch,
      display,
      submission,
      error: patch.error === undefined ? message.error : patch.error.trim() || undefined,
    };
  });
}

export function removeQueuedMessage(queue: readonly QueuedThreadMessage[], id: string): QueuedThreadMessage[] {
  return queue.filter((message) => message.id !== id);
}

export function moveQueuedMessage(
  queue: readonly QueuedThreadMessage[],
  id: string,
  offset: -1 | 1,
): QueuedThreadMessage[] {
  const sourceIndex = queue.findIndex((message) => message.id === id);
  if (sourceIndex < 0) return [...queue];
  const tabId = queue[sourceIndex].tabId;
  const sameThreadIndexes = queue
    .map((message, index) => ({ message, index }))
    .filter((entry) => entry.message.tabId === tabId)
    .map((entry) => entry.index);
  const position = sameThreadIndexes.indexOf(sourceIndex);
  const targetPosition = position + offset;
  if (position < 0 || targetPosition < 0 || targetPosition >= sameThreadIndexes.length) return [...queue];
  const targetIndex = sameThreadIndexes[targetPosition];
  const next = [...queue];
  [next[sourceIndex], next[targetIndex]] = [next[targetIndex], next[sourceIndex]];
  return next;
}

export function takeNextFollowUp(
  queue: readonly QueuedThreadMessage[],
  tabId: string,
): { message?: QueuedThreadMessage; queue: QueuedThreadMessage[] } {
  const message = queue.find(
    (candidate) => candidate.tabId === tabId && candidate.delivery === "follow-up" && candidate.status === "queued",
  );
  if (!message) return { queue: [...queue] };
  return {
    message: { ...message, status: "sending", error: undefined },
    queue: queue.map((candidate) =>
      candidate.id === message.id ? { ...candidate, status: "sending", error: undefined } : candidate,
    ),
  };
}

export function acknowledgeSteeredMessage(
  queue: readonly QueuedThreadMessage[],
  tabId: string,
): QueuedThreadMessage[] {
  const delivered = queue.find(
    (message) => message.tabId === tabId && message.delivery === "steer" && message.status === "sending",
  );
  return delivered ? removeQueuedMessage(queue, delivered.id) : [...queue];
}

export function settleQueuedTurn(
  queue: readonly QueuedThreadMessage[],
  tabId: string,
  error?: string,
): { queue: QueuedThreadMessage[]; deliverNext: boolean } {
  const reason = error?.trim();
  if (!reason) {
    const unacknowledgedSteer = queue.some(
      (message) => message.tabId === tabId && message.delivery === "steer" && message.status === "sending",
    );
    if (unacknowledgedSteer) {
      return {
        queue: queue.map((message) =>
          message.tabId === tabId && (message.status === "queued" || message.status === "sending")
            ? { ...message, status: "paused", error: "当前 Turn 已结束，但未收到指导已应用的确认" }
            : message,
        ),
        deliverNext: false,
      };
    }
    return {
      queue: [...queue],
      deliverNext: queue.some(
        (message) => message.tabId === tabId && message.delivery === "follow-up" && message.status === "queued",
      ),
    };
  }
  return {
    queue: queue.map((message) =>
      message.tabId === tabId && (message.status === "queued" || message.status === "sending")
        ? { ...message, status: "paused", error: reason }
        : message,
    ),
    deliverNext: false,
  };
}

export function resolveQueuedDeliveryFailure({
  backendSubmissionAttempted,
  alreadyRunning,
}: {
  backendSubmissionAttempted: boolean;
  alreadyRunning: boolean;
}): {
  backendSubmissionMayHaveStarted: boolean;
  status: "queued" | "failed";
  recordFailure: boolean;
} {
  const backendSubmissionMayHaveStarted = backendSubmissionAttempted && !alreadyRunning;
  return {
    backendSubmissionMayHaveStarted,
    status: alreadyRunning ? "queued" : "failed",
    recordFailure: backendSubmissionMayHaveStarted,
  };
}

export function pauseQueuedMessagesForReload(queue: readonly QueuedThreadMessage[]): QueuedThreadMessage[] {
  return queue.map((message) => {
    if (message.status === "failed" || message.status === "paused") return message;
    return {
      ...message,
      status: "paused",
      error: message.status === "sending" ? "应用已重新载入，请确认后继续发送" : message.error,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isQueuedMessageDelivery(value: unknown): value is QueuedMessageDelivery {
  return typeof value === "string" && queuedMessageDeliveries.includes(value as QueuedMessageDelivery);
}

function isQueuedMessageStatus(value: unknown): value is QueuedMessageStatus {
  return typeof value === "string" && queuedMessageStatuses.includes(value as QueuedMessageStatus);
}

function parseQueuedMessage(value: unknown): QueuedThreadMessage | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === "string" ? value.id.trim() : "";
  const tabId = typeof value.tabId === "string" ? value.tabId.trim() : "";
  const display = typeof value.display === "string" ? value.display.trim() : "";
  const submission = typeof value.submission === "string" ? value.submission.trim() : "";
  if (!id || !tabId || !display || !submission || !isQueuedMessageDelivery(value.delivery) || !isQueuedMessageStatus(value.status)) {
    return undefined;
  }
  return {
    id,
    tabId,
    display,
    submission,
    delivery: value.delivery,
    status: value.status,
    createdAtMs: typeof value.createdAtMs === "number" && Number.isFinite(value.createdAtMs) ? value.createdAtMs : 0,
    error: typeof value.error === "string" && value.error.trim() ? value.error.trim() : undefined,
  };
}

export function parsePersistedQueuedMessages(raw: string | null | undefined): QueuedThreadMessage[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return pauseQueuedMessagesForReload(value.map(parseQueuedMessage).filter((message): message is QueuedThreadMessage => Boolean(message)));
  } catch {
    return [];
  }
}
