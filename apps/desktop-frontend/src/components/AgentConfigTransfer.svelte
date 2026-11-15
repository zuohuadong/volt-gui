<script lang="ts">
  import { Download, FileJson, Import, KeyRound, ShieldCheck, X } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { t } from "$lib/i18n";
  import type { ConfigurableProvider, DshClient, SettingsNamespace } from "$lib/dsh-client";
  import { AgentConfigError, assertTrust, bundleToDeepLink, parseBundleText, revealSecret, ACB_FILE_EXTENSION } from "$lib/agentconfig/codec";
  import {
    applyImportPlan,
    buildSharedBundle,
    hasActionableChanges,
    planImport,
    type ImportPlan,
    type ImportSkip,
    type LocalConfig,
  } from "$lib/agentconfig/transfer";
  import type { AcbBundle, AcbSecret } from "$lib/agentconfig/types";

  /**
   * AgentConfig Bundle 导入 / 导出。
   *
   * 导入：解析 → 预览 → 用户确认 → 只写入自己支持的项（models、凭据）。
   * 导出：只出 shared 免密包（DSH 凭据只能写不能读，导不出明文密钥）。
   */
  type Props = {
    client?: DshClient;
    providers: readonly ConfigurableProvider[];
    namespaces: readonly SettingsNamespace[];
    credentials: Readonly<Record<string, { configured?: boolean; writable?: boolean }>>;
    skills?: readonly { id: string; enabled?: boolean }[];
    quickActions?: readonly { label: string; prompt: string }[];
    agentPresets?: readonly { id: string; name?: string; model?: string; skillIds?: string[] }[];
    onImported?: () => void | Promise<void>;
    /** 系统深链或外部入口传进来的链接：只填进输入框并预览，绝不自动导入。 */
    incomingLink?: string;
    /** 每次投递递增的序号：同一条链接再次点开（重试）也能重新预览。 */
    incomingLinkToken?: number;
  };
  let { client, providers, namespaces, credentials, skills = [], quickActions = [], agentPresets = [], onImported, incomingLink, incomingLinkToken = 0 }: Props = $props();

  let busy = $state(false);
  let text = $state("");
  let password = $state("");
  let bundle = $state<AcbBundle>();
  let revealed = $state<AcbSecret>();
  let error = $state("");
  let notice = $state("");
  let imported = $state<{
    models: string[];
    credentials: string[];
    failed: { target: string; reason: string }[];
    skipped: readonly ImportSkip[];
  }>();
  let exported = $state<{ link: string; file: string }>();

  const local = $derived<LocalConfig>({
    providers, namespaces, credentials, skills, quickActions, agentPresets,
  });

  // 计划从 bundle + 本地配置派生：冷启动时深链可能早于 DSH 配置加载，
  // 用派生值可以在 providers/settings 到位后自动重算，而不是留下一个空计划。
  const plan = $derived<ImportPlan | undefined>(bundle ? planImport(bundle, local, revealed) : undefined);

  let handledLink = "";
  let handledToken = -1;
  $effect(() => {
    // 序号变化就算一次新投递：用户再点一次同一条链接时也能重新预览（例如上次失败了）。
    if (!incomingLink || (incomingLink === handledLink && incomingLinkToken === handledToken)) return;
    handledLink = incomingLink;
    handledToken = incomingLinkToken;
    text = incomingLink;
    void preview();
  });

  function reset(): void {
    bundle = undefined;
    revealed = undefined;
    password = "";
    error = "";
    notice = "";
  }

  // 多条深链连投递时，解密/解析是异步的：只允许最新一次预览提交结果，
  // 否则旧链接可能后到并覆盖用户刚看到的新链接。
  let previewGeneration = 0;
  async function preview(): Promise<void> {
    const generation = ++previewGeneration;
    reset();
    busy = true;
    try {
      const parsed = parseBundleText(text);
      const secret = parsed.payload.alg === "none" ? await revealSecret(parsed) : undefined;
      // shared 包携带凭据、或明文载荷携带凭据，都必须在预览阶段就拒绝，不能等到写入。
      assertTrust(parsed, secret);
      if (generation !== previewGeneration) return;
      revealed = secret;
      bundle = parsed;
    } catch (failure) {
      if (generation !== previewGeneration) return;
      error = describeFailure(failure);
    } finally {
      if (generation === previewGeneration) busy = false;
    }
  }

  async function unlock(): Promise<void> {
    if (!bundle) return;
    error = "";
    busy = true;
    try {
      const secret = await revealSecret(bundle, password);
      assertTrust(bundle, secret);
      revealed = secret;
      password = "";
    } catch (failure) {
      error = describeFailure(failure);
    } finally {
      busy = false;
    }
  }

  async function apply(): Promise<void> {
    if (!client || !plan || !bundle) return;
    busy = true;
    error = "";
    try {
      const result = await applyImportPlan(plan, client, local, revealed);
      imported = {
        models: [...result.models],
        credentials: [...result.credentials],
        failed: [...result.failed],
        skipped: [...result.skipped],
      };
      notice = t("settings.agentConfigImported", {
        models: String(result.models.length),
        credentials: String(result.credentials.length),
      });
      bundle = undefined;
      revealed = undefined;
      text = "";
      await onImported?.();
    } catch (failure) {
      error = describeFailure(failure);
    } finally {
      busy = false;
    }
  }

  async function exportBundle(): Promise<void> {
    busy = true;
    error = "";
    exported = undefined;
    try {
      const bundle = await buildSharedBundle(local, { quickActions: true });
      exported = {
        link: bundleToDeepLink(bundle),
        file: JSON.stringify(bundle, null, 2),
      };
      notice = t("settings.agentConfigExported");
    } catch (failure) {
      error = describeFailure(failure);
    } finally {
      busy = false;
    }
  }

  async function readFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    text = await file.text();
    input.value = "";
    await preview();
  }

  function download(): void {
    if (!exported) return;
    const blob = new Blob([exported.file], { type: "application/x-agentconfig+json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `anyong-agent${ACB_FILE_EXTENSION}`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function describeFailure(failure: unknown): string {
    if (failure instanceof AgentConfigError) {
      const reasons: Record<string, string> = {
        "not-a-bundle": t("settings.agentConfigErrorNotBundle"),
        "unsupported-version": t("settings.agentConfigErrorVersion"),
        "too-large": t("settings.agentConfigErrorTooLarge"),
        "wrong-password": t("settings.agentConfigErrorPassword"),
        "trust-violation": t("settings.agentConfigErrorTrust"),
        "invalid-deep-link": t("settings.agentConfigErrorLink"),
        "invalid-iterations": t("settings.agentConfigErrorIterations"),
      };
      return reasons[failure.code] ?? t("settings.agentConfigErrorInvalid");
    }
    return failure instanceof Error ? failure.message : String(failure);
  }

  const skipped = $derived<readonly ImportSkip[]>(plan?.skipped ?? []);
  const additions = $derived(plan?.models.filter((item) => item.action === "add") ?? []);
  const existing = $derived(plan?.models.filter((item) => item.action === "unchanged") ?? []);
  const writableCredentials = $derived(plan?.credentials.filter((item) => item.action === "set") ?? []);
</script>

<section class="agent-config" aria-label={t("settings.agentConfigTitle")}>
  <header>
    <div>
      <div class="section-label">{t("settings.agentConfigSection")}</div>
      <h3>{t("settings.agentConfigTitle")}</h3>
      <p>{t("settings.agentConfigDesc")}</p>
    </div>
  </header>

  <div class="agent-config-grid">
    <div class="agent-config-panel">
      <h4><Import size={14} />{t("settings.agentConfigImportTitle")}</h4>
      <label class="agent-config-field">
        <span>{t("settings.agentConfigImportLabel")}</span>
        <textarea
          bind:value={text}
          rows="3"
          placeholder="agentconfig://import?v=1&bundle=…"
          aria-label={t("settings.agentConfigImportLabel")}
        ></textarea>
      </label>
      <div class="agent-config-actions">
        <Button size="sm" variant="outline" disabled={busy || !text.trim()} onclick={() => void preview()}>{t("settings.agentConfigPreview")}</Button>
        <label class="agent-config-file">
          <FileJson size={14} />{t("settings.agentConfigChooseFile")}
          <input type="file" accept={`${ACB_FILE_EXTENSION},application/json`} onchange={(event) => void readFile(event)} />
        </label>
      </div>

      {#if plan}
        <div class="agent-config-preview" aria-label={t("settings.agentConfigPreviewTitle")}>
          <div class="agent-config-preview-head">
            <strong>{plan.label}</strong>
            <span class="agent-config-badge">{plan.trust}</span>
            {#if plan.encrypted}<span class="agent-config-badge encrypted"><KeyRound size={12} />{t("settings.agentConfigEncrypted")}</span>{/if}
            <button type="button" class="agent-config-close" aria-label={t("common.cancel")} onclick={reset}><X size={13} /></button>
          </div>
          <ul class="agent-config-facts">
            <li>{t("settings.agentConfigModelsFact", { add: String(additions.length), existing: String(existing.length) })}</li>
            <li>{t("settings.agentConfigCredentialsFact", { set: String(writableCredentials.length), keep: String(plan.credentials.filter((item) => item.action === "keep").length) })}</li>
          </ul>
          {#if additions.length}
            <details>
              <summary>{t("settings.agentConfigShowModels")}</summary>
              <ul class="agent-config-list">
                {#each additions as item (item.provider + item.id)}<li>{item.provider} / {item.id}</li>{/each}
              </ul>
            </details>
          {/if}
          {#if skipped.length}
            <div class="agent-config-skipped">
              <strong>{t("settings.agentConfigSkippedTitle")}</strong>
              {#each skipped as item (`${item.section}:${item.reason}:${item.items.join(",")}`)}
                <p><span class="agent-config-badge">{item.section}</span>{item.reason}{#if item.items.length}<small>{item.items.slice(0, 6).join("、")}{item.items.length > 6 ? "…" : ""}</small>{/if}</p>
              {/each}
            </div>
          {/if}
          {#if plan.needsPassword}
            <div class="agent-config-unlock">
              <label class="agent-config-field">
                <span>{t("settings.agentConfigPassword")}</span>
                <input type="password" autocomplete="off" bind:value={password} onkeydown={(event) => { if (event.key === "Enter") { event.preventDefault(); void unlock(); } }} />
              </label>
              <Button size="sm" disabled={busy || !password} onclick={() => void unlock()}>{t("settings.agentConfigUnlock")}</Button>
            </div>
          {:else}
            <div class="agent-config-actions">
              <Button size="sm" disabled={busy || !hasActionableChanges(plan)} onclick={() => void apply()}>{t("settings.agentConfigApply")}</Button>
              {#if !hasActionableChanges(plan)}<small>{t("settings.agentConfigNothingToApply")}</small>{/if}
            </div>
          {/if}
        </div>
      {/if}

      {#if imported}
        <div class="agent-config-result" role="status">
          <p>{notice}</p>
          {#if imported.failed.length}
            <ul>{#each imported.failed as item (item.target)}<li>{item.target}：{item.reason}</li>{/each}</ul>
          {/if}
          {#if imported.skipped.length}
            <p class="agent-config-hint">{t("settings.agentConfigSkippedTitle")}</p>
            <ul>
              {#each imported.skipped as item (`${item.section}:${item.reason}:${item.items.join(",")}`)}
                <li>{item.section}：{item.reason}{#if item.items.length}（{item.items.join("、")}）{/if}</li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
    </div>

    <div class="agent-config-panel">
      <h4><ShieldCheck size={14} />{t("settings.agentConfigExportTitle")}</h4>
      <p class="agent-config-hint">{t("settings.agentConfigExportDesc")}</p>
      <div class="agent-config-actions">
        <Button size="sm" variant="outline" disabled={busy} onclick={() => void exportBundle()}>{t("settings.agentConfigBuild")}</Button>
        {#if exported}<Button size="sm" variant="ghost" onclick={download}><Download size={13} />{t("settings.agentConfigDownload")}</Button>{/if}
      </div>
      {#if exported}
        <label class="agent-config-field">
          <span>{t("settings.agentConfigLink")}</span>
          <textarea readonly rows="3" value={exported.link} aria-label={t("settings.agentConfigLink")}></textarea>
        </label>
      {/if}
    </div>
  </div>

  {#if error}<p class="agent-config-error" role="alert">{error}</p>{/if}
  {#if notice && !imported}<p class="agent-config-notice" role="status">{notice}</p>{/if}
</section>

<style>
  .agent-config { display: grid; gap: 12px; padding: 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--card); }
  .agent-config h3 { margin: 2px 0 4px; font-size: 14px; }
  .agent-config p { margin: 0; font-size: 12px; color: var(--muted-foreground); overflow-wrap: anywhere; }
  .agent-config-grid { display: grid; gap: 14px; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }
  .agent-config-panel { display: grid; gap: 8px; min-width: 0; padding: 12px; border: 1px solid var(--border); border-radius: 6px; }
  .agent-config-panel h4 { display: flex; align-items: center; gap: 6px; margin: 0; font-size: 12px; color: var(--muted-foreground); }
  .agent-config-field { display: grid; gap: 4px; min-width: 0; font-size: 12px; }
  .agent-config-field textarea, .agent-config-field input { width: 100%; min-width: 0; padding: 6px 8px; border: 1px solid var(--border); border-radius: 5px; background: var(--background); color: var(--foreground); font-size: 12px; font-family: inherit; }
  .agent-config-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .agent-config-file { position: relative; display: inline-flex; align-items: center; gap: 6px; padding: 5px 8px; border: 1px solid var(--border); border-radius: 5px; font-size: 12px; cursor: pointer; }
  .agent-config-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
  .agent-config-preview { display: grid; gap: 8px; padding: 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--background); }
  .agent-config-preview-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
  .agent-config-preview-head strong { flex: 1; min-width: 120px; font-size: 13px; overflow-wrap: anywhere; }
  .agent-config-badge { display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px; border: 1px solid var(--border); border-radius: 999px; font-size: 10px; text-transform: uppercase; letter-spacing: .04em; }
  .agent-config-badge.encrypted { text-transform: none; letter-spacing: 0; }
  .agent-config-close { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 4px; color: var(--muted-foreground); }
  .agent-config-facts { margin: 0; padding-left: 16px; font-size: 12px; }
  .agent-config-list { margin: 4px 0 0; padding-left: 16px; font-size: 12px; overflow-wrap: anywhere; }
  .agent-config-skipped { display: grid; gap: 4px; font-size: 12px; }
  .agent-config-skipped p { display: grid; gap: 3px; color: var(--muted-foreground); }
  .agent-config-skipped small { color: var(--muted-foreground); opacity: .85; }
  .agent-config-unlock { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
  .agent-config-unlock .agent-config-field { flex: 1; min-width: 160px; }
  .agent-config-result { display: grid; gap: 4px; font-size: 12px; }
  .agent-config-error { color: var(--destructive); }
  .agent-config-hint { font-size: 12px; color: var(--muted-foreground); }
</style>