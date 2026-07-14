import type { ScopedMemoryContext, ScopedMemoryView, TabMeta } from "./types";

interface SubmitThreadMessageWithProjectContextInput {
  tab: TabMeta;
  projectId: string;
  scopedMemoryForTab: (tabID: string) => Promise<ScopedMemoryView>;
  setMemoryContextForTab: (tabID: string, context: ScopedMemoryContext) => Promise<void>;
  listTabs: () => Promise<TabMeta[]>;
  submit: (tab: TabMeta) => Promise<void>;
}

export type SubmissionFailureAction = "restore-draft" | "cancel-submitted" | "fail-submitted";

export function resolveSubmissionFailureAction({
  backendSubmissionStarted,
  cancelled,
}: {
  backendSubmissionStarted: boolean;
  cancelled: boolean;
}): SubmissionFailureAction {
  if (!backendSubmissionStarted) return "restore-draft";
  return cancelled ? "cancel-submitted" : "fail-submitted";
}

function completeProjectContext(view: ScopedMemoryView, projectId: string): ScopedMemoryContext {
  const next = {
    ...view.context,
    projectId: projectId.trim(),
  };
  if (!next.organizationId?.trim() || !next.workspaceId?.trim() || !next.projectId || !next.threadId?.trim()) {
    throw new Error("后端未返回完整的分层记忆上下文，消息尚未提交。");
  }
  return next;
}

export async function submitThreadMessageWithProjectContext({
  tab,
  projectId,
  scopedMemoryForTab,
  setMemoryContextForTab,
  listTabs,
  submit,
}: SubmitThreadMessageWithProjectContextInput): Promise<void> {
  const memory = await scopedMemoryForTab(tab.id);
  const next = completeProjectContext(memory, projectId);
  if (memory.context.projectId?.trim() !== next.projectId) {
    await setMemoryContextForTab(tab.id, next);
  }
  const latestTabs = await listTabs();
  const latest = latestTabs.find((candidate) => candidate.id === tab.id);
  if (!latest) throw new Error(`Thread ${tab.id} 在刷新运行配置后不可用，消息尚未提交。`);
  await submit(latest);
}
