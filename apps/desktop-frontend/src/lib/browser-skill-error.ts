/**
 * BrowserSkill 的错误来自 bsk CLI，原文是英文长句，直接展示会撑破提示框。
 * 这里只识别最常见的两类连接问题，其余错误仍交给用户可见的原始信息。
 */
export type BrowserSkillErrorKey = "browserExtensionNotConnected" | "browserSessionStartFailed";

export function browserSkillErrorKey(raw: string): BrowserSkillErrorKey | undefined {
  const normalized = raw.toLowerCase();
  if (!normalized) return undefined;
  if (/no browser is currently connected|browser (?:is )?not connected|no connected browser/u.test(normalized)) {
    return "browserExtensionNotConnected";
  }
  if (/bsk[:\s]/u.test(normalized) && /(?:session|browser)[^.]*(?:start|launch)[^.]*(?:fail|error)/u.test(normalized)) {
    return "browserSessionStartFailed";
  }
  return undefined;
}

/** 统一把 bsk 连接错误压成一句可操作的中文提示，避免原始英文长句溢出界面。 */
export function browserSkillErrorMessage(raw: string, translate: (key: string) => string): string | undefined {
  const key = browserSkillErrorKey(raw);
  return key ? translate(`errors.${key}`) : undefined;
}