interface FileDropEvent {
  dataTransfer: { types: readonly string[]; files: ArrayLike<File> } | null;
  target: EventTarget | null;
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
}

interface FileDropOptions {
  contains(target: EventTarget | null): boolean;
  enabled(): boolean;
  resolvePath(file: File): string;
  insert(references: string): void;
  unavailable(): void;
}

export function createLocalFileDropHandlers(options: FileDropOptions) {
  function intercept(event: FileDropEvent): boolean {
    if (!event.dataTransfer?.types.includes("Files") || !options.contains(event.target)) return false;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    return true;
  }

  return {
    dragover(event: FileDropEvent): void {
      intercept(event);
    },
    drop(event: FileDropEvent): void {
      if (!intercept(event) || !options.enabled()) return;
      let paths: string[];
      try {
        paths = Array.from(event.dataTransfer!.files, (file) => options.resolvePath(file));
      } catch {
        options.unavailable();
        return;
      }
      if (!paths.length || paths.some((path) => !path)) {
        options.unavailable();
        return;
      }
      const references = paths.map((path) => {
        // 特殊文件名用 JSON 文本保留原值，避免破坏 @ 引用的引号边界。
        if (/["\r\n]/u.test(path)) return JSON.stringify(path);
        return /\s/u.test(path) ? `@"${path}"` : `@${path}`;
      });
      options.insert(references.join(" "));
    },
  };
}
