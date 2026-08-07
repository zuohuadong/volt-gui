interface TurnProgress {
  phase: string;
  hint: string;
}

export function turnProgress(role: string, hasBody: boolean, elapsedMs: number): TurnProgress {
  return {
    phase: progressPhase(role, hasBody, elapsedMs),
    hint: progressHint(elapsedMs),
  };
}

function progressPhase(role: string, hasBody: boolean, elapsedMs: number): string {
  if (role === "tool") return "正在执行工具";
  if (role === "reasoning") return "正在分析任务";
  if (role === "assistant" && hasBody && elapsedMs >= 240_000) return "正在自检收尾";
  return "正在生成回复";
}

function progressHint(elapsedMs: number): string {
  if (elapsedMs >= 300_000) return "接近 6 分钟保护上限，将自动停止并保留已完成结果";
  if (elapsedMs >= 120_000) return "当前阶段耗时较长，可随时停止；已完成结果会保留";
  return "结果会自动显示";
}
