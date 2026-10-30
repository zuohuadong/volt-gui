<script lang="ts">
  import { onMount } from "svelte";
  import { Trash2 } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import { t } from "$lib/i18n";

  let { title, disabled, description, onConfirm, onCancel }: {
    title: string;
    disabled: boolean;
    description?: string;
    onConfirm: () => void;
    onCancel: () => void;
  } = $props();
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

<dialog bind:this={dialog} onclose={cancelMountedDialog} aria-labelledby="delete-session-title" aria-describedby="delete-session-description">
  <h2 id="delete-session-title">{t("session.deleteSession")}</h2>
  <p id="delete-session-description">{description || t("session.deleteConfirm", { title })}</p>
  {#if disabled}<p>{t("session.runningActionUnavailable")}</p>{/if}
  <div class="delete-actions">
    <Button variant="outline" onclick={onCancel}>{t("common.cancel")}</Button>
    <Button variant="destructive" disabled={disabled} onclick={onConfirm}><Trash2 size={14} />{t("common.delete")}</Button>
  </div>
</dialog>

<style>
  dialog { width: min(420px, calc(100vw - 32px)); max-height: calc(100dvh - 32px); margin: auto; padding: 20px; border: 1px solid var(--border); border-radius: 8px; background: var(--background); color: var(--foreground); overflow-wrap: anywhere; }
  dialog::backdrop { background: rgb(0 0 0 / 35%); }
  h2 { margin: 0 0 12px; font-size: 16px; }
  p { margin: 0 0 16px; font-size: 13px; }
  .delete-actions { display: flex; justify-content: flex-end; gap: 8px; }
</style>
