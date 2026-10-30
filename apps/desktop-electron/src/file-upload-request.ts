const MAX_FILE_BYTES = 32 * 1024 * 1024;

export function fileUploadRequest(payload: Record<string, unknown>): {
  endpoint: string;
  args: { agentId: string; request: { data: string; name?: string } };
} {
  const request = payload.request as Record<string, unknown> | undefined;
  if (typeof payload.agentId !== "string" || !payload.agentId.trim()
    || !request || typeof request.data !== "string"
    || request.data.length > Math.ceil(MAX_FILE_BYTES / 3) * 4
    || (request.name !== undefined && (typeof request.name !== "string" || request.name.length > 1024))) {
    throw new Error("文件上传参数无效或文件超过 32 MB");
  }
  const bytes = Buffer.from(request.data, "base64");
  if (bytes.length > MAX_FILE_BYTES || bytes.toString("base64") !== request.data) {
    throw new Error("文件上传数据无效");
  }
  return {
    endpoint: "fileUploads/upload",
    args: {
      agentId: payload.agentId,
      request: { data: request.data, ...(typeof request.name === "string" ? { name: request.name } : {}) },
    },
  };
}
