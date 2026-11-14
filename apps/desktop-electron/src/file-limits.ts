const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

// 输入文件允许引用超大文件；内联上传与截图仍保持较小上限。
export const MAX_INPUT_FILE_BYTES = 2 * GIB;
export const MAX_INPUT_TOTAL_BYTES = 2 * GIB;
export const MAX_INLINE_UPLOAD_BYTES = 20 * MIB;
export const MAX_INLINE_TEXT_BYTES = 64 * 1024;
export const MAX_INLINE_IMAGE_BYTES = 20 * MIB;
export const MAX_SCREENSHOT_BYTES = 64 * MIB;
export const MAX_SCREENSHOT_DATA_URL_BYTES = 128 * MIB;
