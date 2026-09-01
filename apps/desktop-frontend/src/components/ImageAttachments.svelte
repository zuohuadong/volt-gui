<script lang="ts">
  import { Paperclip } from "@lucide/svelte";
  import {
    Attachment,
    AttachmentInfo,
    AttachmentPreview,
    AttachmentRemove,
    Attachments,
  } from "@svadmin/ai-elements";
  import { Button } from "$components/ui/button";
  import type { PromptContentPart } from "$lib/dsh-client";

  type ImageAttachment = Extract<PromptContentPart, { type: "image" }>;
  type Props = { attachments?: ImageAttachment[] };
  let { attachments = $bindable<ImageAttachment[]>([]) }: Props = $props();
  let fileInput = $state<HTMLInputElement>();
  const maxBytes = 10 * 1024 * 1024;
  const acceptedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

  function displayAttachment(attachment: ImageAttachment) {
    return {
      id: `dsh-image-${attachment.name || "image"}-${attachment.data.slice(0, 16)}`,
      type: "file" as const,
      filename: attachment.name || "图片",
      mediaType: attachment.mediaType,
      url: `data:${attachment.mediaType};base64,${attachment.data}`,
    };
  }

  async function addSelectedFiles(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const next = await Promise.all(Array.from(input.files ?? []).map(toImageAttachment));
    attachments = [...attachments, ...next.filter((attachment): attachment is ImageAttachment => Boolean(attachment))];
    input.value = "";
  }

  async function toImageAttachment(file: File): Promise<ImageAttachment | undefined> {
    if (!acceptedTypes.has(file.type) || file.size > maxBytes) return undefined;
    const data = await readFile(file);
    return data ? { type: "image", mediaType: file.type as ImageAttachment["mediaType"], data, name: file.name } : undefined;
  }

  function removeAttachment(index: number): void {
    attachments = attachments.filter((_, itemIndex) => itemIndex !== index);
  }

  function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
      reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
      reader.readAsDataURL(file);
    });
  }
</script>

<div class="composer-attachments">
  <input
    bind:this={fileInput}
    class="sr-only"
    type="file"
    accept="image/png,image/jpeg,image/webp,image/gif"
    multiple
    onchange={(event) => void addSelectedFiles(event)}
  />
  {#if attachments.length}
    <Attachments variant="inline" class="composer-attachment-list">
      {#each attachments as attachment, index (`${displayAttachment(attachment).id}-${index}`)}
        {@const display = displayAttachment(attachment)}
        <Attachment data={display} onremove={() => removeAttachment(index)}>
          <AttachmentPreview />
          <AttachmentInfo />
          <AttachmentRemove label={`移除 ${display.filename}`} />
        </Attachment>
      {/each}
    </Attachments>
  {/if}
  <Button variant="ghost" size="icon-sm" aria-label="添加图片" title="添加图片" onclick={() => fileInput?.click()}>
    <Paperclip size={14} />
  </Button>
</div>
