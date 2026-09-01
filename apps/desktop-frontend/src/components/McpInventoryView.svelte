<script lang="ts">
import {
  Cable, Check, CircleAlert, CircleCheck, Copy, Cpu, ExternalLink,
  FileCode, Globe, HardDrive, Info, Layers, Network, PlugZap,
  RefreshCw, Server, Settings2, ShieldAlert, Sparkles, Terminal, Wrench,
} from "@lucide/svelte";
import { Button } from "$components/ui/button";
import { DataState, SettingsGroup } from "@svadmin/ui";
import type { PluginInventoryEntry } from "$lib/dsh-client";
import { separatePluginsAndMcp } from "$lib/plugin-i18n";
import { t, i18n } from "$lib/i18n";

type Props = {
  entries: PluginInventoryEntry[];
  onRefresh?: () => void;
  onNavigateToSettings?: () => void;
};

let { entries, onRefresh, onNavigateToSettings }: Props = $props();

const currentLocale = $derived(i18n.locale);
const partitioned = $derived(separatePluginsAndMcp(entries, currentLocale));
const mcpEntries = $derived(partitioned.mcpEntries);
const mcpClientEntry = $derived(
  mcpEntries.find((item) => item.moduleName.includes("mcp-client") || item.entryId === "mcp-client"),
);
const isClientActive = $derived(mcpClientEntry?.enabled && mcpClientEntry?.fiberPhase === "active");

let copiedSnippet = $state(false);

const exampleYaml = `# profiles/anyong.yml 中的 MCP 挂载示例
- id: mcp-client
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    servers:
      # 1. 本地文件系统 MCP Server (stdio 模式)
      filesystem:
        transport: stdio
        command: npx
        args: ["-y", "@modelcontextprotocol/server-filesystem", "D:\\\\workspace"]
      # 2. SQLite 数据库 MCP Server
      sqlite:
        transport: stdio
        command: uvx
        args: ["mcp-server-sqlite", "--db-path", "app.db"]
      # 3. 远程 HTTP/SSE MCP Server
      remote-tools:
        transport: sse
        url: "http://127.0.0.1:8000/sse"`;

async function copyConfigExample() {
  try {
    await navigator.clipboard.writeText(exampleYaml);
    copiedSnippet = true;
    setTimeout(() => (copiedSnippet = false), 2000);
  } catch {
    // ignore
  }
}
</script>

<SettingsGroup
  title={t("mcp.title")}
  description={t("mcp.description")}
>
  <div class="mcp-view-header">
    <div class="mcp-actions-bar">
      {#if onRefresh}
        <Button variant="outline" size="sm" onclick={onRefresh}>
          <RefreshCw size={13} />
          <span>{t("mcp.refresh")}</span>
        </Button>
      {/if}
      {#if onNavigateToSettings}
        <Button variant="ghost" size="sm" onclick={onNavigateToSettings}>
          <Settings2 size={13} />
          <span>{t("mcp.goToSettings")}</span>
        </Button>
      {/if}
      <span class="management-capability">{t("mcp.entriesCount", { count: mcpEntries.length })}</span>
      <span class="management-capability">
        {isClientActive ? t("mcp.clientRunning") : t("mcp.clientStandby")}
      </span>
    </div>
  </div>

  <!-- MCP 架构与核心运行状态卡片 -->
  <div class="mcp-status-overview-grid">
    <div class="mcp-status-card" class:mcp-status-card--active={isClientActive}>
      <div class="mcp-status-card-header">
        <span class="mcp-status-icon">
          <Cable size={18} />
        </span>
        <div>
          <strong>{t("mcp.protocolEngine")}</strong>
          <small>{t("mcp.protocolSpec")}</small>
        </div>
      </div>
      <div class="mcp-status-card-body">
        <div class="mcp-status-indicator">
          <span
            class={`status-dot ${isClientActive ? "" : "offline"}`}
            aria-hidden="true"
          ></span>
          <span>
            {isClientActive
              ? t("mcp.clientActiveDesc")
              : t("mcp.clientStandbyDesc")}
          </span>
        </div>
        <div class="mcp-tech-meta">
          <code>@deepseek-ai/dsh-mcp-client</code>
          <span class="mcp-phase-badge">
            {mcpClientEntry?.fiberPhase === "active" ? t("mcp.fiberActive") : t("mcp.fiberStandby")}
          </span>
        </div>
      </div>
    </div>

    <div class="mcp-protocols-card">
      <strong class="mcp-section-mini-title">{t("mcp.transportsTitle")}</strong>
      <div class="mcp-transports-list">
        <div class="mcp-transport-item">
          <Terminal size={14} />
          <div>
            <strong>{t("mcp.transportStdio")}</strong>
            <small>{t("mcp.transportStdioDesc")}</small>
          </div>
        </div>
        <div class="mcp-transport-item">
          <Globe size={14} />
          <div>
            <strong>{t("mcp.transportSse")}</strong>
            <small>{t("mcp.transportSseDesc")}</small>
          </div>
        </div>
        <div class="mcp-transport-item">
          <Network size={14} />
          <div>
            <strong>{t("mcp.transportStreamable")}</strong>
            <small>{t("mcp.transportStreamableDesc")}</small>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- MCP 核心能力体系 -->
  <div class="mcp-capabilities-grid">
    <div class="mcp-cap-box">
      <span class="mcp-cap-icon"><Wrench size={16} /></span>
      <strong>{t("mcp.capTools")}</strong>
      <p>{t("mcp.capToolsDesc")}</p>
    </div>
    <div class="mcp-cap-box">
      <span class="mcp-cap-icon"><HardDrive size={16} /></span>
      <strong>{t("mcp.capResources")}</strong>
      <p>{t("mcp.capResourcesDesc")}</p>
    </div>
    <div class="mcp-cap-box">
      <span class="mcp-cap-icon"><Sparkles size={16} /></span>
      <strong>{t("mcp.capPrompts")}</strong>
      <p>{t("mcp.capPromptsDesc")}</p>
    </div>
  </div>

  <!-- 当前挂载的 MCP 实体列表 -->
  <div class="mcp-entries-section">
    <div class="mcp-section-title-row">
      <strong>{t("mcp.registeredTitle")}</strong>
      <small>{t("mcp.registeredSub")}</small>
    </div>

    {#if mcpEntries.length === 0}
      <div class="mcp-empty-state">
        <PlugZap size={28} />
        <strong>{t("mcp.emptyEntriesTitle")}</strong>
        <p>
          {t("mcp.emptyEntriesDesc")}
        </p>
      </div>
    {:else}
      <div class="plugin-card-grid">
        {#each mcpEntries as mcp (mcp.entryId)}
          <div class="plugin-card plugin-card--active">
            <div class="plugin-card-top">
              <div class="plugin-card-header-left">
                <span class="plugin-card-icon">
                  <Cable size={16} />
                </span>
                <div class="plugin-card-title-wrap">
                  <div class="plugin-card-title-row">
                    <strong>{mcp.info.name}</strong>
                    <span class="plugin-category-badge">{mcp.info.categoryLabel}</span>
                  </div>
                  <code class="plugin-id-tag">
                    {mcp.moduleName} · {mcp.entryId}
                  </code>
                </div>
              </div>

              <div class="plugin-card-badges">
                <span
                  class={`status-badge-capsule ${mcp.enabled ? "status-badge-capsule--success" : "status-badge-capsule--neutral"}`}
                >
                  {mcp.enabled ? t("common.enabled") : t("common.disabled")}
                </span>
                <span class={`plugin-phase plugin-phase--${mcp.fiberPhase || "none"}`}>
                  {mcp.fiberPhase === "active"
                    ? t("plugins.fiberActive")
                    : mcp.fiberPhase === "failed"
                      ? t("plugins.fiberFailed")
                      : mcp.fiberPhase || t("plugins.fiberNone")}
                </span>
              </div>
            </div>

            <p class="plugin-card-description">{mcp.info.description}</p>

            <div class="plugin-card-footer">
              <span class="plugin-vendor-tag">{mcp.info.vendor}</span>
              {#if mcp.info.tags && mcp.info.tags.length > 0}
                <div class="plugin-tag-list">
                  {#each mcp.info.tags as tag, tagIndex (`${tag}:${tagIndex}`)}
                    <span class="plugin-keyword-tag">{tag}</span>
                  {/each}
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>

  <!-- MCP 配置与挂载指南 -->
  <div class="mcp-config-guide-card">
    <div class="mcp-config-guide-head">
      <div>
        <strong class="flex items-center gap-2">
          <FileCode size={16} />
          <span>{t("mcp.guideTitle")}</span>
        </strong>
        <small>{t("mcp.guideSub")}</small>
      </div>
      <Button variant="outline" size="sm" onclick={copyConfigExample}>
        {#if copiedSnippet}
          <Check size={13} class="text-green-600" />
          <span>{t("mcp.copiedCode")}</span>
        {:else}
          <Copy size={13} />
          <span>{t("mcp.copyCode")}</span>
        {/if}
      </Button>
    </div>

    <pre class="mcp-yaml-code"><code>{exampleYaml}</code></pre>
  </div>

  <div class="knowledge-note">
    <ShieldAlert size={14} />
    <span>
      {t("mcp.note")}
    </span>
  </div>
</SettingsGroup>

