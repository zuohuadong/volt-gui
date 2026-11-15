<script lang="ts">
  import { onMount, tick } from "svelte";
  import { ChevronDown, ChevronRight, Database, RefreshCw, Save, PlugZap, PowerOff } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { t } from "$lib/i18n";
  import { knowledgeSourceSignature } from "$lib/knowledge";
  import type { DshClient, SettingsNamespace, PluginInventoryEntry } from "$lib/dsh-client";

  type Props = {
    plugins: PluginInventoryEntry[];
    onRefresh: () => Promise<void>;
    client: DshClient;
    /** 连接测试通过时回传给上层：本次运行允许选择外部来源。 */
    onVerified?: () => void;
    /** 上层保存的验证指纹（离开页面再回来时据此恢复），以及验证失效通知。 */
    verifiedSignature?: string;
    onVerifiedChange?: (signature: string | null) => void;
  };
  let { plugins, onRefresh, client, onVerified, verifiedSignature: storedSignatureProp, onVerifiedChange }: Props = $props();
  let descriptor = $state<SettingsNamespace>();
  let endpoint = $state("");
  let tenant = $state("");
  let bases = $state("");
  let enabled = $state(false);
  let ask = $state(false);
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
  // 验证结果绑定在配置指纹上：配置没变，reload 不会清掉验证；配置一变自动失效。
  // 指纹由父级持有（`verifiedSignature` prop），这样离开设置页再回来不会丢掉验证结论。
  let verifiedSignature = $state("");
  // 我们最后一次报告给父级的结论：用来区分「父级撤销了旧结论」和「父级还没收到我们的新结论」。
  let reportedSignature = $state("");
  const signature = $derived(knowledgeSourceSignature({
    endpoint, tenantId: tenant, knowledgeBaseIds: bases, keyRef, keyConfigured, allowPrivateHosts: allowPrivate,
  }));
  const verified = $derived(verifiedSignature !== "" && verifiedSignature === signature);
  // 父级最近一次给出的非空结论：只有「从有结论变成无结论」才算父级撤销，
  // 不能把「父级还没收到我们刚报告的结论」误判成撤销。
  let lastParentSignature = $state("");
  $effect(() => {
    const incoming = storedSignatureProp ?? "";
    if (incoming) {
      lastParentSignature = incoming;
      if (incoming === signature && verifiedSignature !== incoming) {
        // 挂载恢复或父级写入：采纳父级的结论。
        verifiedSignature = incoming;
        reportedSignature = incoming;
      }
      return;
    }
    if (lastParentSignature) {
      // 父级撤销了结论（例如外部 401 自动退回本地）：本地不能继续显示「已连接」。
      lastParentSignature = "";
      verifiedSignature = "";
      reportedSignature = "";
    }
  });
  function recordVerification(value: string | null): void {
    verifiedSignature = value ?? "";
    reportedSignature = value ?? "";
    onVerifiedChange?.(value);
  }
  // 折叠状态：undefined 表示「跟随默认」，用户手动点过就固定下来，自动展开也能被收起。
  let expanded = $state<boolean | undefined>(undefined);
  const showForm = $derived(expanded ?? (enabled && !verified));
  async function toggleForm(): Promise<void> {
    const next = !showForm;
    expanded = next;
    await tick();
    // 收起后焦点不能随之消失，交还摘要行的「配置」按钮。
    if (!next) document.getElementById("external-knowledge-toggle")?.focus();
  }
  /** 一键关闭：用户踩到 401 时不必在表单里找开关。 */
  async function disableSource(): Promise<void> {
    const previous = enabled;
    enabled = false;
    expanded = true;
    approved = approved || !!originOf(endpoint);
    try {
      // 直接写「关闭」：不要走 save()，因为它内部还会 reload，写成功但回读失败会被误判成失败。
      await persist(false);
      recordVerification(null);
      try {
        await load();
      } catch {
        // 回读失败不影响「已关闭」这个已经写入的事实。
      }
      status = t("knowledge.sourceSaved");
      await onRefresh();
    } catch (error) {
      // 写入结果不明：以服务端权威状态为准；只有在读不回来时才回退本地开关。
      let authoritative = false;
      try {
        await load();
        authoritative = true;
      } catch {
        enabled = previous;
      }
      if (authoritative && !enabled) {
        // RPC 报错但服务端确实已经关闭：按关闭成功处理，不能又报失败又把结论留着。
        recordVerification(null);
        status = t("knowledge.sourceSaved");
        await onRefresh();
        return;
      }
      throw error;
    }
  }
  async function testConnection(): Promise<void> {
    let result: Awaited<ReturnType<DshClient["testKnowledgeSource"]>>;
    try {
      // 先保存为「未启用」，再用刚保存的地址与凭据测试，避免测的是上一次的旧地址。
      await persist(false);
      result = await client.testKnowledgeSource();
    } catch (error) {
      // 任何一步失败（落盘失败、RPC 抛错）都不能保留旧的「已验证」结论。
      recordVerification(null);
      throw error;
    }
    availableBases = result.knowledgeBases;
    if (result.status !== "connected") {
      recordVerification(null);
      // 测试失败必须走失败态，否则用户看到「未验证」却不知道连不上。
      throw new Error(result.status === "unauthorized" || result.status === "forbidden"
        ? t("knowledge.sourceDenied")
        : t("knowledge.externalActionFailed"));
    }
    recordVerification(signature);
    status = t("knowledge.sourceConnected");
    onVerified?.();
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
  // 摘要只表达一个事实：当前检索用的是本地文档还是外部知识源。
  type SourceState = "disabled" | "unverified" | "connected" | "failed";
  // 插件没运行但配置说开着，同样属于不可用：失败态必须统一，否则摘要是红色而提示条说成功。
  const sourceBroken = $derived(enabled && !pluginActive);
  const sourceState = $derived<SourceState>(
    failed || sourceBroken ? "failed"
      : !enabled ? "disabled"
      : verified ? "connected"
      : "unverified",
  );
  const sourceStateLabel = $derived({
    disabled: t("knowledge.externalStateDisabled"),
    unverified: t("knowledge.externalStateUnverified"),
    connected: t("knowledge.externalStateConnected"),
    failed: t("knowledge.externalStateFailed"),
  }[sourceState]);
  async function load(): Promise<void> {
    const settings = await client.describeSettings();
    descriptor = settings.namespaces.find(item => item.ns === "weknora");
    if (!descriptor) return;
    const value = descriptor.value as Record<string, unknown>;
    endpoint = String(value.baseUrl ?? "");
    tenant = String(value.tenantId ?? "");
    bases = Array.isArray(value.knowledgeBaseIds) ? value.knowledgeBaseIds.join(", ") : "";
    // 默认关闭：没写过这个字段时按 false 处理，不猜测用户意图。
    enabled = value.enabled === true;
    ask = value.askEnabled === true;
    allowPrivate = value.allowPrivateHosts === true;
    // 缺省凭据引用走与父级相同的默认值，否则父子指纹永远不相等。
    keyRef = typeof value.apiKeyRef === "string" && value.apiKeyRef ? value.apiKeyRef : "WEKNORA_API_KEY";
    const origin = originOf(endpoint);
    approved = !!origin && Array.isArray(value.allowedOrigins) && value.allowedOrigins.includes(origin);
    const credentials = await client.describeCredentials([keyRef]);
    keyConfigured = credentials.credentials[keyRef]?.configured === true;
    keyWritable = credentials.credentials[keyRef]?.writable === true;
    dirty = false;
  }
  onMount(() => { void runAction(load); });
  async function save(): Promise<void> {
    // 打开外部知识源前必须先测试连接成功（地址/凭据错时表现为持续 401）。
    if (enabled && !verified) throw new Error(t("knowledge.sourceTestRequired"));
    await persist(enabled);
    await load();
    status = t("knowledge.sourceSaved");
    await onRefresh();
  }
  /**
   * 「测试连接」先落盘再测：否则测的是上一次保存的旧地址，
   * 用户会以为新地址可用。同时这一步绝不打开 enabled。
   */
  async function persist(enabling: boolean): Promise<void> {
    if (!descriptor || !approved) throw new Error("Source approval required");
    const url = new URL(endpoint.trim());
    const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if ((url.protocol !== "https:" && !(local && url.protocol === "http:")) || url.username || url.password || url.search || url.hash)
      throw new Error("Invalid source URL");
    if (key) {
      const secret = key;
      key = "";
      await client.setCredential(keyRef, secret);
      keyConfigured = true;
      // 换了密钥内容，之前的验证结论不再成立。
      recordVerification(null);
    }
    const updated = await client.updateSettings("weknora", {
      baseUrl: url.toString().replace(/\/$/, ""), enabled: enabling, tenantId: tenant.trim(),
      allowedOrigins: [url.origin], allowPrivateHosts: allowPrivate,
      knowledgeBaseIds: bases.split(",").map(item => item.trim()).filter(Boolean),
      askEnabled: ask,
    }, descriptor.revision);
    // 用服务端返回的 revision，绝不在本地自增猜测并发契约。
    if (updated && typeof updated === "object" && "revision" in updated) descriptor = updated;
    else await load();
    dirty = false;
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
      <small class="source-state {sourceState}">{sourceStateLabel}</small>
    </div>
    <div class="source-actions">
      <Button id="external-knowledge-toggle" variant="ghost" size="sm" aria-expanded={showForm} aria-controls={showForm ? "external-knowledge-form" : undefined} onclick={() => void toggleForm()}>
        {#if showForm}<ChevronDown size={14} />{:else}<ChevronRight size={14} />{/if}{showForm ? t("knowledge.sourceCollapse") : t("knowledge.sourceConfigure")}
      </Button>
    </div>
  </div>
  {#if descriptor && showForm}
    <form id="external-knowledge-form" onsubmit={(event) => { event.preventDefault(); void runAction(save); }} oninput={() => { dirty = true; status = ""; }}>
      <fieldset disabled={busy}>
        <label class="check"><input type="checkbox" bind:checked={enabled} />{t("knowledge.sourceEnabled")}<small class="source-default-note">{t("knowledge.sourceDefaultOffNote")}</small></label>
        <label class="check"><input type="checkbox" bind:checked={ask} />{t("knowledge.sourceAsk")}</label>
        <label>{t("knowledge.sourceUrl")}<input type="url" required bind:value={endpoint} oninput={() => { approved = false; }} /></label>
        <label>{t("knowledge.sourceTenant")}<input bind:value={tenant} /></label>
        <label>{t("knowledge.sourceBases")}<input bind:value={bases} /></label>
        <label>{t("knowledge.sourceApiKey")}（{keyConfigured ? t("knowledge.sourceKeySet") : t("knowledge.sourceKeyMissing")}）<input type="password" autocomplete="new-password" bind:value={key} disabled={!keyWritable} oninput={() => { if (key) recordVerification(null); }} /></label>
        <label class="check"><input type="checkbox" bind:checked={allowPrivate} />{t("knowledge.sourcePrivate")}</label>
        <label class="check"><input type="checkbox" bind:checked={approved} />{t("knowledge.sourceApprove")}</label>
        <div class="source-actions">
          <Button type="submit" size="sm" disabled={!approved}><Save size={14} />{t("knowledge.sourceSave")}</Button>
          <Button type="button" size="sm" variant="outline" disabled={busy} onclick={() => void runAction(testConnection)}><PlugZap size={14} />{t("knowledge.sourceTest")}</Button>
          <Button type="button" size="sm" variant="ghost" title={t("common.refresh")} aria-label={t("common.refresh")} disabled={busy} onclick={() => void runAction(async () => { await load(); await onRefresh(); })}><RefreshCw size={14} /></Button>
        </div>
      </fieldset>
    </form>
  {/if}
  {#if enabled && !verified && !failed && !sourceBroken}
    <div class="source-notice warning" role="status">
      <span>{t("knowledge.sourceTestRequired")}</span>
      <Button variant="outline" size="sm" disabled={busy} onclick={() => void runAction(disableSource)}><PowerOff size={14} />{t("knowledge.sourceDisableNow")}</Button>
    </div>
  {/if}
  {#if status && !failed && !sourceBroken}<div class="source-notice" role="status"><span>{status}</span></div>{/if}
  {#if availableBases.length}
    <ul>{#each availableBases as base}<li>{base.name} <code>{base.id}</code></li>{/each}</ul>
  {/if}
  {#if failed || sourceBroken}
    <div class="source-notice alert" role="alert">
      <span>{sourceBroken ? t("knowledge.externalUnavailable") : (errorDetail || t("knowledge.externalActionFailed"))}</span>
      <div class="source-actions">
        <Button variant="ghost" size="sm" disabled={busy} onclick={() => void runAction(load)}>{t("knowledge.sourceRetry")}</Button>
        {#if enabled}
          <Button variant="outline" size="sm" disabled={busy} onclick={() => void runAction(disableSource)}><PowerOff size={14} />{t("knowledge.sourceDisableNow")}</Button>
        {/if}
      </div>
    </div>
  {/if}
</section>

<style>
  .external-sources { min-width: 0; padding: 18px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); }
  h2 { margin: 0 0 14px; font-size: 14px; }
  .source-row, .source-actions { display: flex; align-items: center; gap: 10px; }
  .source-row { flex-wrap: wrap; padding-bottom: 14px; border-bottom: 1px solid var(--border); }
  .source-name { flex: 1; min-width: 140px; }
  small { display: block; margin-top: 4px; color: var(--muted-foreground); font-size: 12px; overflow-wrap: anywhere; }
  small.source-state.unverified { color: var(--warning, #b8860b); }
  small.source-state.failed { color: var(--destructive); }
  small.source-state.connected { color: var(--foreground); }
  .source-notice { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 12px; padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border); font-size: 12px; }
  .source-notice > span { flex: 1; min-width: 180px; overflow-wrap: anywhere; }
  .source-notice.warning { border-color: var(--warning, #b8860b); }
  .source-notice.alert { border-color: var(--destructive); color: var(--destructive); }
  fieldset { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 14px; border: 0; padding: 16px 0 0; margin: 0; min-width: 0; }
  label { display: grid; gap: 6px; min-width: 0; font-size: 12px; }
  label.check { display: flex; align-items: center; gap: 7px; grid-column: 1 / -1; }
  input:not([type="checkbox"]) { width: 100%; min-width: 0; height: 34px; border: 1px solid var(--border); border-radius: 5px; background: var(--background); padding: 6px 8px; color: var(--foreground); }
  .source-actions { grid-column: 1 / -1; }
  ul { font-size: 12px; overflow-wrap: anywhere; }
  @media (max-width: 760px) { fieldset { grid-template-columns: minmax(0, 1fr); } }
</style>
