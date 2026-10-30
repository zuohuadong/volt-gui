import type { ScreenshotSelection } from "../electron";

export interface ClientRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface ImageBox {
  /** 图片在窗口里的可视区域（CSS 像素）。 */
  rect: ClientRect;
  /** 图片自身的像素尺寸。 */
  natural: { width: number; height: number };
}

/** 拖拽出来的矩形可能反向或越界，先收敛成窗口内的正向矩形。 */
export function normalizeDragRect(start: { x: number; y: number }, end: { x: number; y: number }, bounds: ClientRect): ClientRect {
  const clampX = (value: number) => Math.min(Math.max(value, bounds.left), bounds.right);
  const clampY = (value: number) => Math.min(Math.max(value, bounds.top), bounds.bottom);
  const left = clampX(Math.min(start.x, end.x));
  const right = clampX(Math.max(start.x, end.x));
  const top = clampY(Math.min(start.y, end.y));
  const bottom = clampY(Math.max(start.y, end.y));
  return { left, top, right, bottom };
}

/**
 * 把窗口 CSS 坐标换算成截图图片的像素坐标。
 * 图片在窗口里通常是等比缩放显示的，所以必须按 naturalWidth / 显示宽度换算，
 * 否则高 DPI 屏幕或缩放显示时会裁到错误的位置。
 */
export function toImageSelection(rect: ClientRect, image: ImageBox): ScreenshotSelection {
  const displayWidth = image.rect.right - image.rect.left;
  const displayHeight = image.rect.bottom - image.rect.top;
  if (displayWidth <= 0 || displayHeight <= 0) throw new Error("截图尚未完成布局");
  const scaleX = image.natural.width / displayWidth;
  const scaleY = image.natural.height / displayHeight;
  const left = Math.min(Math.max(rect.left, image.rect.left), image.rect.right);
  const right = Math.min(Math.max(rect.right, image.rect.left), image.rect.right);
  const top = Math.min(Math.max(rect.top, image.rect.top), image.rect.bottom);
  const bottom = Math.min(Math.max(rect.bottom, image.rect.top), image.rect.bottom);
  return {
    x: Math.round((left - image.rect.left) * scaleX),
    y: Math.round((top - image.rect.top) * scaleY),
    width: Math.round((right - left) * scaleX),
    height: Math.round((bottom - top) * scaleY),
  };
}

/** 依然按 CSS 像素判断，避免高 DPI 下把 3 CSS 像素的误触当成有效框选。 */
export function isSelectable(rect: ClientRect, minimum = 8): boolean {
  return rect.right - rect.left >= minimum && rect.bottom - rect.top >= minimum;
}