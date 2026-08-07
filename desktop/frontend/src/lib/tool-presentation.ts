import { formatUserError } from "./user-error";

const TASK_STATE_TOOLS = new Set(["todo_write", "complete_step"]);

export function normalizedToolName(toolName: string): string {
  return toolName.toLowerCase().replace(/^functions\./, "").replace(/^tool_/, "").trim();
}

export function toolOperationBadge(name: string, readOnly?: boolean): string {
  if (TASK_STATE_TOOLS.has(normalizedToolName(name))) return "任务状态";
  return readOnly ? "只读" : "";
}

export function toolErrorPresentation(error: string, turnRunning: boolean): { summary: string; detail: string } {
  return {
    summary: turnRunning ? "本次调用失败，模型正在根据错误信息继续修正。" : formatUserError(error),
    detail: error.trim(),
  };
}

export function toolOutputDuplicatesError(output?: string, error?: string): boolean {
  const normalizedOutput = (output ?? "").trim().replace(/^error:\s*/i, "");
  const normalizedError = (error ?? "").trim().replace(/^error:\s*/i, "");
  return Boolean(normalizedOutput && normalizedError && normalizedOutput === normalizedError);
}
