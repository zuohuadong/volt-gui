import type { AgentView, TabMeta } from "./types";

export type ThreadAgentProfile = Pick<AgentView, "id" | "name" | "provider" | "model">;

export type ThreadAgentBindingPatch = Pick<
  TabMeta,
  "agentProfileId" | "agentProfileName" | "agentProfileBaseModel"
>;

interface SubmitThreadMessageWithAgentProfileInput {
  tab: Pick<TabMeta, "id" | "agentProfileId" | "agentProfileName" | "agentProfileBaseModel">;
  profile?: ThreadAgentProfile;
  display: string;
  submission: string;
  setAgentProfileForTab: (tabID: string, profileID: string) => Promise<void>;
  submitDisplayToTab: (tabID: string, display: string, input: string) => Promise<void>;
  onBound?: (patch: ThreadAgentBindingPatch) => void;
}

function normalizedID(value?: string): string {
  return value?.trim() ?? "";
}

export function resolveThreadAgentProfile(
  profiles: AgentView[],
  selectedProfileID?: string,
): AgentView | undefined {
  const selectedID = normalizedID(selectedProfileID);
  return profiles.find((profile) => profile.id === selectedID) ?? profiles[0];
}

export function threadAgentCapabilityLabel(
  profile: Pick<AgentView, "tools" | "skills">,
): string {
  const tools = profile.tools.length > 0
    ? `${profile.tools.length} 个受限工具 + 核心能力`
    : "工具继承全部";
  const skills = profile.skills.length > 0
    ? `${profile.skills.length} 个允许 Skill`
    : "Skill 继承全部";
  return `${tools} / ${skills}`;
}

export function withDeadline<T>(promise: Promise<T>, message: string, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * 确保 Thread 的 Agent Profile 已由桌面后端确认后，再提交本轮消息。
 * Profile 绑定失败时会直接抛错，避免界面展示已选 Agent、实际却仍用旧运行配置。
 */
export async function submitThreadMessageWithAgentProfile({
  tab,
  profile,
  display,
  submission,
  setAgentProfileForTab,
  submitDisplayToTab,
  onBound,
}: SubmitThreadMessageWithAgentProfileInput): Promise<void> {
  const currentProfileID = normalizedID(tab.agentProfileId);
  const selectedProfileID = normalizedID(profile?.id);

  const profileChanged = currentProfileID !== selectedProfileID;
  const needsBackendConfirmation = profileChanged || selectedProfileID !== "";

  if (needsBackendConfirmation) {
    await setAgentProfileForTab(tab.id, selectedProfileID);
  }

  if (profileChanged) {
    onBound?.({
      agentProfileId: selectedProfileID || undefined,
      agentProfileName: selectedProfileID ? profile?.name.trim() || undefined : undefined,
      agentProfileBaseModel: selectedProfileID ? tab.agentProfileBaseModel : undefined,
    });
  }

  await submitDisplayToTab(tab.id, display, submission);
}
