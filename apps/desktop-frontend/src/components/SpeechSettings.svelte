<script lang="ts">
  import { onDestroy } from "svelte";
  import { Download, ExternalLink, Mic, RefreshCw, X } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { SettingsGroup, StatusBadge } from "@svadmin/ui";
  import type { DshClient, SpeechCatalog, SpeechProviderView } from "$lib/dsh-client";
  import type { MicrophoneAccessStatus } from "../electron";
  import { t } from "$lib/i18n";

  interface Props {
    readonly client?: DshClient;
  }

  let { client }: Props = $props();
  let catalog = $state<SpeechCatalog>();
  let permission = $state<MicrophoneAccessStatus>("unknown");
  let loading = $state(false);
  let error = $state("");
  let activeProvider = $state("");
  let pollTimer: ReturnType<typeof setInterval> | undefined;
  let loadedClient: DshClient | undefined;

  function clearPoll(): void {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = undefined;
  }

  function isPreparing(provider: SpeechProviderView | undefined): boolean {
    const phase = provider?.preparation?.phase;
    return phase === "checking" || phase === "downloading" || phase === "loading" || phase === "waking" || phase === "cancelling";
  }

  function schedulePoll(): void {
    if (pollTimer || !client) return;
    pollTimer = setInterval(async () => {
      if (!client) return clearPoll();
      try {
        const next = await client.speechCatalog();
        catalog = next;
        if (!next.providers.some(isPreparing)) clearPoll();
      } catch {
        clearPoll();
      }
    }, 1500);
  }

  async function loadPermission(): Promise<void> {
    if (!window.voltDesktop?.microphoneAccess) {
      permission = "unknown";
      return;
    }
    try {
      permission = await window.voltDesktop.microphoneAccess();
    } catch {
      permission = "unknown";
    }
  }

  async function refresh(showSpinner = true): Promise<void> {
    if (!client) return;
    if (showSpinner) loading = true;
    error = "";
    try {
      const [next] = await Promise.all([client.speechCatalog(), loadPermission()]);
      catalog = next;
      if (next.providers.some(isPreparing)) schedulePoll();
    } catch (reason) {
      error = t("settings.voiceLoadFailed", { message: reason instanceof Error ? reason.message : String(reason) });
    } finally {
      if (showSpinner) loading = false;
    }
  }

  async function prepare(provider: SpeechProviderView): Promise<void> {
    if (!client || activeProvider) return;
    activeProvider = provider.id;
    error = "";
    try {
      await client.speechPrepare(provider.id);
      await refresh(false);
      schedulePoll();
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      activeProvider = "";
    }
  }

  async function cancelPreparation(provider: SpeechProviderView): Promise<void> {
    if (!client || activeProvider) return;
    activeProvider = provider.id;
    try {
      await client.speechCancelPreparation(provider.id);
      await refresh(false);
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      activeProvider = "";
      clearPoll();
    }
  }

  async function openMicrophoneSettings(): Promise<void> {
    try {
      await window.voltDesktop?.openMicrophoneSettings();
    } catch {
      // 系统设置入口不可用时保留当前状态说明。
    }
  }

  function permissionLabel(): string {
    if (permission === "granted") return t("settings.voicePermissionGranted");
    if (permission === "denied") return t("settings.voicePermissionDenied");
    if (permission === "restricted") return t("settings.voicePermissionRestricted");
    if (permission === "not-determined") return t("settings.voicePermissionNotDetermined");
    return t("settings.voicePermissionUnknown");
  }

  function permissionHint(): string {
    if (permission === "granted") return t("settings.voicePermissionGrantedHint");
    if (permission === "unknown" || permission === "not-determined") return t("settings.voicePermissionUnknownHint");
    return t("settings.voicePermissionDeniedHint");
  }

  function phaseLabel(provider: SpeechProviderView): string {
    const phase = provider.preparation?.phase ?? "ready";
    if (phase === "ready" || phase === "standby") return t("settings.voiceReady");
    if (phase === "failed") return t("settings.voiceFailed");
    if (isPreparing(provider)) return t("settings.voicePreparing");
    return t("settings.voiceUnprepared");
  }

  function phaseStatus(provider: SpeechProviderView): "success" | "warning" | "neutral" {
    const phase = provider.preparation?.phase ?? "ready";
    if (phase === "ready" || phase === "standby") return "success";
    if (phase === "failed") return "warning";
    return "neutral";
  }

  function locationLabel(provider: SpeechProviderView): string {
    return provider.location === "cloud" ? t("settings.voiceLocationCloud") : t("settings.voiceLocationHost");
  }

  function formatBytes(value: number): string {
    if (value >= 1024 * 1024 * 1024) return `${(value / (1024 * 1024 * 1024)).toFixed(1)} GiB`;
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KiB`;
    return `${value} B`;
  }

  $effect(() => {
    if (client === loadedClient) return;
    loadedClient = client;
    clearPoll();
    catalog = undefined;
    if (client) void refresh();
  });

  onDestroy(clearPoll);
</script>

<SettingsGroup title={t("settings.voicePermissionTitle")} description={t("settings.voicePermissionDesc")}>
  <div class="speech-permission">
    <div class="speech-permission-copy">
      <Mic size={16} aria-hidden="true" />
      <span>{permissionLabel()}</span>
    </div>
    <div class="speech-actions">
      <StatusBadge status={permission === "granted" ? "success" : permission === "denied" || permission === "restricted" ? "warning" : "neutral"} label={permissionLabel()} />
      {#if window.voltDesktop?.openMicrophoneSettings}
        <Button variant="outline" size="sm" onclick={() => void openMicrophoneSettings()}>
          <ExternalLink size={13} />{t("composer.openMicrophoneSettings")}
        </Button>
      {/if}
      <Button variant="ghost" size="sm" disabled={loading} onclick={() => void refresh()}>
        <RefreshCw size={13} class={loading ? "spin" : undefined} />{t("settings.voiceRefresh")}
      </Button>
    </div>
  </div>
  <p class="speech-hint">{permissionHint()}</p>
</SettingsGroup>

<SettingsGroup title={t("settings.voiceModelsTitle")} description={t("settings.voiceModelsDesc")}>
  {#if !client}
    <p class="speech-hint">{t("composer.voiceModelUnavailable")}</p>
  {:else if loading && !catalog}
    <p class="speech-hint" role="status">{t("settings.voicePreparing")}…</p>
  {:else if catalog && catalog.providers.length === 0}
    <p class="speech-hint" role="status">{t("settings.voiceNoProvider")}</p>
    <p class="speech-hint">{t("settings.voiceNoProviderHint")}</p>
  {:else if catalog}
    <div class="speech-provider-list">
      {#each catalog.providers as provider (provider.id)}
        <div class="speech-provider">
          <div class="speech-provider-copy">
            <strong>{provider.name || provider.id}</strong>
            <small>{locationLabel(provider)} · {t("settings.voiceLanguage", { language: catalog.selection?.language || provider.languages?.[0] || "zh" })}</small>
            {#if provider.preparation?.phase === "downloading"}
              <small>
                {t("settings.voiceDownloadProgress", {
                  done: formatBytes(provider.preparation.completedBytes),
                  total: provider.preparation.totalBytes ? formatBytes(provider.preparation.totalBytes) : "?",
                })}
              </small>
            {:else if provider.preparation?.phase === "failed"}
              <small class="speech-error" role="alert">{t("settings.voiceFailedHint", { message: provider.preparation.message })}</small>
            {/if}
          </div>
          <div class="speech-actions">
            <StatusBadge status={phaseStatus(provider)} label={phaseLabel(provider)} />
            {#if isPreparing(provider)}
              <Button variant="ghost" size="sm" disabled={!!activeProvider} onclick={() => void cancelPreparation(provider)}>
                <X size={13} />{t("settings.voiceCancel")}
              </Button>
            {:else if provider.preparation?.phase !== "ready" && provider.preparation?.phase !== "standby"}
              <Button variant="outline" size="sm" disabled={!!activeProvider} onclick={() => void prepare(provider)}>
                <Download size={13} />{t("settings.voiceDownload")}
              </Button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
  {#if error}<p class="speech-error" role="alert">{error}</p>{/if}
</SettingsGroup>

<style>
  .speech-permission, .speech-provider { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-width: 0; }
  .speech-permission-copy { display: flex; align-items: center; gap: 8px; font-weight: 600; }
  .speech-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; }
  .speech-hint { margin: 8px 0 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.55; }
  .speech-provider-list { display: grid; gap: 8px; }
  .speech-provider { padding: 10px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--background); }
  .speech-provider-copy { display: grid; gap: 3px; min-width: 0; }
  .speech-provider-copy strong { font-size: 13px; }
  .speech-provider-copy small { color: var(--muted-foreground); font-size: 11.5px; overflow-wrap: anywhere; }
  .speech-error { margin: 8px 0 0; color: var(--destructive); font-size: 12px; line-height: 1.55; overflow-wrap: anywhere; }
  @media (max-width: 760px) {
    .speech-permission, .speech-provider { align-items: flex-start; flex-direction: column; }
  }
</style>