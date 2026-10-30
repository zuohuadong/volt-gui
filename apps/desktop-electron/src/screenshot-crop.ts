export interface CropSelection {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageSize {
  width: number;
  height: number;
}

export interface CropImage<T> {
  getSize(): ImageSize;
  crop(rectangle: CropSelection): T;
}

/** 小于这个边长的框选多半是误触，直接拒绝而不是产出一张没有信息量的图。 */
export const MIN_CROP_EDGE = 8;
const MAX_PNG_BYTES = 32 * 1024 * 1024;

function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/**
 * 把前台的框选收敛成图片像素内的整数矩形。
 * 前台给的是图片坐标（已按缩放比换算），这里只做取整、裁界和最小边长校验。
 */
export function normalizeCropSelection(selection: unknown, image: ImageSize): CropSelection {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    throw new Error("框选区域无效，请重新拖选");
  }
  const record = selection as Record<string, unknown>;
  const x = finite(record.x);
  const y = finite(record.y);
  const width = finite(record.width);
  const height = finite(record.height);
  if (x === undefined || y === undefined || width === undefined || height === undefined) {
    throw new Error("框选区域无效，请重新拖选");
  }
  if (width <= 0 || height <= 0) throw new Error("框选区域无效，请重新拖选");
  if (!Number.isFinite(image.width) || !Number.isFinite(image.height) || image.width <= 0 || image.height <= 0) {
    throw new Error("截图数据无效，请重新截图");
  }
  const left = Math.max(0, Math.min(Math.round(x), image.width - 1));
  const top = Math.max(0, Math.min(Math.round(y), image.height - 1));
  const right = Math.max(left + 1, Math.min(Math.round(x + width), image.width));
  const bottom = Math.max(top + 1, Math.min(Math.round(y + height), image.height));
  const normalized = { x: left, y: top, width: right - left, height: bottom - top };
  // 完全落在图片外的框选会被上面收紧成一像素，按无效处理。
  if (normalized.width <= 1 || normalized.height <= 1) throw new Error("框选区域超出截图范围，请重新拖选");
  if (normalized.width < MIN_CROP_EDGE || normalized.height < MIN_CROP_EDGE) {
    throw new Error(`框选区域太小，请至少选择 ${MIN_CROP_EDGE} × ${MIN_CROP_EDGE} 像素`);
  }
  return normalized;
}

/** 裁切并回到前台需要的 data URL；沿用整屏截图的大小上限，避免把巨型图片塞进会话。 */
export function cropCapture<T extends { toPNG(): Buffer }>(image: CropImage<T>, selection: unknown): string {
  const rectangle = normalizeCropSelection(selection, image.getSize());
  const png = image.crop(rectangle).toPNG();
  if (!png.length) throw new Error("截图区域为空，请重新框选");
  if (png.length > MAX_PNG_BYTES) throw new Error("截图区域过大，请缩小框选范围");
  return `data:image/png;base64,${png.toString("base64")}`;
}