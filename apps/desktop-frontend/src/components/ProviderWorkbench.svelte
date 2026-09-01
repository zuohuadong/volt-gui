<script lang="ts">
  import { CircleAlert, CircleCheck, KeyRound, RefreshCw, Search } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { Input } from "$components/ui/input";
  import { DataState, StatusBadge } from "@svadmin/ui";
  import type { ConfigurableProvider, CredentialView, DiscoveredModel, DshClient, SettingsNamespace } from "$lib/dsh-client";
  import {
    credentialRefTitle,
    providerCredentialRef,
    providerDefaultApi,
    providerDefaultBaseURL,
    resolveProviderSettings,
  } from "$lib/model-catalog";
  import { t } from "$lib/i18n";
  import { userFacingError } from "$lib/user-error";

  let {
    client,
    providers,
    namespaces = [],
    credentials = {},
    onSelectNamespace,
    onCredentialSaved,
  }: {
    client: DshClient;
    providers: ConfigurableProvider[];
    namespaces?: SettingsNamespace[];
    credentials?: Record<string, CredentialView>;
    onSelectNamespace?: (ns: string) => void;
    onCredentialSaved?: (ref: string) => void | Promise<void>;
  } = $props();

  let selectedProvider = $state("");
  let baseURLDraft = $state("");
  let apiDraft = $state("");
  let inlineKeyDraft = $state("");
  let savingKey = $state(false);
  let inlineKeyNotice = $state("");
  let discovered = $state<DiscoveredModel[]>([]);
  let busy = $state(false);
  let error = $state("");

  const selected = $derived(providers.find((item) => item.provider === selectedProvider) || providers[0]);
  const discoverySupported = $derived(selected?.settingsNs !== "llm-deepseek");
  const defaultBaseURL = $derived(selected ? providerDefaultBaseURL(namespaces, providers, selected.provider) : "");
  const defaultApi = $derived(selected ? providerDefaultApi(namespaces, providers, selected.provider) : "");
  const credentialRef = $derived(selected ? providerCredentialRef(namespaces, providers, selected.provider) : undefined);
  const isCredentialConfigured = $derived(credentialRef ? !!credentials[credentialRef]?.configured : false);

  async function saveInlineKey(): Promise<void> {
    if (!client || !credentialRef || !inlineKeyDraft.trim() || savingKey) return;
    savingKey = true;
    error = "";
    inlineKeyNotice = "";
    try {
      await client.setCredential(credentialRef, inlineKeyDraft.trim());
      inlineKeyDraft = "";
      inlineKeyNotice = t("settings.credentialSaved");
      await onCredentialSaved?.(credentialRef);
    } catch (e) {
      error = userFacingError(e);
    } finally {
      savingKey = false;
    }
  }

  async function discover(): Promise<void> {
    if (!selected || !discoverySupported || busy) return;
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
        apiKey: inlineKeyDraft.trim() || undefined,
      });
      discovered = result.models;
    } catch (e) { error = userFacingError(e); }
    finally { busy = false; }
  }
</script>

<section class="provider-workbench">
  {#if providers.length === 0}<DataState state="empty" title={t("common.empty")} description={t("models.emptyProviders")} />{:else}
    <div class="provider-list">
      {#each providers as provider (provider.provider)}
        <button class:chosen={selected?.provider === provider.provider} onclick={() => { selectedProvider = provider.provider; error = ""; inlineKeyNotice = ""; discovered = []; }}>
          <span>
            <strong>{provider.displayName}</strong>
            <small>{provider.provider} · {provider.settingsNs}</small>
          </span>
          <StatusBadge status={provider.active ? "success" : "neutral"} label={provider.active ? t("common.enabled") : t("common.disabled")} />
        </button>
      {/each}
    </div>
    {#if selected}
      <div class="provider-discovery">
        <div class="provider-discovery-heading">
          <div>
            <strong>{selected.displayName}</strong>
            <small>{t("models.description")}</small>
          </div>
          <Button variant="outline" size="sm" onclick={() => onSelectNamespace?.(selected.settingsNs)}>{t("common.edit")}</Button>
        </div>

        <div class="provider-meta-summary">
          <div class="provider-meta-item">
            <span>Base URL:</span>
            <strong>{defaultBaseURL || t("common.default")}</strong>
          </div>
          {#if credentialRef}
            <div class="provider-meta-item">
              <span>{t("overview.settingsTitle")}:</span>
              <strong>{credentialRef}</strong>
              <StatusBadge status={isCredentialConfigured ? "success" : "neutral"} label={isCredentialConfigured ? t("common.enabled") : t("common.disabled")} />
            </div>
          {/if}
        </div>

        {#if credentialRef}
          <div class="provider-quick-key">
            <div class="provider-quick-key-header">
              <strong>{credentialRefTitle(credentialRef)}</strong>
              <small>{isCredentialConfigured ? t("common.enabled") : t("common.disabled")}</small>
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
          <div class="provider-discovery-form">
            <Input aria-label="Base URL" placeholder={defaultBaseURL ? `Base URL (${defaultBaseURL})` : "Base URL"} bind:value={baseURLDraft} />
            <Input aria-label="API" placeholder={defaultApi ? `API (${defaultApi})` : "API"} bind:value={apiDraft} />
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
        {/if}
      </div>
    {/if}
  {/if}
</section>
