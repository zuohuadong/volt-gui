import { describe, expect, it, vi } from "vitest";
import { renderBootFailure } from "./boot-failure";

type FakeElement = {
  tagName: string;
  className: string;
  textContent: string;
  type: string;
  children: FakeElement[];
  attributes: Record<string, string>;
  listeners: Record<string, () => void>;
  setAttribute: (name: string, value: string) => void;
  addEventListener: (name: string, listener: () => void) => void;
  append: (...children: FakeElement[]) => void;
};

function fakeElement(tagName: string): FakeElement {
  return {
    tagName,
    className: "",
    textContent: "",
    type: "",
    children: [],
    attributes: {},
    listeners: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, listener) { this.listeners[name] = listener; },
    append(...children) { this.children.push(...children); },
  };
}

describe("renderer boot failure fallback", () => {
  it("renders a readable error and retry action instead of leaving a blank target", () => {
    const document = { createElement: vi.fn((tag: string) => fakeElement(tag)) };
    const target = { ownerDocument: document, replaceChildren: vi.fn() };
    renderBootFailure(target as unknown as HTMLElement, new Error("chunk failed to load"));

    expect(target.replaceChildren).toHaveBeenCalledOnce();
    const main = target.replaceChildren.mock.calls[0][0] as FakeElement;
    expect(main.className).toBe("boot-failure");
    expect(main.attributes.role).toBe("alert");
    expect(main.children.map((child) => child.textContent)).toEqual([
      "工作台无法启动",
      "界面初始化失败。请重试；如果问题持续，请重启应用并保留下方诊断信息。",
      "chunk failed to load",
      "重新加载",
    ]);
    expect(main.children[3].listeners.click).toBeTypeOf("function");
  });

  it("never injects the failure text as HTML", () => {
    const document = { createElement: vi.fn((tag: string) => fakeElement(tag)) };
    const target = { ownerDocument: document, replaceChildren: vi.fn() };
    renderBootFailure(target as unknown as HTMLElement, new Error("<img src=x onerror=alert(1)>"));
    const main = target.replaceChildren.mock.calls[0][0] as FakeElement;
    expect(main.children[2].textContent).toBe("<img src=x onerror=alert(1)>");
    expect(main.children.every((child) => !("innerHTML" in child))).toBe(true);
  });
});