<script lang="ts">
  import { RefreshCw, Search } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { Input } from "$components/ui/input";
  import { DataState, StatusBadge } from "@svadmin/ui";
  import type { ConfigurableProvider, DiscoveredModel, DshClient } from "$lib/dsh-client";

  let { client, providers, onSelectNamespace }: { client: DshClient; providers: ConfigurableProvider[]; onSelectNamespace?: (ns: string) => void } = $props();
  let selectedProvider = $state("");
  let baseURL = $state("");
  let api = $state("");
  let apiKey = $state("");
  let discovered = $state<DiscoveredModel[]>([]);
  let busy = $state(false);
  let error = $state("");
  const selected = $derived(providers.find((item) => item.provider === selectedProvider) || providers[0]);

  async function discover(): Promise<void> {
    if (!selected) return;
    busy = true; error = ""; discovered = [];
    try {
      const result = await client.discoverModels({
        settingsNs: selected.settingsNs,
        provider: selected.provider,
        ...(baseURL.trim() ? { baseURL: baseURL.trim() } : {}),
        ...(api.trim() ? { api: api.trim() } : {}),
        ...(apiKey ? { apiKey } : {}),
      });
      discovered = result.models;
    } catch (e) { error = e instanceof Error ? e.message : String(e); }
    finally { apiKey = ""; busy = false; }
  }
</script>

<section class="provider-workbench">
  {#if providers.length === 0}<DataState state="empty" title="暂无 Provider" description="官方 DSH 尚未返回可配置 Provider。" />{:else}
    <div class="provider-list">{#each providers as provider (provider.provider)}<button class:chosen={selected?.provider === provider.provider} onclick={() => selectedProvider = provider.provider}><span><strong>{provider.displayName}</strong><small>{provider.provider} · {provider.settingsNs}</small></span><StatusBadge status={provider.active ? "success" : "neutral"} label={provider.active ? "已启用" : "未启用"} /></button>{/each}</div>
    {#if selected}<div class="provider-discovery"><div class="provider-discovery-heading"><div><strong>发现 {selected.displayName} 模型</strong><small>临时凭据只发送给官方 DSH，本页面不会保存或回显。</small></div><Button variant="ghost" size="sm" onclick={() => onSelectNamespace?.(selected.settingsNs)}>编辑配置</Button></div><div class="provider-discovery-form"><Input aria-label="Provider Base URL" placeholder="Base URL（可选）" bind:value={baseURL} /><Input aria-label="Provider API 类型" placeholder="API 类型（可选）" bind:value={api} /><Input aria-label="临时 Provider API Key" type="password" autocomplete="off" placeholder="临时 API Key（可选）" bind:value={apiKey} /><Button size="sm" disabled={busy} onclick={() => void discover()}>{#if busy}<RefreshCw class="animate-spin" size={13} />{:else}<Search size={13} />{/if}发现</Button></div>{#if error}<div class="management-feedback error">{error}</div>{/if}{#if discovered.length > 0}<div class="discovered-models">{#each discovered as model (model.id)}<div><strong>{model.name || model.id}</strong><small>{model.id}{#if model.contextWindow} · 上下文 {model.contextWindow.toLocaleString()}{/if}{#if model.maxTokens} · 输出 {model.maxTokens.toLocaleString()}{/if}</small></div>{/each}</div>{/if}</div>{/if}
  {/if}
</section>
