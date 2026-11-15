// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExternalKnowledgeSources from "$components/ExternalKnowledgeSources.svelte";
import { t } from "$lib/i18n";

// PM 评审要求行为级验收：断言渲染结果，而不是断言源码里出现了某个字符串。
afterEach(() => cleanup());

type FakeOptions = {
  value?: Record<string, unknown>;
  pluginEnabled?: boolean;
  pluginPhase?: string;
  testStatus?: "connected" | "unauthorized" | "forbidden" | "unavailable";
  verifiedSignature?: string;
  failUpdate?: boolean;
  /** 服务端已写入但调用抛错（部分提交），用来看关闭失败时是否以服务端状态为准。 */
  writeThenThrow?: boolean;
  /** 首次读取设置成功（页面知道自己已启用），之后的重新读取失败。 */
  failLoadAfterFirst?: boolean;
};

function fakeClient(options: FakeOptions = {}) {
  // 服务端是唯一真相：保存后 describeSettings 必须回读新值，且 revision 必须严格递增。
  const value: Record<string, unknown> = {
    baseUrl: "https://kb.example/v1",
    tenantId: "t1",
    knowledgeBaseIds: [],
    enabled: false,
    askEnabled: false,
    allowPrivateHosts: false,
    apiKeyRef: "WEKNORA_API_KEY",
    allowedOrigins: ["https://kb.example"],
    ...options.value,
  };
  let revision = 1;
  let loadCount = 0;
  const updateSettings = vi.fn(async (ns: string, patch: Record<string, unknown>, expectedRevision?: number) => {
    if (expectedRevision !== undefined && expectedRevision !== revision) {
      throw new Error(`revision conflict: expected ${expectedRevision}, actual ${revision}`);
    }
    if (options.failUpdate) throw new Error("update rejected");
    Object.assign(value, patch);
    revision += 1;
    if (options.writeThenThrow) throw new Error("connection dropped after write");
    return { ns, revision, value };
  });
  const setCredential = vi.fn(async () => ({}));
  const testKnowledgeSource = vi.fn(async () => ({
    status: options.testStatus ?? ("connected" as const),
    knowledgeBases: [{ id: "kb-1", name: "工艺库" }],
  }));
  const client = {
    describeSettings: vi.fn(async () => {
      loadCount += 1;
      if (options.failLoadAfterFirst && loadCount > 1) throw new Error("settings unavailable");
      return {
      writable: true,
      hasDocument: true,
        namespaces: [{ ns: "weknora", revision, value }],
      };
    }),
    describeCredentials: vi.fn(async () => ({
      credentials: { WEKNORA_API_KEY: { configured: true, writable: true } },
    })),
    updateSettings,
    setCredential,
    testKnowledgeSource,
  };
  const plugins = [{
    moduleName: "@wxg-prc-cpg/dsh-weknora",
    enabled: options.pluginEnabled ?? true,
    fiberPhase: options.pluginPhase ?? "active",
  }];
  return { client, plugins, updateSettings, testKnowledgeSource };
}

function renderSources(options: FakeOptions = {}) {
  const fake = fakeClient(options);
  const onRefresh = vi.fn(async () => {});
  const onVerified = vi.fn();
  const onVerifiedChange = vi.fn();
  render(ExternalKnowledgeSources, {
    props: {
      plugins: fake.plugins as never,
      client: fake.client as never,
      onRefresh,
      onVerified,
      onVerifiedChange,
      verifiedSignature: options.verifiedSignature ?? "",
    },
  });
  return { ...fake, onRefresh, onVerified, onVerifiedChange };
}

async function openForm(): Promise<void> {
  await fireEvent.click(await screen.findByRole("button", { name: t("knowledge.sourceConfigure") }));
}

const enableBox = () => screen.getByLabelText(t("knowledge.sourceEnabled"), { exact: false }) as HTMLInputElement;
const savedPatch = (call: unknown) => (call as [string, Record<string, unknown>])[1];

describe("external knowledge source settings (#363)", () => {
  it("hides the form and reports local-only retrieval while the source is off", async () => {
    renderSources();
    await waitFor(() => expect(screen.getByText(t("knowledge.externalStateDisabled"))).toBeTruthy());
    // 默认折叠：表单字段不在 DOM 里。
    expect(screen.queryByLabelText(t("knowledge.sourceUrl"), { exact: false })).toBeNull();
    expect(screen.queryByRole("button", { name: t("knowledge.sourceDisableNow") })).toBeNull();
    // 摘要只有名称、状态、配置三项。
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.queryAllByRole("status")).toHaveLength(0);
  });

  it("expands and collapses the form from a single configure action", async () => {
    renderSources();
    await openForm();
    expect(screen.getByLabelText(t("knowledge.sourceUrl"), { exact: false })).toBeTruthy();
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceCollapse") }));
    expect(screen.queryByLabelText(t("knowledge.sourceUrl"), { exact: false })).toBeNull();
    // 收起后焦点回到摘要行的「配置」按钮，不倒回到 document.body。
    expect((document.activeElement as HTMLElement | null)?.id).toBe("external-knowledge-toggle");
  });

  it("refuses to enable the source before a connection test passed", async () => {
    const { updateSettings } = renderSources();
    await openForm();
    await fireEvent.click(enableBox());
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceSave") }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(t("knowledge.sourceTestRequired")));
    expect(updateSettings).not.toHaveBeenCalled();
  });

  it("keeps the verified state after saving and survives a reload", async () => {
    const { updateSettings, onVerified } = renderSources();
    await openForm();
    await fireEvent.click(enableBox());
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceTest") }));
    await waitFor(() => expect(onVerified).toHaveBeenCalledTimes(1));
    // 测试连接先落盘为「未启用」，保存时才是 enabled: true。
    expect(savedPatch(updateSettings.mock.calls[0]).enabled).toBe(false);
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceSave") }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(2));
    expect(savedPatch(updateSettings.mock.calls.at(-1)).enabled).toBe(true);
    // save() 里的 load() 不得把验证结果冲掉。
    await waitFor(() => expect(screen.getByText(t("knowledge.externalStateConnected"))).toBeTruthy());
    // 服务端 revision 连续递增，说明组件用了返回值而不是本地 +1 猜测。
    expect(updateSettings.mock.calls.map(call => (call as unknown as [string, Record<string, unknown>, number])[2])).toEqual([1, 2]);
  });

  it("surfaces a failed connection test as a failure, not as unverified", async () => {
    const { testKnowledgeSource } = renderSources({ testStatus: "unauthorized" });
    await openForm();
    await fireEvent.click(enableBox());
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceTest") }));
    await waitFor(() => expect(testKnowledgeSource).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(t("knowledge.sourceDenied")));
    expect(screen.getByText(t("knowledge.externalStateFailed"))).toBeTruthy();
    // 失败态只能有一个 live region，关闭按钮也只出现一次。
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: t("knowledge.sourceDisableNow") })).toHaveLength(1);
  });

  it("invalidates the test result when only the knowledge base ids change", async () => {
    const { updateSettings, testKnowledgeSource } = renderSources();
    await openForm();
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceTest") }));
    await waitFor(() => expect(testKnowledgeSource).toHaveBeenCalledTimes(1));
    await fireEvent.input(screen.getByLabelText(t("knowledge.sourceBases"), { exact: false }), { target: { value: "kb-9" } });
    await fireEvent.click(enableBox());
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceSave") }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(t("knowledge.sourceTestRequired")));
    // 只改了库 ID 也必须重测，不能沿用旧验证。
    expect(updateSettings).toHaveBeenCalledTimes(1);
  });

  it("offers the one-click shutdown only inside the failure notice", async () => {
    const { updateSettings } = renderSources({ value: { enabled: true }, pluginEnabled: false });
    await waitFor(() => expect(screen.getByText(t("knowledge.externalStateFailed"))).toBeTruthy());
    // 摘要说「连接失败」，提示条必须同调，不能一边报红一边显示成功。
    expect(screen.getByRole("alert").textContent).toContain(t("knowledge.externalUnavailable"));
    expect(screen.queryAllByRole("status")).toHaveLength(0);
    const shutdown = await screen.findByRole("button", { name: t("knowledge.sourceDisableNow") });
    await fireEvent.click(shutdown);
    await waitFor(() => expect(updateSettings).toHaveBeenCalledTimes(1));
    expect(savedPatch(updateSettings.mock.calls[0]).enabled).toBe(false);
  });

  it("notifies the parent when a previously verified source starts failing", async () => {
    const { onVerifiedChange, updateSettings } = renderSources({ testStatus: "forbidden" });
    await openForm();
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceTest") }));
    // 测试失败必须把「本次已验证」的整体结论撤掉，否则父级还能选外部来源。
    await waitFor(() => expect(onVerifiedChange).toHaveBeenCalledWith(null));
    expect(updateSettings).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.getByText(t("knowledge.externalStateFailed"))).toBeTruthy());
  });

  it("keeps the verified conclusion after unmount when the parent still holds it", async () => {
    const first = renderSources();
    await openForm();
    await fireEvent.click(enableBox());
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceTest") }));
    await waitFor(() => expect(first.onVerifiedChange).toHaveBeenCalled());
    const signature = first.onVerifiedChange.mock.calls[0][0] as string;
    cleanup();
    // 重新挂载时父级把指纹传回来，页面必须仍然显示「已连接」，而不是掉回未验证。
    renderSources({ verifiedSignature: signature, value: { enabled: true } });
    await waitFor(() => expect(screen.getByText(t("knowledge.externalStateConnected"))).toBeTruthy(), { timeout: 2000 });
  });

  it("does not invalidate a verified source because of id spacing", async () => {
    const { onVerifiedChange, updateSettings } = renderSources();
    await openForm();
    await fireEvent.click(enableBox());
    await fireEvent.input(screen.getByLabelText(t("knowledge.sourceBases"), { exact: false }), { target: { value: "kb-1,  kb-2" } });
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceTest") }));
    await waitFor(() => expect(onVerifiedChange).toHaveBeenCalledTimes(1));
    // 保存并经服务端规范化回读后，验证结论不能因为空格/顺序差异而失效。
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceSave") }));
    await waitFor(() => expect(updateSettings).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByText(t("knowledge.externalStateConnected"))).toBeTruthy());
  });

  it("reloads authoritative state instead of faking a rollback when shutdown fails", async () => {
    const { updateSettings } = renderSources({ value: { enabled: true }, failUpdate: true });
    await openForm();
    const shutdown = screen.getByRole("button", { name: t("knowledge.sourceDisableNow") });
    await fireEvent.click(shutdown);
    await waitFor(() => expect(updateSettings).toHaveBeenCalled());
    // 写入失败：开关回到服务端仍为 true 的事实，并在提示条里说明原因。
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("update rejected"));
    expect(enableBox().checked).toBe(true);
  });

  it("revokes the verified conclusion when the test RPC itself rejects", async () => {
    const { client, onVerifiedChange } = renderSources();
    client.testKnowledgeSource.mockRejectedValueOnce(new Error("network down"));
    await openForm();
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceTest") }));
    await waitFor(() => expect(onVerifiedChange).toHaveBeenCalledWith(null));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("network down"));
  });

  it("drops verification as soon as a new credential is typed", async () => {
    const { onVerifiedChange, updateSettings } = renderSources();
    await openForm();
    await fireEvent.click(enableBox());
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceTest") }));
    await waitFor(() => expect(onVerifiedChange).toHaveBeenCalledTimes(1));
    // 已验证 + 已启用时改密钥：必须重新测试，不能直接带着新凭据保存。
    await fireEvent.input(screen.getByLabelText(t("knowledge.sourceApiKey"), { exact: false, selector: 'input[type="password"]' }), { target: { value: "sk-new" } });
    await fireEvent.click(screen.getByRole("button", { name: t("knowledge.sourceSave") }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain(t("knowledge.sourceTestRequired")));
    expect(updateSettings).toHaveBeenCalledTimes(1);
  });

  it("falls back to the local switch only when the authoritative reload also fails", async () => {
    renderSources({ value: { enabled: true }, failUpdate: true, failLoadAfterFirst: true });
    const btn = await screen.findByRole("button", { name: t("knowledge.sourceDisableNow") }) as HTMLButtonElement;
    await waitFor(() => expect(btn.disabled).toBe(false));
    await fireEvent.click(btn);
    // 服务端状态读不回来时保留原开关，并明确报错，而不是假装关闭成功。
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("update rejected"));
    // 重新读取也失败：开关保持原样（已启用），不谎报关闭成功。
    expect(enableBox().checked).toBe(true);
    expect(screen.queryByText(t("knowledge.externalStateDisabled"))).toBeNull();
  });

  it("believes the server when the shutdown write landed but the call still threw", async () => {
    renderSources({ value: { enabled: true }, writeThenThrow: true });
    const btn = await screen.findByRole("button", { name: t("knowledge.sourceDisableNow") }) as HTMLButtonElement;
    // 首次加载期间按钮是 disabled，必须等设置读回来再点。
    await waitFor(() => expect(btn.disabled).toBe(false));
    await fireEvent.click(btn);
    // 服务端已关闭：UI 必须跟随事实，而不是把开关拨回「开启」，也不该再报失败。
    await waitFor(() => expect(screen.getByText(t("knowledge.externalStateDisabled"))).toBeTruthy(), { timeout: 2000 });
    // 关闭是成功路径：不应该再弹出失败提示。
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(screen.queryByRole("button", { name: t("knowledge.sourceDisableNow") })).toBeNull();
  });
});