// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import KnowledgeScopePicker from "$components/KnowledgeScopePicker.svelte";
import { t } from "$lib/i18n";

// #348：外部源不可用时必须在真实渲染里真的禁用，而不是只在源码里出现字段名。
afterEach(() => cleanup());

function radio(label: string): HTMLInputElement {
  return screen.getByLabelText(label, { exact: false }) as HTMLInputElement;
}

describe("KnowledgeScopePicker rendering", () => {
  it("keeps every scope selectable while the external state is unconfirmed", () => {
    render(KnowledgeScopePicker, { props: { scope: "local" } });
    for (const option of ["local", "external", "all"] as const) {
      const label = { local: "scopeLocal", external: "scopeExternal", all: "scopeAll" }[option];
      expect(radio(t(`knowledge.${label}`)).disabled).toBe(false);
    }
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("disables external scopes and explains why when the source is unavailable", () => {
    render(KnowledgeScopePicker, { props: { scope: "local", externalUnavailable: true } });
    expect(radio(t("knowledge.scopeLocal")).disabled).toBe(false);
    expect(radio(t("knowledge.scopeExternal")).disabled).toBe(true);
    expect(radio(t("knowledge.scopeAll")).disabled).toBe(true);
    expect(screen.getByRole("status").textContent).toContain(t("knowledge.scopeExternalUnavailable"));
  });

  it("offers a configure action only when a handler is provided", async () => {
    const onConfigure = vi.fn();
    render(KnowledgeScopePicker, { props: { scope: "local", externalUnavailable: true, onConfigure } });
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.scopeConfigure") }));
    expect(onConfigure).toHaveBeenCalledTimes(1);
    cleanup();
    render(KnowledgeScopePicker, { props: { scope: "local", externalUnavailable: true } });
    expect(screen.queryByRole("button", { name: t("knowledge.scopeConfigure") })).toBeNull();
  });

  it("selects a scope when the user changes the radio group", async () => {
    render(KnowledgeScopePicker, { props: { scope: "local" } });
    await fireEvent.click(radio(t("knowledge.scopeExternal")));
    expect(radio(t("knowledge.scopeExternal")).checked).toBe(true);
    expect(radio(t("knowledge.scopeLocal")).checked).toBe(false);
  });
});