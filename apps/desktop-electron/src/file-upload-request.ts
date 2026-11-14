import { MAX_INPUT_FILE_BYTES } from "./file-limits.ts";

const MAX_FILE_BYTES = MAX_INPUT_FILE_BYTES;
export const MAX_UPLOAD_BASE64_LENGTH = Math.ceil(MAX_FILE_BYTES / 3) * 4;

export function isUploadBase64LengthAllowed(dataLength: number): boolean {
  return Number.isSafeInteger(dataLength) && dataLength >= 0 && dataLength <= MAX_UPLOAD_BASE64_LENGTH;
}

export function fileUploadRequest(payload: Record<string, unknown>): {
  endpoint: string;
  args: { agentId: string; request: { data: string; name?: string } };
} {
  const request = payload.request as Record<string, unknown> | undefined;
  if (typeof payload.agentId !== "string" || !payload.agentId.trim()
    || !request || typeof request.data !== "string"
    || !isUploadBase64LengthAllowed(request.data.length)
    || (request.name !== undefined && (typeof request.name !== "string" || request.name.length > 1024))) {
    throw new Error("文件上传参数无效或文件超过 2 GiB");
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
