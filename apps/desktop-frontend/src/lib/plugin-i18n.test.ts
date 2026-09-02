import { describe, expect, it } from "vitest";
import type { PluginInventoryEntry } from "./dsh-client";
import {
  PLUGIN_CATEGORIES,
  filterEnrichedPlugins,
  isMcpEntry,
  isMcpIdentifier,
  resolvePluginI18n,
  separatePluginsAndMcp,
} from "./plugin-i18n";
import { setLocale } from "./i18n";

describe("plugin-i18n metadata and classification", () => {
  it("resolves official DSH plugins with rich Chinese names and descriptions", () => {
    setLocale("zh-CN");
    const pwsh = resolvePluginI18n({
      moduleName: "@deepseek-ai/dsh-tool-pwsh",
      entryId: "tool-pwsh",
    });
    expect(pwsh.name).toBe("PowerShell 终端工具");
    expect(pwsh.category).toBe("terminal");
    expect(pwsh.categoryLabel).toBe("终端与执行");
    expect(pwsh.description).toContain("PowerShell");
    expect(pwsh.isMcp).toBe(false);
    expect(pwsh.vendor).toBe("官方内置 (@deepseek-ai)");

    const persona = resolvePluginI18n({
      moduleName: "@deepseek-ai/dsh-persona",
      entryId: "persona",
    });
    expect(persona.name).toBe("人设与角色定义");
    expect(persona.category).toBe("core");
    expect(persona.categoryLabel).toBe("核心配置");
    expect(persona.isMcp).toBe(false);

    const compaction = resolvePluginI18n({
      moduleName: "@deepseek-ai/dsh-compaction-basic",
      entryId: "compaction-basic",
    });
    expect(compaction.name).toBe("会话上下文自动压缩");
    expect(compaction.category).toBe("compaction");
    expect(compaction.categoryLabel).toBe("上下文与性能");

    const subagent = resolvePluginI18n({
      moduleName: "@deepseek-ai/dsh-tool-subagent",
      entryId: "tool-subagent",
    });
    expect(subagent.name).toBe("子 Agent 派发器");
    expect(subagent.category).toBe("subagents");
    expect(subagent.categoryLabel).toBe("多 Agent 协作");

    const xgGateway = resolvePluginI18n({
      moduleName: "@deepseek-ai/dsh-llm-pi-ai",
      entryId: "llm-pi-ai",
    });
    expect(xgGateway.name).toBe("XG GOModel / 多模型提供商网关");
    expect(xgGateway.category).toBe("model");
    expect(xgGateway.categoryLabel).toBe("模型与网关");

    const browserSkill = resolvePluginI18n({
      moduleName: "@wxg-prc-cpg/browser-skill-dsh-plugin",
      entryId: "browserskill",
    });
    expect(browserSkill.name).toBe("BrowserSkill 浏览器控制");
    expect(browserSkill.category).toBe("browser");
    expect(browserSkill.categoryLabel).toBe("浏览器与计算机控制");
    expect(browserSkill.tags).toContain("Computer Use");

    const officeCli = resolvePluginI18n({
      moduleName: "@deepseek-ai/dsh-mcp-client",
      entryId: "mcp-officecli",
    });
    expect(officeCli.name).toBe("OfficeCLI 文档处理");
    expect(officeCli.category).toBe("office");
    expect(officeCli.isMcp).toBe(true);
  });

  it("resolves English names and descriptions when en-US is active", () => {
    setLocale("en-US");
    const pwsh = resolvePluginI18n({
      moduleName: "@deepseek-ai/dsh-tool-pwsh",
      entryId: "tool-pwsh",
    });
    expect(pwsh.name).toBe("PowerShell Terminal Tool");
    expect(pwsh.categoryLabel).toBe("Terminal & Exec");
    expect(pwsh.vendor).toBe("Official Builtin (@deepseek-ai)");

    const compaction = resolvePluginI18n({
      moduleName: "@deepseek-ai/dsh-compaction-basic",
      entryId: "compaction-basic",
    });
    expect(compaction.name).toBe("Context Auto-Compaction");
    expect(compaction.categoryLabel).toBe("Context & Perf");

    const browserSkill = resolvePluginI18n({
      moduleName: "@wxg-prc-cpg/browser-skill-dsh-plugin",
      entryId: "browserskill",
    });
    expect(browserSkill.name).toBe("BrowserSkill Browser Control");
    expect(browserSkill.categoryLabel).toBe("Browser & Computer Control");

    const officeCli = resolvePluginI18n({
      moduleName: "@deepseek-ai/dsh-mcp-client",
      entryId: "mcp-officecli",
    });
    expect(officeCli.name).toBe("OfficeCLI Document Tools");
    expect(officeCli.categoryLabel).toBe("Office Documents");
  });

  it("accurately identifies MCP entries and marks them as MCP category", () => {
    setLocale("zh-CN");
    expect(isMcpIdentifier("@deepseek-ai/dsh-mcp-client")).toBe(true);
    expect(isMcpIdentifier("mcp-server-filesystem")).toBe(true);
    expect(isMcpIdentifier("@modelcontextprotocol/server-postgres")).toBe(true);
    expect(isMcpIdentifier("tool-pwsh")).toBe(false);
    expect(isMcpIdentifier("@deepseek-ai/dsh-tool-fs")).toBe(false);

    const mcpClient = resolvePluginI18n({
      moduleName: "@deepseek-ai/dsh-mcp-client",
      entryId: "mcp-client",
    });
    expect(mcpClient.isMcp).toBe(true);
    expect(mcpClient.category).toBe("mcp");
    expect(mcpClient.name).toBe("MCP 协议客户端");
    expect(mcpClient.categoryLabel).toBe("MCP 协议服务");

    const customMcp = resolvePluginI18n({
      moduleName: "@modelcontextprotocol/server-sqlite",
      entryId: "mcp-sqlite",
    });
    expect(customMcp.isMcp).toBe(true);
    expect(customMcp.category).toBe("mcp");
    expect(customMcp.categoryLabel).toBe("MCP 协议服务");
  });

  it("provides sensible fallback localization for custom or dynamic plugins", () => {
    setLocale("zh-CN");
    const customTool = resolvePluginI18n({
      moduleName: "@custom-org/dsh-tool-database-browser",
      entryId: "tool-database-browser",
    });
    expect(customTool.name).toContain("Database Browser");
    expect(customTool.categoryLabel).toBe("核心工具");
    expect(customTool.description).toContain("核心工具");
    expect(customTool.isMcp).toBe(false);

    const customUnknown = resolvePluginI18n({
      moduleName: "custom-extension-analyzer",
      entryId: "analyzer",
    });
    expect(customUnknown.category).toBe("custom");
    expect(customUnknown.categoryLabel).toBe("扩展插件");
    expect(customUnknown.name).toBe("Custom Extension Analyzer 插件");
  });

  it("separates mixed plugin inventory into distinct plugins and MCP entries", () => {
    const inventory: PluginInventoryEntry[] = [
      {
        entryId: "tool-pwsh",
        moduleName: "@deepseek-ai/dsh-tool-pwsh",
        enabled: true,
        fiberPhase: "active",
      },
      {
        entryId: "persona",
        moduleName: "@deepseek-ai/dsh-persona",
        enabled: true,
        fiberPhase: "active",
      },
      {
        entryId: "mcp-client",
        moduleName: "@deepseek-ai/dsh-mcp-client",
        enabled: true,
        fiberPhase: "active",
      },
      {
        entryId: "mcp-server-git",
        moduleName: "@modelcontextprotocol/server-git",
        enabled: false,
        fiberPhase: null,
      },
      {
        entryId: "tool-fs",
        moduleName: "@deepseek-ai/dsh-tool-fs",
        enabled: true,
        fiberPhase: "active",
      },
    ];

    const { plugins, mcpEntries } = separatePluginsAndMcp(inventory);

    expect(plugins.length).toBe(3);
    expect(plugins.map((p) => p.entryId)).toEqual(["tool-pwsh", "persona", "tool-fs"]);
    expect(plugins.every((p) => !p.info.isMcp)).toBe(true);

    expect(mcpEntries.length).toBe(2);
    expect(mcpEntries.map((m) => m.entryId)).toEqual(["mcp-client", "mcp-server-git"]);
    expect(mcpEntries.every((m) => m.info.isMcp)).toBe(true);
  });

  it("supports comprehensive search and category filtering across Chinese and English fields", () => {
    setLocale("zh-CN");
    const inventory: PluginInventoryEntry[] = [
      {
        entryId: "tool-pwsh",
        moduleName: "@deepseek-ai/dsh-tool-pwsh",
        enabled: true,
        fiberPhase: "active",
      },
      {
        entryId: "persona",
        moduleName: "@deepseek-ai/dsh-persona",
        enabled: true,
        fiberPhase: "active",
      },
      {
        entryId: "compaction-basic",
        moduleName: "@deepseek-ai/dsh-compaction-basic",
        enabled: true,
        fiberPhase: "active",
      },
      {
        entryId: "tool-subagent",
        moduleName: "@deepseek-ai/dsh-tool-subagent",
        enabled: true,
        fiberPhase: "active",
      },
    ];

    const { plugins } = separatePluginsAndMcp(inventory);

    // Search by Chinese title
    const searchName = filterEnrichedPlugins(plugins, "PowerShell");
    expect(searchName.length).toBe(1);
    expect(searchName[0].info.name).toBe("PowerShell 终端工具");

    // Search by Chinese description keyword
    const searchDesc = filterEnrichedPlugins(plugins, "Token");
    expect(searchDesc.length).toBe(1);
    expect(searchDesc[0].entryId).toBe("compaction-basic");

    // Search by module name substring
    const searchModule = filterEnrichedPlugins(plugins, "subagent");
    expect(searchModule.length).toBe(1);
    expect(searchModule[0].entryId).toBe("tool-subagent");

    // Filter by Category
    const categoryFiltered = filterEnrichedPlugins(plugins, "", "terminal");
    expect(categoryFiltered.length).toBe(1);
    expect(categoryFiltered[0].info.category).toBe("terminal");

    const allFiltered = filterEnrichedPlugins(plugins, "", "all");
    expect(allFiltered.length).toBe(4);
  });
});
