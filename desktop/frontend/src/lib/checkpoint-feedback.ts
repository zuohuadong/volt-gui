export interface CheckpointRestoreCopy {
  initial: string;
  checkpoint: string;
}

export function checkpointRestoreMessage(turn: number, copy: CheckpointRestoreCopy): string {
  if (!Number.isFinite(turn) || turn <= 0) return copy.initial;
  return copy.checkpoint.replace("{turn}", String(Math.trunc(turn)));
}
