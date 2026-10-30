export type SessionStopOutcome = "stopped" | "running" | "missing";

type SessionRunningState = { sessionId: string; running: boolean };

export interface SessionStopConfirmationOptions {
  readonly attempts?: number;
  readonly delayMs?: number;
  readonly sleep?: (ms: number) => Promise<void>;
}

/**
 * DSH accepts a cancel before the active turn has fully settled. Read the
 * authoritative session list until the turn is no longer running instead of
 * trusting a single snapshot. This keeps the UI honest when cancel is accepted
 * but the tool/agent is still unwinding.
 */
export async function confirmSessionStopped(
  readSessions: () => Promise<readonly SessionRunningState[]>,
  sessionId: string,
  options: SessionStopConfirmationOptions = {},
): Promise<SessionStopOutcome> {
  const attempts = Math.max(1, options.attempts ?? 10);
  const delayMs = Math.max(0, options.delayMs ?? 300);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const sessions = await readSessions();
    const current = sessions.find((session) => session.sessionId === sessionId);
    if (!current) return "missing";
    if (!current.running) return "stopped";
    if (attempt < attempts - 1 && delayMs > 0) await sleep(delayMs);
  }
  return "running";
}