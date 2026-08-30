<script lang="ts">
  import { ImagePlus, X } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import type { PromptContentPart } from "$lib/dsh-client";

  type Attachment = Extract<PromptContentPart, { type: "image" }>;
  let { attachments = $bindable<Attachment[]>([]) }: { attachments?: Attachment[] } = $props();
  let inputRef = $state<HTMLInputElement | null>(null);
  let error = $state("");
  const maxBytes = 10 * 1024 * 1024;

  function mediaType(file: File): Attachment["mediaType"] | undefined {
    return file.type === "image/png" || file.type === "image/jpeg" || file.type === "image/webp" || file.type === "image/gif" ? file.type : undefined;
  }
  async function addFiles(files: FileList | File[]): Promise<void> {
    error = "";
    for (const file of Array.from(files)) {
      const type = mediaType(file);
      if (!type) { error = "仅支持 PNG、JPEG、WebP 或 GIF 图片"; continue; }
      if (file.size > maxBytes) { error = "图片不能超过 10 MB"; continue; }
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
        reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
        reader.readAsDataURL(file);
      });
      if (data) attachments = [...attachments, { type: "image", mediaType: type, data, name: file.name }];
    }
    if (inputRef) inputRef.value = "";
  }
  function onDrop(event: DragEvent): void {
    event.preventDefault();
    if (event.dataTransfer?.files.length) void addFiles(event.dataTransfer.files);
  }
</script>

<div class="attachment-control" role="group" aria-label="图片附件" ondragover={(event) => event.preventDefault()} ondrop={onDrop}>
  <input bind:this={inputRef} class="attachment-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple onchange={(event) => { const files = (event.currentTarget as HTMLInputElement).files; if (files) void addFiles(files); }} />
  <Button variant="ghost" size="icon-sm" aria-label="添加图片" title="添加图片" onclick={() => inputRef?.click()}><ImagePlus size={14} /></Button>
  {#if attachments.length > 0}<div class="attachment-list" aria-label="已添加图片">{#each attachments as attachment, index (index)}<span class="attachment-chip"><img alt={attachment.name || "图片附件"} src={`data:${attachment.mediaType};base64,${attachment.data}`} /><span>{attachment.name || "图片"}</span><button aria-label={`移除 ${attachment.name || "图片"}`} onclick={() => attachments = attachments.filter((_, itemIndex) => itemIndex !== index)}><X size={12} /></button></span>{/each}</div>{/if}
  {#if error}<span class="attachment-error">{error}</span>{/if}
</div>
