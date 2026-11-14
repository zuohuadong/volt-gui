const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

// 与 Electron 端保持一致：大文件走官方 DSH 文件引用，不把内容塞进正文。
export const MAX_INPUT_FILE_BYTES = 2 * GIB;
export const MAX_INPUT_TOTAL_BYTES = 2 * GIB;
export const MAX_INLINE_UPLOAD_BYTES = 20 * MIB;
export const MAX_INLINE_TEXT_BYTES = 64 * 1024;
export const MAX_INLINE_IMAGE_BYTES = 20 * MIB;

export function isInlineUploadSizeAllowed(bytes: number): boolean {
  return Number.isSafeInteger(bytes) && bytes >= 0 && bytes <= MAX_INLINE_UPLOAD_BYTES;
}
