import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLocale, t } from "./i18n";
import { credentialRefHint, credentialRefTitle } from "./model-catalog";
import { settingsNamespaceName } from "./plugin-i18n";
import { filterLocalizedSkills, skillDisplayCopy } from "./skill-i18n";

const source = readFileSync(new URL("../App.svelte", import.meta.url), "utf8");
const settingsSectionNav = readFileSync(new URL("../components/SettingsSectionNav.svelte", import.meta.url), "utf8");
const appearanceSettings = readFileSync(new URL("../components/AppearanceSettings.svelte", import.meta.url), "utf8");
const speechSettings = readFileSync(new URL("../components/SpeechSettings.svelte", import.meta.url), "utf8");
const providerWorkbench = readFileSync(new URL("../components/ProviderWorkbench.svelte", import.meta.url), "utf8");
const settingsSource = `${source}\n${settingsSectionNav}\n${appearanceSettings}\n${speechSettings}`;
const app = source.slice(source.indexOf(">") + 1, source.indexOf("</script>"));
const script = ts.createSourceFile("App.ts", app, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const updateSource = ts.transpileModule(
  script.statements.filter((statement) => ts.isFunctionDeclaration(statement)
    && statement.name?.text === "checkForUpdate").map((statement) => statement.getText(script)).join("\n"),
  { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
).outputText;

afterEach(() => setLocale("zh-CN"));

describe("settings localization", () => {
  it.each(["browser-skill", "diagnose-windows-sandbox-acl", "office-docx", "office-pptx", "office-xlsx", "volt-gui-design-language"])("translates runtime skill %s", (name) => {
    const result = skillDisplayCopy({ name, description: "Upstream description", modelInvocable: true }, "zh-CN");
    expect(result.displayName).toMatch(/[\u4e00-\u9fff]/u);
    expect(result.description).toMatch(/[\u4e00-\u9fff]/u);
    expect(result.name).toBe(name);
  });

  it("translates built-in skills without changing invocation IDs", () => {
    const skill = { name: "product-requirements", description: "Create product requirements", whenToUse: "Use for product work", modelInvocable: true };
    expect(skillDisplayCopy(skill, "zh-CN")).toMatchObject({ name: skill.name, displayName: "产品需求分析", modelInvocable: true, whenToUse: skill.whenToUse });
    expect(skillDisplayCopy(skill, "en-US")).toMatchObject(skill);
    expect(skill.description).toBe("Create product requirements");
    const custom = { ...skill, name: "custom-team-skill" };
    expect(skillDisplayCopy(custom, "zh-CN")).toMatchObject(custom);
    const localized = [skillDisplayCopy(skill, "zh-CN")];
    expect(filterLocalizedSkills(localized, "product-requirements")).toEqual(localized);
    expect(filterLocalizedSkills(localized, "需求")).toEqual(localized);
  });

  it("uses localized namespaces, credentials and runtime labels", () => {
    setLocale("zh-CN");
    expect(settingsNamespaceName("session-checkpoint-policy", "zh-CN")).not.toBe("session-checkpoint-policy");
    expect(settingsNamespaceName("custom-extension", "zh-CN")).toBe("custom-extension");
    expect(credentialRefTitle("WEKNORA_API_KEY")).toBe("外部知识库 API 密钥");
    expect(t("settings.sourceEnvironment")).toBe("环境变量");
    expect(t("runtime.revision", { revision: 2 })).toBe("修订版本 2");
    expect(t("knowledge.callableCapabilities")).toBe("可用技能");
    setLocale("en-US");
    expect(credentialRefTitle("DEEPSEEK_API_KEY")).toBe("DeepSeek Official API Key");
    expect(credentialRefHint("CUSTOM_KEY")).toBe("Service credential reference");
  });

  it("keeps the settings entry beside knowledge and groups configuration by intent", () => {
    const footer = source.slice(source.indexOf('<div class="sidebar-footer">'), source.indexOf("</aside>", source.indexOf('<div class="sidebar-footer">')));
    expect(footer).toContain('openManagement("settings")');
    expect(footer).toContain('t("nav.settings")');
    expect(footer).toContain('openKnowledge');
    expect(source).toContain('let appVersion = $state("")');
    expect(source).toContain("appVersion = info.version");
    expect(source).toContain('t("updates.currentVersion", { version: appVersion })');
    expect(settingsSource).toContain('t("settings.generalTitle")');
    expect(settingsSource).toContain('t("settings.modelsTitle")');
    expect(settingsSource).toContain('t("settings.voiceTitle")');
    expect(settingsSource).toContain('t("settings.advancedTitle")');
    expect(source).toContain('moreLabel={t("nav.moreManagement")}');
    expect(source).toContain('t("nav.managementTools")');
    expect(source.match(/class="management-summary-grid"/g)?.length).toBe(1);
    expect(source).toContain('settingsSection === "general"');
    expect(source).toContain('settingsSection === "appearance"');
    expect(source).toContain('settingsSection === "models"');
    expect(source).toContain('settingsSection === "voice"');
    expect(source).toContain('settingsSection === "advanced"');
    expect(source).toContain('settingsSection === "about"');
    expect(source).toContain('class="management-header-actions"');
    expect(settingsSource).toContain('title={t("appearance.title")}');
    expect(settingsSource).toContain('id="interface-font"');
    expect(settingsSource).toContain('id="text-size"');
    expect(settingsSource).toContain('id="code-font"');
    expect(appearanceSettings.indexOf('class="settings-subsection"')).toBeLessThan(appearanceSettings.indexOf('id="interface-font"'));
    expect(source).toContain('bind:open={rawSettingsOpen}');
    expect(source).toContain('class="settings-raw-config"');
    expect(providerWorkbench).toContain('class="provider-discovery-settings"');
    expect(providerWorkbench).not.toContain('t("overview.settingsTitle")');
    expect(providerWorkbench).toContain('t("settings.providerAdvancedTitle")');
    expect(source).toMatch(/function openCredentialSettings\(ref: string \| undefined\): void \{[\s\S]*?switchSettingsSection\("advanced"\);/);
    expect(source).toMatch(/function selectSettingsNamespace\(ns: string\): void {[\s\S]*?switchSettingsSection\("advanced"\);[\s\S]*?rawSettingsOpen = true/);
    expect(source.indexOf('settingsSection === "general"')).toBeLessThan(source.indexOf('settingsSection === "models"'));
    expect(source.indexOf('settingsSection === "models"')).toBeLessThan(source.indexOf('settingsSection === "voice"'));
    expect(source.indexOf('settingsSection === "voice"')).toBeLessThan(source.indexOf('settingsSection === "advanced"'));
  });
});

describe("settings section transitions", () => {
  const navigationSource = ts.transpileModule(
    script.statements.filter((statement) => ts.isFunctionDeclaration(statement)
      && ["switchSettingsSection", "selectSettingsNamespace"].includes(statement.name?.text ?? ""))
      .map((statement) => statement.getText(script)).join("\n"),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } },
  ).outputText;

  function harness() {
    const state = {
      settingsSection: "general", settingsQuery: "old filter", rawSettingsOpen: false,
      selectedSettingsNs: "", settingsDraft: '{"unsaved":true}',
      settingsNamespaces: [{ ns: "llm-pi-ai", user: { enabled: true } }],
      ensureManagementComponents: vi.fn(),
    };
    const actions = runInNewContext(`${navigationSource}\n({switchSettingsSection, selectSettingsNamespace})`, state);
    return { state, actions };
  }

  it.each(["general", "appearance", "models", "voice", "advanced", "about"])("visits %s without saving or resetting the JSON draft", (section) => {
    const { state, actions } = harness();
    actions.switchSettingsSection(section);
    expect(state.settingsSection).toBe(section);
    expect(state.settingsQuery).toBe("");
    expect(state.settingsDraft).toBe('{"unsaved":true}');
    expect(state.rawSettingsOpen).toBe(false);
    expect(state.ensureManagementComponents).toHaveBeenCalledTimes(section === "models" ? 1 : 0);
  });

  it("opens the requested namespace even after filtering another section", () => {
    const { state, actions } = harness();
    actions.selectSettingsNamespace("llm-pi-ai");
    expect(state.settingsSection).toBe("advanced");
    expect(state.settingsQuery).toBe("");
    expect(state.rawSettingsOpen).toBe(true);
    expect(state.selectedSettingsNs).toBe("llm-pi-ai");
    expect(JSON.parse(state.settingsDraft)).toEqual({ enabled: true });
  });

  it("puts version checks only under About and keeps low-frequency fields collapsed", () => {
    const about = source.slice(source.indexOf('{#if settingsSection === "about"}'), source.indexOf('{#if settingsSection === "general"}'));
    expect(about).toContain("checkForUpdate");
    expect(about).toContain('networkMode === "intranet"');
    expect(source).toContain("let rawSettingsOpen = $state(false)");
    expect(providerWorkbench).toContain('<details class="provider-discovery-settings">');
    expect(appearanceSettings).toContain('<details class="settings-subsection">');
    expect(speechSettings).toContain("client.speechPrepare(provider.id)");
    expect(speechSettings).toContain("client.speechCancelPreparation(provider.id)");
    expect(speechSettings).toContain("openMicrophoneSettings");
  });
});

describe("desktop update action", () => {
  function harness(checkForUpdate: () => Promise<unknown>) {
    const state = {
      window: { voltDesktop: { checkForUpdate } },
      updateChecking: false, updateCheck: undefined as unknown, updateError: "",
      managementError: "", managementNotice: "",
      userFacingError: (error: Error) => error.message, t,
    };
    const check = runInNewContext(`${updateSource}\ncheckForUpdate`, state) as (showError?: boolean) => Promise<void>;
    return { state, check };
  }

  it.each(["current", "available"])("renders %s only after the desktop check succeeds", async (status) => {
    const result = { status, currentVersion: "1.2.3", latestVersion: "1.2.4" };
    const h = harness(vi.fn().mockResolvedValue(result));
    await h.check();
    expect(h.state.updateCheck).toEqual(result);
    expect(h.state.updateChecking).toBe(false);
    expect(h.state.updateError).toBe("");
  });

  it("clears stale success and exposes retryable failures", async () => {
    const h = harness(vi.fn().mockRejectedValue(new Error("检查更新超时")));
    h.state.updateCheck = { status: "current" };
    h.state.managementNotice = "当前已是最新版本";
    await h.check();
    expect(h.state.updateCheck).toBeUndefined();
    expect(h.state.updateError).toBe("检查更新超时");
    expect(h.state.managementNotice).toBe("");
    expect(h.state.updateChecking).toBe(false);
    expect(source).toContain('{#if updateError}<small role="alert">');
  });

  it("prevents duplicate requests while a check is in progress", async () => {
    const request = vi.fn().mockResolvedValue({});
    const h = harness(request);
    h.state.updateChecking = true;
    await h.check();
    expect(request).not.toHaveBeenCalled();
  });
});
