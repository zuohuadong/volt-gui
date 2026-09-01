<script lang="ts">
  import { ChevronRight, FolderPlus, FolderOpen, RefreshCw } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { Input } from "$components/ui/input";
import { DataState } from "@svadmin/ui";
import type { DirectoryListing, DshClient } from "$lib/dsh-client";
import { t } from "$lib/i18n";

let { client, onRegistered }: { client: DshClient; onRegistered?: () => void } = $props();
  let listing = $state<DirectoryListing>();
  let loading = $state(false);
  let error = $state("");
  let newFolder = $state("");
  let registering = $state("");

  async function browse(path?: string): Promise<void> {
    loading = true; error = "";
    try { listing = await client.listDirectory(path); }
    catch (e) { const message = e instanceof Error ? e.message : String(e); error = message.includes("needs the browse capability") ? t("errors.browseCapabilityNeeded") : message; }
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
  <div class="workspace-browser-toolbar"><Button variant="outline" size="sm" disabled={loading} onclick={() => void browse(listing?.path)}><RefreshCw size={13} />{t("common.refresh")}</Button><div class="workspace-new-folder"><Input aria-label={t("common.name")} placeholder={t("common.name")} bind:value={newFolder} onkeydown={(event) => event.key === "Enter" && void createFolder()} /><Button variant="ghost" size="icon-sm" aria-label={t("common.open")} title={t("common.open")} disabled={!newFolder.trim() || !listing} onclick={() => void createFolder()}><FolderPlus size={14} /></Button></div></div>
  {#if error}<div class="management-feedback error">{error}</div>{/if}
  {#if !listing && !loading}
    <div class="browser-prompt-banner">
      <div class="browser-prompt-copy">
        <strong>{t("workspaces.browse")}</strong>
        <small>{t("workspaces.description")}</small>
      </div>
      <Button size="sm" onclick={() => void browse()}><FolderOpen size={14} />{t("workspaces.browse")}</Button>
    </div>
  {:else if loading}<div class="browser-loading">{t("app.loading")}</div>{:else if listing}<nav class="browser-crumbs" aria-label={t("common.path")}>{#each listing.crumbs as crumb (crumb.path)}<button onclick={() => void browse(crumb.path)}>{crumb.name}<ChevronRight size={12} /></button>{/each}</nav><div class="browser-list">{#each listing.entries as entry (entry.path)}<div class="browser-row"><button onclick={() => void browse(entry.path)}><FolderOpen size={14} /><span>{entry.name}</span></button><Button variant="ghost" size="xs" disabled={registering === entry.path} onclick={() => void register(entry.path)}>{registering === entry.path ? "…" : t("workspaces.register")}</Button></div>{/each}{#if listing.entries.length === 0}<DataState state="empty" title={t("common.empty")} description="" />{/if}</div>{#if listing.truncated}<small class="browser-note">…</small>{/if}{/if}
</section>
