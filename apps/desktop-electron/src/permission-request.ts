export function permissionCommandRequest(request: Record<string, unknown>) {
  if (typeof request.sessionId !== "string" || !request.sessionId.trim()
    || typeof request.line !== "string" || !/^\/permission [a-zA-Z0-9][a-zA-Z0-9_-]{0,127}$/.test(request.line)) {
    throw new Error("Invalid permission command");
  }
  return {
    endpoint: "commands/execute",
    args: { agentId: request.sessionId, line: request.line, submittedAttachments: [] },
  };
}
