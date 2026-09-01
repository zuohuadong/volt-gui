import { describe, expect, it } from "vitest";
import { AVAILABLE_LOCALES, enUS, i18n, setLocale, t, zhCN } from "./index";

describe("i18n reactive localization engine", () => {
  it("resolves basic and nested translation keys for zh-CN", () => {
    setLocale("zh-CN");
    expect(t("app.name")).toBe("西谷智灯暗涌平台");
    expect(t("common.save")).toBe("保存");
    expect(t("nav.plugins")).toBe("插件");
    expect(t("nav.mcp")).toBe("MCP 服务");
    expect(t("plugins.categories.terminal")).toBe("终端与执行");
  });

  it("interpolates parameters correctly in both languages", () => {
    setLocale("zh-CN");
    expect(t("overview.sessionsDesc", { active: 3, archived: 2 })).toBe("3 个活跃会话，2 个已归档");
    expect(t("plugins.totalCount", { count: 12 })).toBe("12 个插件");

    setLocale("en-US");
    expect(t("overview.sessionsDesc", { active: 3, archived: 2 })).toBe("3 active sessions, 2 archived");
    expect(t("plugins.totalCount", { count: 12 })).toBe("12 plugins");
  });

  it("switches language reactively and updates translation output", () => {
    setLocale("zh-CN");
    expect(t("common.delete")).toBe("删除");
    expect(t("nav.overview")).toBe("总览");

    setLocale("en-US");
    expect(t("common.delete")).toBe("Delete");
    expect(t("nav.overview")).toBe("Overview");

    // Toggle back
    i18n.toggleLocale();
    expect(t("common.delete")).toBe("删除");
  });

  it("falls back to zh-CN or key when en-US is missing a key", () => {
    setLocale("en-US");
    expect(t("non.existent.key")).toBe("non.existent.key");
  });

  it("ensures key symmetry between zh-CN and en-US dictionaries", () => {
    function getLeafKeys(obj: Record<string, unknown>, prefix = ""): string[] {
      let keys: string[] = [];
      for (const [k, v] of Object.entries(obj)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === "object" && !Array.isArray(v)) {
          keys = keys.concat(getLeafKeys(v as Record<string, unknown>, fullKey));
        } else {
          keys.push(fullKey);
        }
      }
      return keys;
    }

    const zhKeys = getLeafKeys(zhCN).sort();
    const enKeys = getLeafKeys(enUS).sort();

    const missingInEn = zhKeys.filter((k) => !enKeys.includes(k));
    const missingInZh = enKeys.filter((k) => !zhKeys.includes(k));

    expect(missingInEn).toEqual([]);
    expect(missingInZh).toEqual([]);
  });

  it("provides available locale options", () => {
    expect(AVAILABLE_LOCALES.length).toBe(2);
    expect(AVAILABLE_LOCALES.map((l) => l.code)).toEqual(["zh-CN", "en-US"]);
  });
});
