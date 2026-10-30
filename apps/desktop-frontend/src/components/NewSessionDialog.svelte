<script lang="ts">
  import { onMount } from "svelte";
  import { FolderOpen, FolderPlus, MessageSquarePlus } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { t } from "$lib/i18n";
  import type { Workspace } from "$lib/dsh-client";

  interface Props {
    readonly defaultChatDirectory: string;
    readonly workspaces: Workspace[];
    readonly busy: boolean;
    readonly onStartChat: () => void;
    readonly onStartProject: (workspace: Workspace) => void;
    readonly onPickDirectory: () => void;
    readonly onCancel: () => void;
  }

  let { defaultChatDirectory, workspaces, busy, onStartChat, onStartProject, onPickDirectory, onCancel }: Props = $props();
  let dialog: HTMLDialogElement;
  let mounted = false;
  function cancelMountedDialog(): void {
    if (mounted) onCancel();
  }
  onMount(() => {
    mounted = true;
    dialog.showModal();
    return () => {
      mounted = false;
      dialog.close();
    };
  });
</script>

<dialog bind:this={dialog} onclose={cancelMountedDialog} aria-labelledby="new-session-title" aria-describedby="new-session-description">
  <header>
    <h2 id="new-session-title">{t("session.newSessionTitle")}</h2>
    <p id="new-session-description">{t("session.newSessionDesc")}</p>
  </header>
  <button class="session-scope-card primary" type="button" disabled={busy} onclick={onStartChat}>
    <span class="scope-icon"><MessageSquarePlus size={18} /></span>
    <span class="scope-copy">
      <strong>{t("session.startChat")}</strong>
      <small>{t("session.startChatDesc")}</small>
      <code title={defaultChatDirectory}>{defaultChatDirectory || t("session.defaultDirectory")}</code>
    </span>
  </button>
  <div class="scope-heading">
    <strong>{t("session.projectSessions")}</strong>
    <small>{t("session.projectSessionsDesc")}</small>
  </div>
  {#if workspaces.length === 0}
    <p class="scope-empty">{t("session.noProjects")}</p>
  {:else}
    <div class="scope-project-list">
      {#each workspaces as workspace (workspace.workspaceId)}
        <button type="button" disabled={busy} onclick={() => onStartProject(workspace)}>
          <FolderOpen size={15} />
          <span>
            <strong>{workspace.title}</strong>
            <small title={workspace.path}>{workspace.path}</small>
          </span>
        </button>
      {/each}
    </div>
  {/if}
  <div class="pick-directory">
    <Button variant="outline" size="sm" disabled={busy} onclick={onPickDirectory}>
      <FolderPlus size={14} />
      {t("session.pickProjectDirectory")}
    </Button>
  </div>
  <footer>
    <Button variant="ghost" size="sm" onclick={onCancel}>{t("common.cancel")}</Button>
  </footer>
</dialog>

<style>
  dialog { width: min(520px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 20px; border: 1px solid var(--border); border-radius: 12px; background: var(--background); color: var(--foreground); overflow: auto; }
  dialog::backdrop { background: rgb(0 0 0 / 38%); }
  header { margin-bottom: 14px; }
  h2 { margin: 0; font-size: 17px; font-weight: 650; }
  header p { margin: 5px 0 0; color: var(--muted-foreground); font-size: 12px; line-height: 1.5; }
  .session-scope-card { display: flex; width: 100%; align-items: flex-start; gap: 12px; min-width: 0; padding: 14px; border: 1px solid color-mix(in oklch, var(--primary) 45%, var(--border)); border-radius: 10px; background: color-mix(in oklch, var(--primary) 6%, var(--background)); color: var(--foreground); text-align: left; cursor: pointer; }
  .session-scope-card:hover { border-color: var(--primary); }
  .session-scope-card:disabled, .scope-project-list button:disabled { cursor: not-allowed; opacity: .6; }
  .scope-icon { display: grid; width: 34px; height: 34px; flex: 0 0 auto; place-items: center; border-radius: 9px; background: var(--background); color: var(--primary); }
  .scope-copy { display: grid; min-width: 0; flex: 1; gap: 3px; }
  .scope-copy strong { font-size: 13px; }
  .scope-copy small { color: var(--muted-foreground); font-size: 11.5px; }
  .scope-copy code { max-width: 100%; overflow: hidden; margin-top: 3px; color: var(--muted-foreground); font-family: var(--font-mono, ui-monospace, monospace); font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
  .scope-heading { display: grid; gap: 2px; margin: 18px 0 8px; }
  .scope-heading strong { font-size: 12px; }
  .scope-heading small, .scope-empty { color: var(--muted-foreground); font-size: 11.5px; line-height: 1.5; }
  .scope-empty { margin: 0 0 10px; padding: 10px; border: 1px dashed var(--border); border-radius: 8px; }
  .scope-project-list { display: grid; gap: 5px; max-height: 210px; overflow: auto; }
  .scope-project-list button { display: flex; width: 100%; align-items: center; gap: 9px; min-width: 0; padding: 9px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--background); color: var(--foreground); text-align: left; cursor: pointer; }
  .scope-project-list button:hover { border-color: color-mix(in oklch, var(--primary) 40%, var(--border)); background: var(--muted); }
  .scope-project-list button > span { display: grid; min-width: 0; gap: 2px; }
  .scope-project-list strong, .scope-project-list small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .scope-project-list strong { font-size: 12px; }
  .scope-project-list small { color: var(--muted-foreground); font-size: 10.5px; }
  .pick-directory { margin-top: 10px; }
  .pick-directory :global(button) { width: 100%; justify-content: center; }
  footer { display: flex; justify-content: flex-end; margin-top: 16px; }
</style>