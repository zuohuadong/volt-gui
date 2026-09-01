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
      inlineKeyNotice = "API Key 已安全保存，已写入单向安全存储";
      await onCredentialSaved?.(credentialRef);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
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
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
    finally { busy = false; }
  }
</script>

<section class="provider-workbench">
  {#if providers.length === 0}<DataState state="empty" title="暂无 Provider" description="官方 DSH 尚未返回可配置 Provider。" />{:else}
    <div class="provider-list">
      {#each providers as provider (provider.provider)}
        <button class:chosen={selected?.provider === provider.provider} onclick={() => { selectedProvider = provider.provider; error = ""; inlineKeyNotice = ""; discovered = []; }}>
          <span>
            <strong>{provider.displayName}</strong>
            <small>{provider.provider} · {provider.settingsNs}</small>
          </span>
          <StatusBadge status={provider.active ? "success" : "neutral"} label={provider.active ? "已启用" : "未启用"} />
        </button>
      {/each}
    </div>
    {#if selected}
      <div class="provider-discovery">
        <div class="provider-discovery-heading">
          <div>
            <strong>{selected.displayName} 配置与探测</strong>
            <small>内置参数来自配置，凭据单向写入本地安全存储。</small>
          </div>
          <Button variant="outline" size="sm" onclick={() => onSelectNamespace?.(selected.settingsNs)}>编辑配置</Button>
        </div>

        <div class="provider-meta-summary">
          <div class="provider-meta-item">
            <span>Base URL:</span>
            <strong>{defaultBaseURL || "默认 / 官方内置"}</strong>
          </div>
          {#if credentialRef}
            <div class="provider-meta-item">
              <span>凭据引用:</span>
              <strong>{credentialRef}</strong>
              <StatusBadge status={isCredentialConfigured ? "success" : "neutral"} label={isCredentialConfigured ? "已配置" : "未配置"} />
            </div>
          {/if}
        </div>

        {#if credentialRef}
          <div class="provider-quick-key">
            <div class="provider-quick-key-header">
              <strong>{credentialRefTitle(credentialRef)}</strong>
              <small>{isCredentialConfigured ? "已配置 · 可直接使用或填入新 Key 覆盖" : "未配置 · 请填入 API Key 并保存以启用"}</small>
            </div>
            <div class="provider-quick-key-form">
              <Input
                type="password"
                aria-label="Provider API Key"
                placeholder={isCredentialConfigured ? "已配置（输入新 Key 可覆盖更新）" : "输入 API Key 并保存"}
                bind:value={inlineKeyDraft}
                onkeydown={(event) => { if (event.key === "Enter") void saveInlineKey(); }}
              />
              <Button size="sm" disabled={!inlineKeyDraft.trim() || savingKey} onclick={() => void saveInlineKey()}>
                <KeyRound size={13} />
                {isCredentialConfigured ? "更新 Key" : "保存 Key"}
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
          <div class="management-feedback" style="margin-top: 10px;">该 Provider 暂不支持模型发现，请直接编辑配置中的模型目录。</div>
        {:else}
          <div class="provider-discovery-form">
            <Input aria-label="Provider Base URL" placeholder={defaultBaseURL ? `Base URL（默认 ${defaultBaseURL}）` : "Base URL（可选）"} bind:value={baseURLDraft} />
            <Input aria-label="Provider API 类型" placeholder={defaultApi ? `API 类型（默认 ${defaultApi}）` : "API 类型（可选）"} bind:value={apiDraft} />
            <Button size="sm" disabled={busy} onclick={() => void discover()}>
              {#if busy}<RefreshCw class="animate-spin" size={13} />{:else}<Search size={13} />{/if}
              发现模型
            </Button>
          </div>
          {#if discovered.length > 0}
            <div class="discovered-models">
              {#each discovered as model (model.id)}
                <div>
                  <strong>{model.name || model.id}</strong>
                  <small>{model.id}{#if model.contextWindow} · 上下文 {model.contextWindow.toLocaleString()}{/if}{#if model.maxTokens} · 输出 {model.maxTokens.toLocaleString()}{/if}</small>
                </div>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  {/if}
</section>
