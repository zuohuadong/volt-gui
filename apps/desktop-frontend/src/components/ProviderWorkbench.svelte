<script lang="ts">
  import { ChevronDown, CircleAlert, CircleCheck, KeyRound, RefreshCw, Search } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { Input } from "$components/ui/input";
  import { DataState, StatusBadge } from "@svadmin/ui";
  import type { ConfigurableProvider, CredentialView, DiscoveredModel, DshClient, SettingsNamespace } from "$lib/dsh-client";
  import {
    credentialRefTitle,
    providerCredentialRef,
    providerDefaultApi,
    providerDefaultBaseURL,
  } from "$lib/model-catalog";
  import { i18n, t } from "$lib/i18n";
  import { providerDisplayCopy } from "$lib/provider-i18n";
  import { userFacingError } from "$lib/user-error";

  let {
    client,
    providers,
    namespaces = [],
    credentials = {},
    onSelectNamespace,
    onCredentialSaved,
    onBundledCredentialReset,
  }: {
    client: DshClient;
    providers: ConfigurableProvider[];
    namespaces?: SettingsNamespace[];
    credentials?: Record<string, CredentialView>;
    onSelectNamespace?: (ns: string) => void;
    onCredentialSaved?: (ref: string) => void | Promise<void>;
    onBundledCredentialReset?: () => void | Promise<void>;
  } = $props();

  let selectedProvider = $state("");
  let baseURLDraft = $state("");
  let apiDraft = $state("");
  let inlineKeyDraft = $state("");
  let savingKey = $state(false);
  let confirmingBundledReset = $state(false);
  let inlineKeyNotice = $state("");
  let discovered = $state<DiscoveredModel[]>([]);
  let busy = $state(false);
  let error = $state("");

  const orderedProviders = $derived([...providers].sort((left, right) => Number(right.active === true) - Number(left.active === true)));
  const selected = $derived(orderedProviders.find((item) => item.provider === selectedProvider) || orderedProviders[0]);
  const selectedProviderId = $derived(selected?.provider);
  const currentLocale = $derived(i18n.locale);
  const discoverySupported = $derived(selected?.settingsNs !== "llm-deepseek");
  const defaultBaseURL = $derived(selected ? providerDefaultBaseURL(namespaces, providers, selected.provider) : "");
  const defaultApi = $derived(selected ? providerDefaultApi(namespaces, providers, selected.provider) : "");
  const credentialRef = $derived(selected ? providerCredentialRef(namespaces, providers, selected.provider) : undefined);
  const isCredentialConfigured = $derived(credentialRef ? !!credentials[credentialRef]?.configured : false);
  const isProviderActive = $derived(selected?.active === true);

  function providerCredential(provider: ConfigurableProvider): string | undefined {
    return providerCredentialRef(namespaces, providers, provider.provider);
  }

  function providerConfigured(provider: ConfigurableProvider): boolean {
    const ref = providerCredential(provider);
    return !!ref && credentials[ref]?.configured === true;
  }

  // 筛选或切换服务时清空临时接入信息，避免把密钥带到另一家服务。
  $effect(() => {
    selectedProviderId;
    resetProviderDrafts();
  });

  function resetProviderDrafts(): void {
    baseURLDraft = "";
    apiDraft = "";
    inlineKeyDraft = "";
    confirmingBundledReset = false;
    error = "";
    inlineKeyNotice = "";
    discovered = [];
  }

  async function saveInlineKey(): Promise<void> {
    const targetRef = credentialRef;
    const targetProvider = selected?.provider;
    const raw = inlineKeyDraft.trim();
    const key = raw.replace(/^[\"']|[\"']$/g, "").trim();
    if (!client || !targetRef || !key || savingKey) return;
    savingKey = true;
    error = "";
    inlineKeyNotice = "";
    try {
      await client.setCredential(targetRef, key);
      if (selected?.provider === targetProvider) {
        inlineKeyDraft = "";
        inlineKeyNotice = t("settings.credentialSaved");
      }
      await onCredentialSaved?.(targetRef);
    } catch (e) {
      if (selected?.provider === targetProvider) error = userFacingError(e);
    } finally {
      savingKey = false;
    }
  }

  async function resetBundledCredential(): Promise<void> {
    if (busy || savingKey || !onBundledCredentialReset) return;
    if (!confirmingBundledReset) {
      confirmingBundledReset = true;
      return;
    }
    confirmingBundledReset = false;
    await onBundledCredentialReset();
  }

  async function discover(): Promise<void> {
    if (!selected || !discoverySupported || busy) return;
    const targetProvider = selected.provider;
    busy = true;
    error = "";
    inlineKeyNotice = "";
    discovered = [];
    try {
      const result = await client.discoverModels({
        settingsNs: selected.settingsNs,
        provider: selected.provider,
        baseURL: baseURLDraft.trim() || defaultBaseURL || undefined,
        api: apiDraft.trim() || defaultApi || undefined,
        apiKey: inlineKeyDraft.trim().replace(/^[\"']|[\"']$/g, "").trim() || undefined,
      });
      if (selected?.provider === targetProvider) discovered = result.models;
    } catch (e) {
      if (selected?.provider === targetProvider) error = userFacingError(e);
    }
    finally { busy = false; }
  }
</script>

<section class="provider-workbench">
  {#if providers.length === 0}<DataState state="empty" title={t("common.empty")} description={t("models.emptyProviders")} />{:else}
    <div class="provider-list">
      {#each orderedProviders as provider (provider.provider)}
        {@const providerCopy = providerDisplayCopy(provider, currentLocale)}
        <button class:chosen={selected?.provider === provider.provider} title={providerCopy.name} disabled={busy || savingKey} onclick={() => selectedProvider = provider.provider}>
          <span>
            <strong>{providerCopy.name}</strong>
            <small>{providerCopy.description || provider.provider}</small>
          </span>
          {#if providerCredential(provider)}
            <span class:configured={providerConfigured(provider)} class="provider-list-state" title={providerConfigured(provider) ? t("settings.configured") : t("settings.notConfigured")}></span>
          {/if}
          {#if provider.active}<CircleCheck size={13} aria-label={t("common.enabled")} />{/if}
        </button>
      {/each}
    </div>
    {#if selected}
      {@const selectedCopy = providerDisplayCopy(selected, currentLocale)}
      <div class="provider-discovery">
        <div class="provider-discovery-heading">
          <div>
            <strong>{selectedCopy.name}</strong>
            <small>{selectedCopy.description}</small>
          </div>
          <StatusBadge status={isProviderActive ? "success" : "neutral"} label={isProviderActive ? t("common.enabled") : t("common.disabled")} />
          <Button variant="outline" size="sm" onclick={() => onSelectNamespace?.(selected.settingsNs)}>{t("common.edit")}</Button>
        </div>

        <div class="provider-meta-summary">
          <div class="provider-meta-item">
            <span>{t("settings.providerId")}</span>
            <strong>{selected.provider}</strong>
          </div>
          <div class="provider-meta-item">
            <span>{t("models.baseUrl")}</span>
            <strong>{defaultBaseURL || t("common.default")}</strong>
          </div>
          {#if credentialRef}
            <div class="provider-meta-item">
              <span>{t("settings.credentialsSectionTitle")}</span>
              <strong>{isCredentialConfigured ? t("settings.configured") : t("settings.notConfigured")}</strong>
            </div>
          {/if}
        </div>

        {#if credentialRef}
          <div class="provider-quick-key">
            <div class="provider-quick-key-header">
              <strong>{credentialRefTitle(credentialRef)}</strong>
              <small>{isCredentialConfigured ? t("settings.configured") : t("settings.notConfigured")}</small>
            </div>
            <div class="provider-quick-key-form">
              <Input
                type="password"
                aria-label={t("models.keyPlaceholder")}
                placeholder={t("models.keyPlaceholder")}
                bind:value={inlineKeyDraft}
                onkeydown={(event) => { if (event.key === "Enter") void saveInlineKey(); }}
              />
              <Button size="sm" disabled={!inlineKeyDraft.trim() || savingKey} onclick={() => void saveInlineKey()}>
                <KeyRound size={13} />
                {t("models.saveKey")}
              </Button>
            </div>
            {#if credentialRef === "XG_GOMODEL_API_KEY" && onBundledCredentialReset}
              <div class="provider-quick-key-actions">
                <small>{t("settings.bundledCredentialHint")}</small>
                {#if confirmingBundledReset}
                  <Button variant="outline" size="sm" disabled={savingKey || busy} onclick={() => void resetBundledCredential()}>
                    <RefreshCw size={13} />
                    {t("settings.confirmRestoreBundledCredential")}
                  </Button>
                  <Button variant="ghost" size="sm" onclick={() => confirmingBundledReset = false}>
                    {t("common.cancel")}
                  </Button>
                {:else}
                  <Button variant="ghost" size="sm" disabled={savingKey || busy} onclick={() => void resetBundledCredential()}>
                    <RefreshCw size={13} />
                    {t("settings.restoreBundledCredential")}
                  </Button>
                {/if}
              </div>
            {/if}
          </div>
        {/if}

        {#if inlineKeyNotice}
          <div class="management-feedback success" style="margin-top: 8px;">
            <CircleCheck size={14} />
            <span>{inlineKeyNotice}</span>
          </div>
        {/if}

        {#if error}
          <div class="management-feedback error" style="margin-top: 8px;">
            <CircleAlert size={14} />
            <span>{error}</span>
          </div>
        {/if}

        {#if !discoverySupported}
          <div class="management-feedback" style="margin-top: 10px;">{t("models.providerConfiguredViaSettings")}</div>
        {:else}
          <details class="provider-discovery-settings">
            <summary><span><strong>{t("settings.providerAdvancedTitle")}</strong><small>{t("settings.providerAdvancedDesc")}</small></span><ChevronDown size={14} /></summary>
            <div class="provider-discovery-form">
              <Input aria-label={t("models.baseUrl")} placeholder={defaultBaseURL ? `${t("models.baseUrl")}（${defaultBaseURL}）` : t("models.baseUrl")} bind:value={baseURLDraft} />
              <Input aria-label={t("models.apiEndpoint")} placeholder={defaultApi ? `${t("models.apiEndpoint")}（${defaultApi}）` : t("models.apiEndpoint")} bind:value={apiDraft} />
              <Button size="sm" disabled={busy} onclick={() => void discover()}>
                {#if busy}<RefreshCw class="animate-spin" size={13} />{:else}<Search size={13} />{/if}
                {t("common.search")}
              </Button>
            </div>
            {#if discovered.length > 0}
              <div class="discovered-models">
                {#each discovered as model (model.id)}
                  <div>
                    <strong>{model.name || model.id}</strong>
                    <small>{model.id}{#if model.contextWindow} · {t("models.contextWindow", { count: model.contextWindow.toLocaleString() })}{/if}{#if model.maxTokens} · {t("models.maxTokens", { count: model.maxTokens.toLocaleString() })}{/if}</small>
                  </div>
                {/each}
              </div>
            {/if}
          </details>
        {/if}
      </div>
    {/if}
  {/if}
</section>
