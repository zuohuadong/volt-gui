import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../components/ProviderWorkbench.svelte", import.meta.url), "utf8");
const script = ts.createSourceFile("Provider.ts", source.slice(source.indexOf(">") + 1, source.indexOf("</script>")), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const functions = ts.transpileModule(
  script.statements.filter(ts.isFunctionDeclaration).map((statement) => statement.getText(script)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

function harness() {
  const state = {
    selected: { provider: "one", settingsNs: "llm-one" }, credentialRef: "ONE_KEY",
    baseURLDraft: "", apiDraft: "", inlineKeyDraft: "test-only-value",
    defaultBaseURL: "https://example.test", defaultApi: "compat",
    busy: false, savingKey: false, discoverySupported: true,
    confirmingBundledReset: true, error: "", inlineKeyNotice: "",
    discovered: [] as unknown[],
    client: { setCredential: vi.fn().mockResolvedValue(undefined), discoverModels: vi.fn() },
    onCredentialSaved: vi.fn(),
    t: (key: string) => key,
    userFacingError: (error: Error) => error.message,
  };
  const actions = runInNewContext(`${functions}\n({resetProviderDrafts, saveInlineKey, discover})`, state);
  return { state, actions };
}

describe("provider settings isolation", () => {
  it("clears transient fields and confirmation without writing credentials", () => {
    const { state, actions } = harness();
    state.baseURLDraft = "https://draft.example.test";
    state.apiDraft = "draft-api";
    state.discovered = [{ id: "old" }];
    actions.resetProviderDrafts();
    expect([state.baseURLDraft, state.apiDraft, state.inlineKeyDraft]).toEqual(["", "", ""]);
    expect(state.confirmingBundledReset).toBe(false);
    expect(state.discovered).toEqual([]);
    expect(state.client.setCredential).not.toHaveBeenCalled();
  });

  it("refreshes the submitted credential, not the provider selected after the request", async () => {
    const { state, actions } = harness();
    let resolveSave!: () => void;
    state.client.setCredential.mockImplementation(() => new Promise<void>((resolve) => resolveSave = resolve));
    const pending = actions.saveInlineKey();
    state.selected = { provider: "two", settingsNs: "llm-two" };
    state.credentialRef = "TWO_KEY";
    state.inlineKeyDraft = "new-draft";
    resolveSave();
    await pending;
    expect(state.client.setCredential).toHaveBeenCalledWith("ONE_KEY", "test-only-value");
    expect(state.onCredentialSaved).toHaveBeenCalledWith("ONE_KEY");
    expect(state.inlineKeyDraft).toBe("new-draft");
    expect(state.inlineKeyNotice).toBe("");
    expect(state.savingKey).toBe(false);
  });

  it.each(["resolve", "reject"])("ignores stale discovery %s after a provider changes", async (outcome) => {
    const { state, actions } = harness();
    let resolveDiscovery!: (result: unknown) => void;
    let rejectDiscovery!: (error: Error) => void;
    state.client.discoverModels.mockImplementation(() => new Promise((resolve, reject) => {
      resolveDiscovery = resolve;
      rejectDiscovery = reject;
    }));
    const pending = actions.discover();
    expect(state.client.discoverModels).toHaveBeenCalledWith({
      provider: "one", settingsNs: "llm-one", baseURL: "https://example.test",
      api: "compat", apiKey: "test-only-value",
    });
    state.selected = { provider: "two", settingsNs: "llm-two" };
    if (outcome === "resolve") resolveDiscovery({ models: [{ id: "old" }] });
    else rejectDiscovery(new Error("old provider error"));
    await pending;
    expect(state.discovered).toEqual([]);
    expect(state.error).toBe("");
    expect(state.busy).toBe(false);
  });
});
