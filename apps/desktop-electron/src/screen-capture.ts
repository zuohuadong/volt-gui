import type { DesktopCapturerSource, Display, SourcesOptions } from "electron";

interface ScreenCaptureOptions {
  displays: Pick<Display, "id" | "size" | "scaleFactor">[];
  chooseDisplay: (labels: string[]) => Promise<number | null>;
  getSources: (options: SourcesOptions) => Promise<DesktopCapturerSource[]>;
  isAvailable: () => boolean;
}

export async function captureScreen(options: ScreenCaptureOptions): Promise<string | null> {
  if (!options.displays.length) throw new Error("没有可用的屏幕");
  const selected = await options.chooseDisplay(options.displays.map((display, index) =>
    `屏幕 ${index + 1} (${display.size.width} × ${display.size.height})`,
  ));
  if (selected === null || !options.isAvailable()) return null;
  const display = options.displays[selected];
  if (!display) throw new Error("选择的屏幕已不可用");
  const sources = await options.getSources({
    types: ["screen"],
    thumbnailSize: {
      width: Math.min(8192, Math.round(display.size.width * display.scaleFactor)),
      height: Math.min(8192, Math.round(display.size.height * display.scaleFactor)),
    },
    fetchWindowIcons: false,
  });
  if (!options.isAvailable()) return null;
  // 多屏时必须按显示器 ID 匹配，不能把其他屏幕内容误当作用户选择的屏幕。
  const source = sources.find((candidate) => candidate.display_id === String(display.id))
    ?? (options.displays.length === 1 && sources.length === 1 && !sources[0].display_id ? sources[0] : undefined);
  if (!source || source.thumbnail.isEmpty()) throw new Error("屏幕捕获失败，请检查系统屏幕录制权限");
  const png = source.thumbnail.toPNG();
  if (!png.length || png.length > 32 * 1024 * 1024) throw new Error("截图为空或超过 32 MB");
  return `data:image/png;base64,${png.toString("base64")}`;
}
