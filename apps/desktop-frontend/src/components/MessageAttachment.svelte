<script lang="ts">
  import { Download, File as FileIcon, FileText, Image, LoaderCircle, Sheet } from "@lucide/svelte";
  import type { DshClient } from "$lib/dsh-client";
  import type { TranscriptAttachment } from "$lib/transcript";
  import { t } from "$lib/i18n";

  let { attachment, sessionId, client, localFile, onExportSession }: {
    attachment: TranscriptAttachment;
    sessionId: string;
    client?: DshClient;
    localFile?: File;
    onExportSession?: (sessionId: string) => void | Promise<void>;
  } = $props();
  let expanded = $state(false);
  let busy = $state(false);
  let error = $state("");
  let text = $state("");
  let url = $state("");
  let generation = 0;
  const textFile = $derived(/\.(txt|md|csv|json|xml|html|css|js|ts|py|log|yml|yaml)$/i.test(attachment.name));
  const Icon = $derived(attachment.kind === "image" ? Image : /\.(csv|xls|xlsx)$/i.test(attachment.name) ? Sheet : textFile ? FileText : FileIcon);
  const canRead = $derived(!!localFile || (attachment.kind === "image" && !!client && !!attachment.attachmentId));
  const canPreview = $derived(canRead && (attachment.kind === "image" || textFile));

  $effect(() => {
    sessionId; attachment; localFile;
    expanded = false; error = ""; text = ""; url = ""; busy = false;
    generation += 1;
    const urls: string[] = [];
    ownedUrls = urls;
    return () => { generation += 1; urls.forEach((value) => URL.revokeObjectURL(value)); };
  });
  let ownedUrls: string[] = [];

  async function load(): Promise<void> {
    if (busy || url || !canRead) return;
    const current = generation;
    busy = true;
    error = "";
    try {
      let blob: Blob;
      if (localFile) blob = localFile;
      else {
        const result = await client!.request<{ attachment: { mediaType: string }; data: string }>("session.attachment", {
          sessionId, attachmentId: attachment.attachmentId,
        });
        if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(result.attachment.mediaType)) throw new Error(t("transcript.attachmentUnavailable"));
        const bytes = Uint8Array.from(atob(result.data), (char) => char.charCodeAt(0));
        blob = new Blob([bytes], { type: result.attachment.mediaType });
      }
      const preview = textFile && attachment.kind !== "image" ? await blob.slice(0, 256 * 1024).text() : "";
      if (generation !== current) return;
      text = preview;
      url = URL.createObjectURL(blob);
      ownedUrls.push(url);
    } catch (reason) {
      if (generation === current) error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      if (generation === current) busy = false;
    }
  }

  async function preview(): Promise<void> {
    expanded = !expanded;
    if (expanded) await load();
  }

  async function download(): Promise<void> {
    const current = generation;
    await load();
    if (!url || current !== generation) return;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = attachment.name;
    anchor.click();
  }
</script>

<div class="attachment">
  <div class="attachment-row">
    <Icon size={18} aria-hidden="true" />
    <button type="button" class="attachment-name" disabled={!canPreview || busy} aria-expanded={expanded} onclick={() => void preview()} title={attachment.name}>
      <strong>{attachment.name}</strong>
      <small>{attachment.name.split(".").pop()?.toUpperCase()} {attachment.bytes !== undefined ? `· ${attachment.bytes.toLocaleString()} B` : ""}</small>
    </button>
    {#if busy}<LoaderCircle size={15} class="spin" aria-hidden="true" />{/if}
    {#if canRead}
      <button type="button" class="attachment-download" disabled={busy} title={t("transcript.downloadAttachment")} aria-label={t("transcript.downloadAttachment")} onclick={() => void download()}><Download size={16} /></button>
    {:else if sessionId && onExportSession}
      <button type="button" class="attachment-download" title={t("transcript.exportSessionForAttachment")} aria-label={t("transcript.exportSessionForAttachment")} onclick={() => void onExportSession?.(sessionId)}><Download size={16} /></button>
    {/if}
  </div>
  {#if !canRead}<small class="attachment-note">{t("transcript.historicalFileNotice")}</small>{/if}
  {#if error}<p role="alert">{error}</p>{/if}
  {#if expanded && url}
    {#if attachment.kind === "image"}<img src={url} alt={attachment.name} />{:else}<pre>{text}</pre>{#if (attachment.bytes ?? 0) > 256 * 1024}<small>{t("transcript.previewTruncated")}</small>{/if}{/if}
  {/if}
</div>

<style>
  .attachment { width: 420px; max-width: 100%; border: 1px solid var(--border); border-radius: 6px; background: var(--muted); padding: 8px 10px; margin-bottom: 6px; }
  .attachment-row { display: flex; align-items: center; gap: 8px; min-width: 0; }
  .attachment-name { display: grid; gap: 3px; min-width: 0; flex: 1; border: 0; background: transparent; text-align: left; color: var(--foreground); cursor: pointer; }
  .attachment-name strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .attachment-name:disabled { cursor: default; }
  .attachment-name:not(:disabled):hover strong { text-decoration: underline; }
  small { color: var(--muted-foreground); font-size: 11px; }
  .attachment-note { display: block; margin-top: 6px; }
  .attachment-download { display: grid; place-items: center; width: 28px; height: 28px; flex-shrink: 0; border: 0; background: transparent; color: var(--foreground); cursor: pointer; }
  pre { max-height: 300px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
  img { display: block; max-width: 100%; max-height: 360px; object-fit: contain; margin-top: 8px; }
  p { color: var(--destructive); font-size: 12px; overflow-wrap: anywhere; }
</style>
