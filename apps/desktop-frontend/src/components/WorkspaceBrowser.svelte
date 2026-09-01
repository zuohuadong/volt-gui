<script lang="ts">
  import { ChevronRight, FolderPlus, FolderOpen, RefreshCw } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { Input } from "$components/ui/input";
  import { DataState } from "@svadmin/ui";
  import type { DirectoryListing, DshClient } from "$lib/dsh-client";

  let { client, onRegistered }: { client: DshClient; onRegistered?: () => void } = $props();
  let listing = $state<DirectoryListing>();
  let loading = $state(false);
  let error = $state("");
  let newFolder = $state("");
  let registering = $state("");

  async function browse(path?: string): Promise<void> {
    loading = true; error = "";
    try { listing = await client.listDirectory(path); }
    catch (e) { const message = e instanceof Error ? e.message : String(e); error = message.includes("needs the browse capability") ? "当前桌面会话未授予目录浏览权限，请在权限提示中允许浏览工作区，或使用上方“选择工作区”。" : message; }
    finally { loading = false; }
  }
  async function createFolder(): Promise<void> {
    const name = newFolder.trim();
    if (!listing || !name) return;
    try { await client.createDirectory(listing.path, name); newFolder = ""; await browse(listing.path); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
  }
  async function register(path: string): Promise<void> {
    registering = path; error = "";
    try { await client.createWorkspace(path); onRegistered?.(); }
    catch (e) { error = e instanceof Error ? e.message : String(e); }
    finally { registering = ""; }
  }
</script>

<section class="workspace-browser">
  <div class="workspace-browser-toolbar"><Button variant="outline" size="sm" disabled={loading} onclick={() => void browse(listing?.path)}><RefreshCw size={13} />刷新</Button><div class="workspace-new-folder"><Input aria-label="新建目录名称" placeholder="新建目录" bind:value={newFolder} onkeydown={(event) => event.key === "Enter" && void createFolder()} /><Button variant="ghost" size="icon-sm" aria-label="新建目录" title="新建目录" disabled={!newFolder.trim() || !listing} onclick={() => void createFolder()}><FolderPlus size={14} /></Button></div></div>
  {#if error}<div class="management-feedback error">{error}</div>{/if}
  {#if !listing && !loading}
    <div class="browser-prompt-banner">
      <div class="browser-prompt-copy">
        <strong>浏览本地工作区目录</strong>
        <small>读取官方 DSH 目录清单，选择目录后可一键注册为新工作区。</small>
      </div>
      <Button size="sm" onclick={() => void browse()}><FolderOpen size={14} />打开主目录浏览</Button>
    </div>
  {:else if loading}<div class="browser-loading">正在读取目录…</div>{:else if listing}<nav class="browser-crumbs" aria-label="目录路径">{#each listing.crumbs as crumb (crumb.path)}<button onclick={() => void browse(crumb.path)}>{crumb.name}<ChevronRight size={12} /></button>{/each}</nav><div class="browser-list">{#each listing.entries as entry (entry.path)}<div class="browser-row"><button onclick={() => void browse(entry.path)}><FolderOpen size={14} /><span>{entry.name}</span></button><Button variant="ghost" size="xs" disabled={registering === entry.path} onclick={() => void register(entry.path)}>{registering === entry.path ? "注册中" : "注册工作区"}</Button></div>{/each}{#if listing.entries.length === 0}<DataState state="empty" title="目录为空" description="可以新建目录，或返回上级目录。" />{/if}</div>{#if listing.truncated}<small class="browser-note">目录条目过多，仅显示名称排序后的前部分。</small>{/if}{/if}
</section>
