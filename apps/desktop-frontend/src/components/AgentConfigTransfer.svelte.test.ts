// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import AgentConfigTransfer from "$components/AgentConfigTransfer.svelte";
import { t } from "$lib/i18n";
import { buildBundle } from "$lib/agentconfig/codec";
import type { SettingsNamespace } from "$lib/dsh-client";

afterEach(() => cleanup());

const namespaces = [{
  ns: "llm-pi-ai",
  revision: 3,
  value: { providers: { "xg-gomodel": { apiKeyEnv: "XG_GOMODEL_API_KEY", models: [{ id: "vlm" }] } } },
}] as unknown as SettingsNamespace[];

const providers = [{
  provider: "xg-gomodel",
  displayName: "XG GOModel",
  settingsNs: "llm-pi-ai",
  settingsPath: ["providers", "xg-gomodel"],
  active: true,
}];

function renderTransfer(overrides: Record<string, unknown> = {}) {
  const updateSettings = vi.fn(async () => namespaces[0]);
  const setCredential = vi.fn(async () => ({}));
  const client = { updateSettings, setCredential } as never;
  render(AgentConfigTransfer, {
    props: {
      client,
      providers,
      namespaces,
      credentials: { XG_GOMODEL_API_KEY: { configured: false, writable: true } },
      onImported: vi.fn(),
      ...overrides,
    },
  });
  return { updateSettings, setCredential };
}

/** 中文 label 不能直接 btoa，先按 UTF-8 编码再转 base64url。 */
const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
};

const paste = async (text: string) => {
  const box = screen.getByLabelText(t("settings.agentConfigImportLabel")) as HTMLTextAreaElement;
  await fireEvent.input(box, { target: { value: text } });
  await fireEvent.click(screen.getByRole("button", { name: t("settings.agentConfigPreview") }));
};

describe("AgentConfig transfer (#ACB)", () => {
  it("previews a shared bundle and imports only the new models", async () => {
    const bundle = await buildBundle({
      label: "同事的配置",
      pub: { models: [{ provider: "xg-gomodel", id: "vlm" }, { provider: "xg-gomodel", id: "qwen-next", modelType: "multimodal" }] },
    });
    const { updateSettings } = renderTransfer();
    await paste(JSON.stringify(bundle));

    await waitFor(() => expect(screen.getByText("同事的配置")).toBeTruthy());
    expect(screen.getByText(t("settings.agentConfigModelsFact", { add: "1", existing: "1" }))).toBeTruthy();
    // 未确认前绝不写入。
    expect(updateSettings).not.toHaveBeenCalled();

    await fireEvent.click(screen.getByRole("button", { name: t("settings.agentConfigApply") }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain(t("settings.agentConfigImported", { models: "1", credentials: "0" })));
  });

  it("asks for the password of an encrypted bundle before showing what it contains", async () => {
    const bundle = await buildBundle({
      trust: "self",
      label: "加密配置",
      pub: { models: [{ provider: "xg-gomodel", id: "vlm" }] },
      secret: { secrets: { "xg-gomodel": { apiKey: "sk" } } },
      password: "pw",
    });
    const { setCredential } = renderTransfer();
    await paste(JSON.stringify(bundle));

    await waitFor(() => expect(screen.getByText("加密配置")).toBeTruthy());
    expect(screen.getByText(t("settings.agentConfigEncrypted"))).toBeTruthy();
    expect(screen.queryByRole("button", { name: t("settings.agentConfigApply") })).toBeNull();

    await fireEvent.input(screen.getByLabelText(t("settings.agentConfigPassword")), { target: { value: "wrong" } });
    await fireEvent.click(screen.getByRole("button", { name: t("settings.agentConfigUnlock") }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(t("settings.agentConfigErrorPassword")));
    expect(setCredential).not.toHaveBeenCalled();

    await fireEvent.input(screen.getByLabelText(t("settings.agentConfigPassword")), { target: { value: "pw" } });
    await fireEvent.click(screen.getByRole("button", { name: t("settings.agentConfigUnlock") }));
    await waitFor(() => expect(screen.getByRole("button", { name: t("settings.agentConfigApply") })).toBeTruthy());
    await fireEvent.click(screen.getByRole("button", { name: t("settings.agentConfigApply") }));
    await waitFor(() => expect(setCredential).toHaveBeenCalledWith("XG_GOMODEL_API_KEY", "sk"));
  });

  it("explains why MCP and skills are not imported instead of pretending success", async () => {
    const bundle = await buildBundle({
      pub: {
        models: [{ provider: "xg-gomodel", id: "new-model" }],
        mcp: [{ name: "github", transport: "stdio", command: "npx" }],
        skills: [{ id: "docx", enabled: true }],
      },
    });
    renderTransfer();
    await paste(JSON.stringify(bundle));
    await waitFor(() => expect(screen.getByText(t("settings.agentConfigSkippedTitle"))).toBeTruthy());
    expect(screen.getByText(/MCP server 定义在 DSH profile 里静态装配/u)).toBeTruthy();
    expect(screen.getByText("github")).toBeTruthy();
  });

  it("only previews a deep link handed in by the system, never imports it", async () => {
    const bundle = await buildBundle({
      label: "深链配置",
      pub: { models: [{ provider: "xg-gomodel", id: "from-link" }] },
    });
    const link = `agentconfig://import?v=1&bundle=${toBase64Url(JSON.stringify(bundle))}`;
    const { updateSettings } = renderTransfer({ incomingLink: link });
    await waitFor(() => expect(screen.getByText("深链配置")).toBeTruthy());
    expect(screen.getByRole("button", { name: t("settings.agentConfigApply") })).toBeTruthy();
    // 收到链接只做预览：必须由用户点确认才会写入。
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("re-plans once the local configuration arrives after a cold-start link", async () => {
    // 冷启动时深链可能早于 DSH 配置加载：先给空的 providers，再补上。
    const bundle = await buildBundle({ pub: { models: [{ provider: "xg-gomodel", id: "from-link" }] } });
    const { rerender } = render(AgentConfigTransfer, {
      props: {
        client: { updateSettings: vi.fn(), setCredential: vi.fn() } as never,
        providers: [],
        namespaces: [],
        credentials: {},
        onImported: vi.fn(),
      },
    });
    await paste(JSON.stringify(bundle));
    // 配置还没到：先如实说导不进去（模型以 provider/id 形式列在"不会导入"里）。
    await waitFor(() => expect(screen.getByText("xg-gomodel/from-link")).toBeTruthy());
    expect(screen.getAllByText(/本地没有的 provider/u).length).toBeGreaterThan(0);

    await rerender({ providers, namespaces, credentials: { XG_GOMODEL_API_KEY: { configured: false, writable: true } } });
    await waitFor(() => expect(screen.queryByText(/本地没有的 provider/u)).toBeNull());
    expect(screen.getByRole("button", { name: t("settings.agentConfigApply") })).toBeTruthy();
  });

  it("re-previews the same deep link when it is delivered again", async () => {
    const bundle = await buildBundle({ label: "重试包", pub: { models: [{ provider: "xg-gomodel", id: "vlm" }] } });
    const link = `agentconfig://import?v=1&bundle=${toBase64Url(JSON.stringify(bundle))}`;
    const client = { updateSettings: vi.fn(), setCredential: vi.fn() } as never;
    const { rerender } = render(AgentConfigTransfer, {
      props: { client, providers, namespaces, credentials: {}, incomingLink: link, incomingLinkToken: 1 },
    });
    await waitFor(() => expect(screen.getAllByText("重试包").length).toBeGreaterThan(0));

    // 弄坏当前预览，再投递同一条链接：序号变了就必须重新预览（重试场景）。
    await paste("not a bundle");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(t("settings.agentConfigErrorNotBundle")));
    await rerender({ incomingLink: link, incomingLinkToken: 2 });
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.getAllByText("重试包").length).toBeGreaterThan(0);
  });

  it("refuses a shared bundle that smuggles credentials, before writing anything", async () => {
    const bundle = {
      schema: "agentconfig-bundle",
      v: 1,
      created: 1,
      label: "伪造的共享包",
      trust: "shared",
      capabilities: ["models"],
      payload: { alg: "none", ct: btoa(JSON.stringify({ secrets: { "xg-gomodel": { apiKey: "sk-forged" } } })) },
      pub: { models: [{ provider: "xg-gomodel", id: "smuggled" }] },
    };
    const { updateSettings, setCredential } = renderTransfer();
    await paste(JSON.stringify(bundle));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(t("settings.agentConfigErrorTrust")));
    expect(screen.queryByRole("button", { name: t("settings.agentConfigApply") })).toBeNull();
    expect(updateSettings).not.toHaveBeenCalled();
    expect(setCredential).not.toHaveBeenCalled();
  });

  it("rejects junk input with a localized reason", async () => {
    renderTransfer();
    await paste("not a bundle");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(t("settings.agentConfigErrorNotBundle")));
  });

  it("exports a shared bundle that never contains credentials", async () => {
    renderTransfer();
    await fireEvent.click(screen.getByRole("button", { name: t("settings.agentConfigBuild") }));
    await waitFor(() => expect(screen.getByText(t("settings.agentConfigExported"))).toBeTruthy());
    const link = (screen.getByLabelText(t("settings.agentConfigLink")) as HTMLTextAreaElement).value;
    expect(link.startsWith("agentconfig://import?v=1&bundle=")).toBe(true);
    const decoded = JSON.parse(atob(link.split("bundle=")[1].replace(/-/g, "+").replace(/_/g, "/")));
    expect(decoded.trust).toBe("shared");
    expect(decoded.payload.alg).toBe("none");
    const secret = JSON.parse(atob(decoded.payload.ct));
    expect(secret.secrets).toEqual({});
  });
});