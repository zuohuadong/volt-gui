<script lang="ts">
  import {
    Attachment,
    AttachmentInfo,
    AttachmentPreview,
    AttachmentRemove,
    Attachments,
    usePromptInputAttachments,
  } from "@svadmin/ai-elements";

  interface PromptAttachmentFile {
    id: string;
    name?: string;
    filename?: string;
    mediaType?: string;
    url?: string;
  }

  const controller = usePromptInputAttachments();
  const files = $derived(controller.files as unknown as PromptAttachmentFile[]);

  function displayAttachment(file: (typeof files)[number]) {
    return {
      id: file.id,
      type: "file" as const,
      filename: file.name || file.filename || "图片",
      mediaType: file.mediaType,
      url: file.url,
    };
  }
</script>

{#if files.length > 0}
  <Attachments variant="inline" class="composer-attachment-list">
    {#each files as file (file.id)}
      {@const display = displayAttachment(file)}
      <Attachment data={display} onremove={() => controller.remove(file.id)}>
        <AttachmentPreview />
        <AttachmentInfo />
        <AttachmentRemove label={`移除 ${display.filename}`} />
      </Attachment>
    {/each}
  </Attachments>
{/if}
