import type {
  ReviewPatchAction,
  ReviewPatchRequest,
  ReviewPatchResult,
  ReviewSource,
  ReviewWorkflowRequest,
  ReviewWorkflowResult,
  WorkspaceChangeView,
  WorkspaceDiffView,
} from "./types";

export function reviewFileBelongsToSource(file: WorkspaceChangeView, source: ReviewSource): boolean {
  if (source === "staged") return Boolean(file.indexStatus && file.indexStatus !== "?");
  return Boolean(file.worktreeStatus && file.worktreeStatus !== "?") || file.indexStatus === "?" || file.worktreeStatus === "?";
}

export function reviewRevisionForAction(diff: WorkspaceDiffView, source: ReviewSource): string {
  return source === "staged" ? diff.stagedRevision ?? "" : diff.unstagedRevision ?? "";
}

export function reviewActionsForSource(source: ReviewSource, untracked = false): ReviewPatchAction[] {
  if (source === "staged") return ["unstage", "revert"];
  return untracked ? ["stage"] : ["stage", "revert"];
}

export function reviewActionLabel(action: ReviewPatchAction): string {
  if (action === "stage") return "Stage";
  if (action === "unstage") return "Unstage";
  return "Revert";
}

export function reviewPatchConflicts(pending: ReviewPatchRequest | undefined, path: string): boolean {
  return Boolean(pending && pending.path === path);
}

export function matchesReviewPatchAck(pending: ReviewPatchRequest | undefined, ack: ReviewPatchResult): boolean {
  return Boolean(
    pending
    && pending.path === ack.path
    && pending.action === ack.action
    && pending.source === ack.source
    && pending.ticket === ack.ticket
    && pending.sourceGeneration === ack.sourceGeneration
    && pending.sourceRevision === ack.sourceRevision,
  );
}

export function matchesReviewWorkflowAck(pending: ReviewWorkflowRequest | undefined, ack: ReviewWorkflowResult): boolean {
  return Boolean(
    pending
    && pending.action === ack.action
    && pending.ticket === ack.ticket
    && pending.sourceGeneration === ack.sourceGeneration
    && pending.expectedGeneration === ack.expectedGeneration,
  );
}
