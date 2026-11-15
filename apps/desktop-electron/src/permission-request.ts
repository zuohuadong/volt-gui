/**
 * 官方 `commands/execute` 的请求构造：一条人类输入的斜杠命令行在 Host 侧执行，
 * 不进入模型消息。`/permission` 只是其中最常用的一个，早期版本在这里只放行它，
 * 导致其它命令（`/plan`、`/compact`、自定义命令）根本无法转发。
 */

// 官方命令名允许下划线，且命令与输入之间也可以是制表符/换行（`parseCommand`）。
const COMMAND_LINE = /^\/[a-z][a-z0-9_-]{0,63}(?:[\t\n\r ][\s\S]*)?$/u;
const MAX_COMMAND_LINE = 4096;

export function commandExecuteRequest(request: Record<string, unknown>) {
  if (typeof request.sessionId !== "string" || !request.sessionId.trim()
    || typeof request.line !== "string" || !COMMAND_LINE.test(request.line)
    || request.line.length > MAX_COMMAND_LINE) {
    throw new Error("Invalid command line");
  }
  return {
    endpoint: "commands/execute",
    args: { agentId: request.sessionId, line: request.line, submittedAttachments: [] },
  };
}

/** 兼容旧名：只用于 `/permission` 的调用点仍然走同一条校验。 */
export function permissionCommandRequest(request: Record<string, unknown>) {
  if (typeof request.line !== "string" || !/^\/permission [a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(request.line)) {
    throw new Error("Invalid permission command");
  }
  return commandExecuteRequest(request);
}