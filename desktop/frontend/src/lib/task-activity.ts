export const recoveryActions = [
  "retry",
  "restore-draft",
  "rewind",
  "open-diff",
  "open-agent",
  "open-models",
] as const;

export type RecoveryAction = (typeof recoveryActions)[number];

export interface TaskFailurePresentation {
  title: string;
  detail: string;
  primaryAction: RecoveryAction;
  primaryLabel: string;
}

export function describeTaskFailure(error: string): TaskFailurePresentation {
  const detail = error.trim();

  const unknownProfileModel = detail.match(/agent profile "([^"]+)" uses unknown model "([^"]+)"/i);
  if (unknownProfileModel) {
    return {
      title: "Agent 模型不可用",
      detail: `${unknownProfileModel[1]} 绑定的 ${unknownProfileModel[2]} 不在当前模型渠道中。`,
      primaryAction: "open-agent",
      primaryLabel: "修复 Agent",
    };
  }

  const unavailableProvider = detail.match(/agent profile "([^"]+)" model is unavailable because provider "([^"]+)" is not added/i);
  if (unavailableProvider) {
    return {
      title: "Agent 渠道未添加",
      detail: `${unavailableProvider[1]} 依赖的 ${unavailableProvider[2]} 渠道当前不可用。`,
      primaryAction: "open-models",
      primaryLabel: "添加渠道",
    };
  }

  const unavailableBaseModel = detail.match(/agent profile base model "([^"]+)" is unavailable/i);
  if (unavailableBaseModel) {
    return {
      title: "基础模型不可用",
      detail: `${unavailableBaseModel[1]} 已从当前模型配置中移除或停用。`,
      primaryAction: "open-models",
      primaryLabel: "选择模型",
    };
  }

  return {
    title: "本轮执行失败",
    detail: detail || "上一轮未完成，可重试或选择其他恢复方式。",
    primaryAction: "retry",
    primaryLabel: "重试",
  };
}
