<script lang="ts">
  import { onMount } from "svelte";
  import { Database, RefreshCw, Save, PlugZap } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { StatusBadge } from "@svadmin/ui";
  import { t } from "$lib/i18n";
  import type { DshClient, SettingsNamespace, PluginInventoryEntry } from "$lib/dsh-client";

  type Props = {
    plugins: PluginInventoryEntry[];
    onRefresh: () => Promise<void>;
    client: DshClient;
  };
  let { plugins, onRefresh, client }: Props = $props();
  let descriptor = $state<SettingsNamespace>();
  let endpoint = $state("");
  let tenant = $state("");
  let bases = $state("");
  let enabled = $state(false);
  let allowPrivate = $state(false);
  let approved = $state(false);
  let key = $state("");
  let keyConfigured = $state(false);
  let keyWritable = $state(false);
  let keyRef = $state("WEKNORA_API_KEY");
  let dirty = $state(false);
  let status = $state("");
  let errorDetail = $state("");
  let availableBases = $state<Array<{ id: string; name: string }>>([]);
  async function testConnection(): Promise<void> {
    const result = await client.testKnowledgeSource();
    availableBases = result.knowledgeBases;
    status = result.status === "connected" ? t("knowledge.sourceConnected")
      : result.status === "unauthorized" || result.status === "forbidden" ? t("knowledge.sourceDenied") : t("knowledge.externalActionFailed");
  }
  const sourcePlugin = $derived(
    plugins.find((item) => item.moduleName === "@wxg-prc-cpg/dsh-weknora" && item.enabled)
    ?? plugins.find((item) => item.moduleName === "@wxg-prc-cpg/dsh-weknora"),
  );
  const pluginActive = $derived(sourcePlugin?.enabled === true && sourcePlugin.fiberPhase === "active");
  function originOf(value: string): string {
    try {
      return new URL(value.trim()).origin;
    } catch {
      return "";
    }
  }
  let busy = $state(false);
  let failed = $state(false);
  async function load(): Promise<void> {
    const settings = await client.describeSettings();
    descriptor = settings.namespaces.find(item => item.ns === "weknora");
    if (!descriptor) return;
    const value = descriptor.value as Record<string, unknown>;
    endpoint = String(value.baseUrl ?? "");
    tenant = String(value.tenantId ?? "");
    bases = Array.isArray(value.knowledgeBaseIds) ? value.knowledgeBaseIds.join(", ") : "";
    enabled = value.enabled === true;
    allowPrivate = value.allowPrivateHosts === true;
    keyRef = String(value.apiKeyRef ?? "WEKNORA_API_KEY");
    const origin = originOf(endpoint);
    approved = !!origin && Array.isArray(value.allowedOrigins) && value.allowedOrigins.includes(origin);
    const credentials = await client.describeCredentials([keyRef]);
    keyConfigured = credentials.credentials[keyRef]?.configured === true;
    keyWritable = credentials.credentials[keyRef]?.writable === true;
    dirty = false;
  }
  onMount(() => { void runAction(load); });
  async function save(): Promise<void> {
    if (!descriptor || !approved) throw new Error("Source approval required");
    const url = new URL(endpoint.trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash)
      throw new Error("Invalid source URL");
    if (key) {
      const secret = key;
      key = "";
      await client.setCredential(keyRef, secret);
    }
    await client.updateSettings("weknora", {
      baseUrl: url.toString().replace(/\/$/, ""), enabled, tenantId: tenant.trim(),
      allowedOrigins: [url.origin], allowPrivateHosts: allowPrivate,
      knowledgeBaseIds: bases.split(",").map(item => item.trim()).filter(Boolean),
    }, descriptor.revision);
    await load();
    status = t("knowledge.sourceSaved");
    await onRefresh();
  }
  async function runAction(action: () => Promise<void>): Promise<void> {
    busy = true;
    failed = false;
    status = "";
    errorDetail = "";
    availableBases = [];
    try {
      await action();
    } catch (error) {
      failed = true;
      errorDetail = error instanceof Error ? error.message : String(error);
    } finally {
      busy = false;
    }
  }
</script>

<section class="external-sources" aria-label={t("knowledge.externalTitle")}>
  <h2>{t("knowledge.externalTitle")}</h2>
  <div class="source-row">
    <Database size={18} />
    <div class="source-name">
      <strong>WeKnora</strong>
      <small>{pluginActive ? t("knowledge.externalReady") : t("knowledge.externalUnavailable")}</small>
      <StatusBadge status={pluginActive ? (status === t("knowledge.sourceConnected") ? "success" : "neutral") : "warning"} label={status || t("knowledge.externalUnverified")} />
    </div>
    <div class="source-actions">
      <Button variant="ghost" size="icon-sm" title={t("common.refresh")} aria-label={t("common.refresh")} disabled={busy} onclick={() => void runAction(async () => { await load(); await onRefresh(); })}><RefreshCw size={14} /></Button>
    </div>
  </div>
  {#if descriptor}
    <form onsubmit={(event) => { event.preventDefault(); void runAction(save); }} oninput={() => { dirty = true; status = ""; }}>
      <fieldset disabled={busy}>
        <label class="check"><input type="checkbox" bind:checked={enabled} />{t("knowledge.sourceEnabled")}</label>
        <label>{t("knowledge.sourceUrl")}<input type="url" required bind:value={endpoint} oninput={() => { approved = false; }} /></label>
        <label>{t("knowledge.sourceTenant")}<input bind:value={tenant} /></label>
        <label>{t("knowledge.sourceBases")}<input bind:value={bases} /></label>
        <label>{t("knowledge.sourceApiKey")}（{keyConfigured ? t("knowledge.sourceKeySet") : t("knowledge.sourceKeyMissing")}）<input type="password" autocomplete="new-password" bind:value={key} disabled={!keyWritable} /></label>
        <label class="check"><input type="checkbox" bind:checked={allowPrivate} />{t("knowledge.sourcePrivate")}</label>
        <label class="check"><input type="checkbox" bind:checked={approved} />{t("knowledge.sourceApprove")}</label>
        <div class="source-actions">
          <Button type="submit" size="sm" disabled={!approved}><Save size={14} />{t("knowledge.sourceSave")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={dirty || !!key} onclick={() => void runAction(testConnection)}><PlugZap size={14} />{t("knowledge.sourceTest")}</Button>
        </div>
      </fieldset>
    </form>
  {/if}
  {#if status}<small role="status">{status}</small>{/if}
  {#if availableBases.length}
    <ul>{#each availableBases as base}<li>{base.name} <code>{base.id}</code></li>{/each}</ul>
  {/if}
  {#if failed}<p role="alert">{errorDetail || t("knowledge.externalActionFailed")}</p>{/if}
</section>

<style>
  .external-sources { min-width: 0; padding: 18px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); }
  h2 { margin: 0 0 14px; font-size: 14px; }
  .source-row, .source-actions { display: flex; align-items: center; gap: 10px; }
  .source-row { flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
  .source-name { flex: 1; min-width: 140px; }
  small { display: block; margin-top: 4px; color: var(--muted-foreground); font-size: 12px; overflow-wrap: anywhere; }
  p { font-size: 12px; color: var(--destructive); }
  fieldset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; border: 0; padding: 16px 0 0; margin: 0; min-width: 0; }
  label { display: grid; gap: 6px; min-width: 0; font-size: 12px; }
  label.check { display: flex; align-items: center; gap: 7px; grid-column: 1 / -1; }
  input:not([type="checkbox"]) { width: 100%; min-width: 0; height: 34px; border: 1px solid var(--border); border-radius: 5px; background: var(--background); padding: 6px 8px; color: var(--foreground); }
  .source-actions { grid-column: 1 / -1; }
  ul { font-size: 12px; overflow-wrap: anywhere; }
  @media (max-width: 760px) { fieldset { grid-template-columns: minmax(0, 1fr); } }
</style>
