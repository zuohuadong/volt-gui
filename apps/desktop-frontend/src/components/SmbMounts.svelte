<script lang="ts">
  import { onMount } from "svelte";
  import { ExternalLink, HardDrive, Link, Link2Off, Plus, RefreshCw, Trash2 } from "@lucide/svelte";
import { Button } from "$components/ui/button";
import { Input } from "$components/ui/input";
import type { DesktopShellApi, SmbMountRequest, SmbMountView } from "../electron";
import { t } from "$lib/i18n";

interface Props { readonly shell?: DesktopShellApi; }
  let { shell }: Props = $props();
  let mounts = $state<SmbMountView[]>([]);
  let displayName = $state("");
  let remotePath = $state("");
  let localPath = $state("");
  let autoMount = $state(false);
  let busy = $state("");
  let error = $state("");
  let notice = $state("");

  function getStatusLabel(status: SmbMountView["status"]): string {
    switch (status) {
      case "mounted": return t("smb.statusMounted");
      case "unmounted": return t("smb.statusUnmounted");
      case "offline": return t("smb.statusOffline");
      case "requires_credentials": return t("smb.statusRequiresCreds");
      case "error": return t("smb.statusError");
      case "unsupported": return t("smb.statusUnsupported");
      default: return status;
    }
  }

  function desktopShell(): DesktopShellApi | undefined { return shell ?? window.voltDesktop; }

  onMount(() => { void refresh(); });

  async function refresh(): Promise<void> {
    const api = desktopShell();
    if (!api) { mounts = []; error = t("smb.bridgeNotLoaded"); return; }
    busy = "refresh"; error = "";
    try { mounts = await api.smbList(); }
    catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }
    finally { busy = ""; }
  }

  async function mount(request: SmbMountRequest): Promise<void> {
    const api = desktopShell();
    if (!api) return;
    busy = request.id || "mount"; error = ""; notice = "";
    try {
      const result = await api.smbMount(request);
      mounts = await api.smbList();
      if (result.status === "mounted") {
        notice = t("smb.mountedNotice", { name: result.displayName, path: result.localPath });
        displayName = ""; remotePath = ""; localPath = ""; autoMount = false;
      } else error = result.lastError || getStatusLabel(result.status);
    } catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }
    finally { busy = ""; }
  }

  async function mountNew(): Promise<void> {
    await mount({ displayName: displayName.trim(), remotePath: remotePath.trim(), localPath: localPath.trim(), autoMount });
  }

  async function unmount(mountView: SmbMountView): Promise<void> {
    const api = desktopShell();
    if (!api) return;
    busy = mountView.id; error = "";
    try {
      const result = await api.smbUnmount(mountView.id);
      mounts = mounts.map((item) => item.id === result.id ? result : item);
      if (result.status !== "unmounted") error = result.lastError || getStatusLabel(result.status);
    } catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }
    finally { busy = ""; }
  }

  async function remove(mountView: SmbMountView): Promise<void> {
    const api = desktopShell();
    if (!api || !window.confirm(t("smb.removeConfirm", { name: mountView.displayName }))) return;
    busy = mountView.id; error = "";
    try { await api.smbRemove(mountView.id); mounts = mounts.filter((item) => item.id !== mountView.id); }
    catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }
    finally { busy = ""; }
  }

  async function open(mountView: SmbMountView): Promise<void> {
    const api = desktopShell();
    if (!api) return;
    busy = mountView.id; error = "";
    try { const result = await api.smbOpen(mountView.localPath); if (!result.opened) error = result.error; }
    catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }
    finally { busy = ""; }
  }
</script>

<section class="smb-mounts" aria-label={t("smb.title")}>
  <div class="smb-mounts__header">
    <div><span class="section-label">{t("nav.mounts")}</span><h2>{t("smb.title")}</h2><p>{t("smb.description")}</p></div>
    <Button variant="outline" size="sm" disabled={busy === "refresh"} onclick={() => void refresh()}><RefreshCw size={14} />{t("common.refresh")}</Button>
  </div>
  {#if error}<div class="smb-feedback error" role="alert"><Link2Off size={14} /><span>{error}</span></div>{/if}
  {#if notice}<div class="smb-feedback success" role="status"><Link size={14} /><span>{notice}</span></div>{/if}
  <div class="smb-add-form">
    <Input class="smb-input" aria-label={t("smb.shareName")} placeholder={t("smb.shareName")} bind:value={displayName} />
    <Input class="smb-input" aria-label={t("smb.remotePath")} placeholder={t("smb.remotePath")} bind:value={remotePath} />
    <Input class="smb-input" aria-label={t("smb.localDrive")} placeholder={t("smb.localDrive")} bind:value={localPath} />
    <label class="smb-auto-mount"><input type="checkbox" bind:checked={autoMount} />{t("smb.autoMount")}</label>
    <Button size="sm" disabled={!displayName.trim() || !remotePath.trim() || !localPath.trim() || !!busy} onclick={() => void mountNew()}><Plus size={14} />{t("smb.mountBtn")}</Button>
  </div>
  {#if mounts.length === 0}
    <div class="smb-empty"><HardDrive size={20} /><strong>{t("smb.empty")}</strong><span>{t("smb.emptyDesc")}</span></div>
  {:else}
    <div class="smb-list">
      {#each mounts as mountView (mountView.id)}
        <article class="smb-row">
          <span class="smb-icon"><HardDrive size={16} /></span>
          <div class="smb-copy"><strong>{mountView.displayName}</strong><small>{mountView.remotePath} → {mountView.localPath}</small></div>
          <span class={`smb-status smb-status--${mountView.status}`}>{getStatusLabel(mountView.status)}</span>
          <div class="smb-actions">
            {#if mountView.status === "mounted"}<Button variant="ghost" size="icon-sm" aria-label={t("common.open")} title={t("common.open")} disabled={!!busy} onclick={() => void open(mountView)}><ExternalLink size={14} /></Button>{/if}
            {#if mountView.status === "mounted"}<Button variant="ghost" size="icon-sm" aria-label={t("smb.unmountBtn")} title={t("smb.unmountBtn")} disabled={!!busy} onclick={() => void unmount(mountView)}><Link2Off size={14} /></Button>{:else}<Button variant="ghost" size="icon-sm" aria-label={t("smb.mountBtn")} title={t("smb.mountBtn")} disabled={!!busy} onclick={() => void mount(mountView)}><Link size={14} /></Button>{/if}
            <Button variant="ghost" size="icon-sm" aria-label={t("smb.removeBtn")} title={t("smb.removeBtn")} disabled={!!busy} onclick={() => void remove(mountView)}><Trash2 size={14} /></Button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
  <p class="smb-note">{t("smb.description")}</p>
</section>
