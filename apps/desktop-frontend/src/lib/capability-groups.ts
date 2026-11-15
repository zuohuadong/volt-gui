// 扩展能力的管理清单必须和「设置 / 高级配置」用同一份数据源（#352 / #360）：
// 之前在管理工作台里渲染的是 DSH 已加载插件列表，插件名匹配不上分组就落到运行时组，
// 一旦清单读取失败还会静默变成空数组，于是四组同时显示「此类暂无扩展」。
// 这里把桌面能力开关按用途分组，供管理页与侧边导航徽标共用。

export type CapabilityKey =
  | "documentImport"
  | "report"
  | "sentry"
  | "github"
  | "cnb"
  | "feishu"
  | "altium"
  | "pcb"
  | "computerUse";

export type CapabilityGroupId = "documents" | "knowledge" | "desktop" | "runtime";

export type CapabilityEntry = {
  /** 能力开关键；`browserSkill` 是内置能力，没有开关。 */
  key: CapabilityKey | "browserSkill";
  group: CapabilityGroupId;
  titleKey: string;
  descKey: string;
  enabled: boolean;
  /** 内置能力没有开关，只能查看版本。 */
  builtin: boolean;
  highRisk: boolean;
  /** 切换后需要重启运行时才生效。 */
  restartRequired: boolean;
};

export type CapabilityGroup = {
  id: CapabilityGroupId;
  entries: CapabilityEntry[];
  enabledCount: number;
  highRiskCount: number;
};

const CAPABILITY_LAYOUT: ReadonlyArray<{
  key: CapabilityKey;
  group: CapabilityGroupId;
  highRisk?: boolean;
  restartRequired?: boolean;
}> = [
  { key: "documentImport", group: "documents", restartRequired: true },
  { key: "report", group: "documents" },
  { key: "feishu", group: "knowledge", restartRequired: true },
  { key: "sentry", group: "knowledge", restartRequired: true },
  { key: "computerUse", group: "desktop", highRisk: true, restartRequired: true },
  // 会读写本机工程或调用本机引擎，属于会改变本机控制面的能力。
  { key: "altium", group: "runtime", highRisk: true },
  { key: "pcb", group: "runtime" },
  { key: "github", group: "runtime", restartRequired: true },
  { key: "cnb", group: "runtime", restartRequired: true },
];

const GROUP_ORDER: readonly CapabilityGroupId[] = ["documents", "knowledge", "desktop", "runtime"];

export function capabilityTitleKey(key: CapabilityEntry["key"]): string {
  return key === "browserSkill" ? "extensions.capability.browserSkill.title" : `settings.capability.${key}.title`;
}

export function capabilityDescKey(key: CapabilityEntry["key"]): string {
  return key === "browserSkill" ? "extensions.capability.browserSkill.desc" : `settings.capability.${key}.desc`;
}

/** 按用途分组，并带上开关状态；`capabilities` 缺失的键按关闭处理。 */
export function describeCapabilityGroups(input: {
  capabilities: Partial<Record<CapabilityKey, boolean>>;
  browserSkillVersion?: string;
}): CapabilityGroup[] {
  const groups: CapabilityGroup[] = GROUP_ORDER.map((id) => ({ id, entries: [], enabledCount: 0, highRiskCount: 0 }));
  const byId = new Map(groups.map((group) => [group.id, group]));
  for (const layout of CAPABILITY_LAYOUT) {
    const group = byId.get(layout.group);
    if (!group) continue;
    const enabled = input.capabilities[layout.key] === true;
    group.entries.push({
      key: layout.key,
      group: layout.group,
      titleKey: capabilityTitleKey(layout.key),
      descKey: capabilityDescKey(layout.key),
      enabled,
      builtin: false,
      highRisk: layout.highRisk === true,
      restartRequired: layout.restartRequired === true,
    });
    if (enabled) group.enabledCount += 1;
    if (layout.highRisk) group.highRiskCount += 1;
  }
  const desktop = byId.get("desktop");
  if (desktop && input.browserSkillVersion) {
    // 浏览器扩展随包内置，没有独立开关；列出它才能解释「桌面这一组用的是什么」。
    desktop.entries.push({
      key: "browserSkill",
      group: "desktop",
      titleKey: capabilityTitleKey("browserSkill"),
      descKey: capabilityDescKey("browserSkill"),
      enabled: true,
      builtin: true,
      highRisk: true,
      restartRequired: false,
    });
    desktop.enabledCount += 1;
    desktop.highRiskCount += 1;
  }
  for (const group of groups) {
    group.entries.sort((left, right) => left.titleKey.localeCompare(right.titleKey));
  }
  return groups;
}

/** 侧边导航徽标与设置页摘要共用：已开启的能力数量（不含内置能力）。 */
export function enabledCapabilityCount(capabilities: Partial<Record<CapabilityKey, boolean>>): number {
  return CAPABILITY_LAYOUT.filter((layout) => capabilities[layout.key] === true).length;
}