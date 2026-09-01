<script lang="ts">
  import { onMount } from "svelte";
  import { ExternalLink, HardDrive, Link, Link2Off, Plus, RefreshCw, Trash2 } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { Input } from "$components/ui/input";
  import type { DesktopShellApi, SmbMountRequest, SmbMountView } from "../electron";

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

  const statusLabel: Record<SmbMountView["status"], string> = {
    mounted: "已挂载", unmounted: "未挂载", offline: "网络不可用",
    requires_credentials: "需要凭据", error: "挂载失败", unsupported: "当前平台不支持",
  };

  function desktopShell(): DesktopShellApi | undefined { return shell ?? window.voltDesktop; }

  onMount(() => { void refresh(); });

  async function refresh(): Promise<void> {
    const api = desktopShell();
    if (!api) { mounts = []; error = "桌面桥接未加载"; return; }
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
        notice = `${result.displayName} 已挂载到 ${result.localPath}`;
        displayName = ""; remotePath = ""; localPath = ""; autoMount = false;
      } else error = result.lastError || statusLabel[result.status];
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
      if (result.status !== "unmounted") error = result.lastError || statusLabel[result.status];
    } catch (reason) { error = reason instanceof Error ? reason.message : String(reason); }
    finally { busy = ""; }
  }

  async function remove(mountView: SmbMountView): Promise<void> {
    const api = desktopShell();
    if (!api || !window.confirm(`移除 SMB 配置“${mountView.displayName}”？已挂载的盘符不会自动卸载。`)) return;
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

<section class="smb-mounts" aria-label="SMB 共享挂载">
  <div class="smb-mounts__header">
    <div><span class="section-label">企业资源</span><h2>SMB 共享</h2><p>使用当前 Windows 登录凭据映射网络共享；VoltUI 不保存 SMB 密码。</p></div>
    <Button variant="outline" size="sm" disabled={busy === "refresh"} onclick={() => void refresh()}><RefreshCw size={14} />刷新</Button>
  </div>
  {#if error}<div class="smb-feedback error" role="alert"><Link2Off size={14} /><span>{error}</span></div>{/if}
  {#if notice}<div class="smb-feedback success" role="status"><Link size={14} /><span>{notice}</span></div>{/if}
  <div class="smb-add-form">
    <Input class="smb-input" aria-label="共享名称" placeholder="共享名称，例如：工程共享" bind:value={displayName} />
    <Input class="smb-input" aria-label="SMB 远程路径" placeholder="\\\\nas\\engineering" bind:value={remotePath} />
    <Input class="smb-input" aria-label="本地盘符" placeholder="Z:" bind:value={localPath} />
    <label class="smb-auto-mount"><input type="checkbox" bind:checked={autoMount} />自动挂载</label>
    <Button size="sm" disabled={!displayName.trim() || !remotePath.trim() || !localPath.trim() || !!busy} onclick={() => void mountNew()}><Plus size={14} />挂载</Button>
  </div>
  {#if mounts.length === 0}
    <div class="smb-empty"><HardDrive size={20} /><strong>暂无 SMB 配置</strong><span>添加一个 UNC 路径和本地盘符即可开始。</span></div>
  {:else}
    <div class="smb-list">
      {#each mounts as mountView (mountView.id)}
        <article class="smb-row">
          <span class="smb-icon"><HardDrive size={16} /></span>
          <div class="smb-copy"><strong>{mountView.displayName}</strong><small>{mountView.remotePath} → {mountView.localPath}</small></div>
          <span class={`smb-status smb-status--${mountView.status}`}>{statusLabel[mountView.status]}</span>
          <div class="smb-actions">
            {#if mountView.status === "mounted"}<Button variant="ghost" size="icon-sm" aria-label="打开共享目录" title="打开共享目录" disabled={!!busy} onclick={() => void open(mountView)}><ExternalLink size={14} /></Button>{/if}
            {#if mountView.status === "mounted"}<Button variant="ghost" size="icon-sm" aria-label="卸载共享" title="卸载共享" disabled={!!busy} onclick={() => void unmount(mountView)}><Link2Off size={14} /></Button>{:else}<Button variant="ghost" size="icon-sm" aria-label="挂载共享" title="挂载共享" disabled={!!busy} onclick={() => void mount(mountView)}><Link size={14} /></Button>{/if}
            <Button variant="ghost" size="icon-sm" aria-label="移除 SMB 配置" title="移除 SMB 配置" disabled={!!busy} onclick={() => void remove(mountView)}><Trash2 size={14} /></Button>
          </div>
        </article>
      {/each}
    </div>
  {/if}
  <p class="smb-note">需要凭据时，请先在 Windows 凭据管理器中为目标服务器配置用户凭据。Supauth/OIDC token 不会转换为 SMB 密码。</p>
</section>
