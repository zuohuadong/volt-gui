import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createLocalFileDropHandlers } from "./local-file-drop";

function fixture() {
  const file = new File([], "large.bin");
  Object.defineProperty(file, "size", { value: 500 * 1024 * 1024 });
  const read = vi.spyOn(file, "arrayBuffer").mockRejectedValue(new Error("must not read"));
  const options = {
    contains: vi.fn(() => true),
    enabled: vi.fn(() => true),
    resolvePath: vi.fn((_file: File) => "D:\\资料\\large.bin"),
    insert: vi.fn(),
    unavailable: vi.fn(),
  };
  const event = {
    target: new EventTarget(),
    dataTransfer: { types: ["Files"], files: [file] },
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    stopImmediatePropagation: vi.fn(),
  };
  return { options, event, file, read, handlers: createLocalFileDropHandlers(options) };
}

describe("local file drops", () => {
  it("references a 500 MB file without reading its bytes", () => {
    const f = fixture();
    f.handlers.drop(f.event);
    expect(f.options.insert).toHaveBeenCalledExactlyOnceWith("@D:\\资料\\large.bin");
    expect(f.read).not.toHaveBeenCalled();
    expect(f.event.preventDefault).toHaveBeenCalledOnce();
    expect(f.event.stopPropagation).toHaveBeenCalledOnce();
    expect(f.event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it("references images and multiple files with spaces rather than adding attachments", () => {
    const f = fixture();
    f.event.dataTransfer.files = [new File([], "photo.png", { type: "image/png" }), f.file];
    f.options.resolvePath.mockReturnValueOnce("D:\\my photos\\photo.png");
    f.handlers.drop(f.event);
    expect(f.options.insert).toHaveBeenCalledExactlyOnceWith('@"D:\\my photos\\photo.png" @D:\\资料\\large.bin');
    expect(f.event.stopImmediatePropagation).toHaveBeenCalledOnce();
  });

  it("escapes unusual filenames as text rather than breaking reference delimiters", () => {
    const f = fixture();
    const path = '/tmp/a"b\nc.txt';
    f.options.resolvePath.mockReturnValue(path);
    f.handlers.drop(f.event);
    expect(f.options.insert).toHaveBeenCalledExactlyOnceWith(JSON.stringify(path));
  });

  it("blocks default dropping but leaves a disabled composer untouched", () => {
    const f = fixture();
    f.options.enabled.mockReturnValue(false);
    f.handlers.drop(f.event);
    expect(f.event.preventDefault).toHaveBeenCalledOnce();
    expect(f.options.resolvePath).not.toHaveBeenCalled();
    expect(f.options.insert).not.toHaveBeenCalled();
  });

  it.each(["outside", "text"])("does not consume %s drops", (scenario) => {
    const f = fixture();
    if (scenario === "outside") f.options.contains.mockReturnValue(false);
    else f.event.dataTransfer.types = ["text/plain"];
    f.handlers.drop(f.event);
    expect(f.event.preventDefault).not.toHaveBeenCalled();
    expect(f.options.resolvePath).not.toHaveBeenCalled();
  });

  it.each(["empty", "throw", "partial"])("reports %s path resolution without partial insertion or upload fallback", (scenario) => {
    const f = fixture();
    if (scenario === "throw") f.options.resolvePath.mockImplementation(() => { throw new Error("bridge failed"); });
    else if (scenario === "partial") {
      f.event.dataTransfer.files.push(new File([], "virtual.txt"));
      f.options.resolvePath.mockReturnValueOnce("D:\\valid.txt").mockReturnValueOnce("");
    } else f.options.resolvePath.mockReturnValue("");
    f.handlers.drop(f.event);
    expect(f.options.unavailable).toHaveBeenCalledOnce();
    expect(f.options.insert).not.toHaveBeenCalled();
    expect(f.read).not.toHaveBeenCalled();
    expect(f.event.preventDefault).toHaveBeenCalledOnce();
  });

  it("accepts dragover without resolving or reading files", () => {
    const f = fixture();
    f.handlers.dragover(f.event);
    expect(f.event.preventDefault).toHaveBeenCalledOnce();
    expect(f.options.resolvePath).not.toHaveBeenCalled();
  });

  it("wires the isolated preload bridge and cleans up capture handlers", () => {
    const composer = readFileSync(new URL("../components/DshPromptComposer.svelte", import.meta.url), "utf8");
    const preload = readFileSync(new URL("../../../desktop-electron/src/preload.ts", import.meta.url), "utf8");
    expect(preload).toContain("getPathForFile: (file: File) => webUtils.getPathForFile(file)");
    expect(composer).toContain("globalDrop={false}");
    expect(composer).toContain('document.addEventListener("drop", fileDrop.drop, true)');
    expect(composer).toContain('document.removeEventListener("drop", fileDrop.drop, true)');
    expect(composer).toContain("enabled: () => !disabled && !loading && !!sessionId");
  });
});
