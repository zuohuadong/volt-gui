<script lang="ts">
  import {
    PromptInput,
    PromptInputActionAddAttachments,
    PromptInputActionAddScreenshot,
    PromptInputActionMenu,
    PromptInputActionMenuContent,
    PromptInputActionMenuTrigger,
    PromptInputBody,
    PromptInputFooter,
    PromptInputHeader,
    PromptInputSubmit,
    PromptInputTools,
  } from "@svadmin/ai-elements";
  import type { PromptInputSubmitDetail } from "@svadmin/ai-elements";
  import type { PromptContentPart, DshClient, DshSkill, ModelGroup, PermissionSelect } from "$lib/dsh-client";
  import { History } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import ComposerAttachments from "$components/ComposerAttachments.svelte";
  import ModelPicker from "$components/ModelPicker.svelte";
  import PermissionSelector from "$components/PermissionSelector.svelte";
  import ReferencePicker from "$components/ReferencePicker.svelte";

  type ImagePart = Extract<PromptContentPart, { type: "image" }>;

  interface Props {
    readonly client?: DshClient;
    readonly sessionId: string;
    readonly skills?: DshSkill[];
    value?: string;
    readonly rows?: number;
    readonly disabled?: boolean;
    readonly loading?: boolean;
    readonly selectedModel: string;
    readonly modelGroups: ModelGroup[];
    readonly modelBusy?: boolean;
    readonly contextPermissions?: PermissionSelect;
    readonly activityOpen?: boolean;
    readonly onModelSelect: (provider: string, model: string) => void;
    readonly onPermissionNotice?: (message: string) => void;
    readonly onActivityOpen: () => void;
    readonly onSubmit: (text: string, images: ImagePart[]) => void | Promise<void>;
    readonly onStop: () => void;
  }

  let {
    client,
    sessionId,
    skills = [],
    value = $bindable(""),
    rows = 4,
    disabled = false,
    loading = false,
    selectedModel,
    modelGroups,
    modelBusy = false,
    contextPermissions,
    activityOpen = true,
    onModelSelect,
    onPermissionNotice,
    onActivityOpen,
    onSubmit,
    onStop,
  }: Props = $props();
  let actionMenuOpen = $state(false);

  const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

  function readFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
      reader.onerror = () => reject(reader.error || new Error("图片读取失败"));
      reader.readAsDataURL(file);
    });
  }

  async function toImagePart(file: File | undefined, attachment: PromptInputSubmitDetail["files"][number]): Promise<ImagePart | undefined> {
    const mediaType = attachment.mediaType || file?.type || "";
    if (!imageTypes.has(mediaType)) return undefined;
    if (file) {
      const data = await readFile(file);
      return data ? { type: "image", mediaType: mediaType as ImagePart["mediaType"], data, name: attachment.name } : undefined;
    }
    const url = attachment.url || "";
    const [, data = ""] = url.split(",", 2);
    return data ? { type: "image", mediaType: mediaType as ImagePart["mediaType"], data, name: attachment.name } : undefined;
  }

  async function handleSubmit(detail: PromptInputSubmitDetail): Promise<void> {
    const images = (await Promise.all(detail.files.map((attachment) => toImagePart(attachment.file, attachment)))).filter(
      (item): item is ImagePart => Boolean(item),
    );
    await onSubmit(detail.text, images);
  }
</script>

<PromptInput
  bind:value
  accept="image/png,image/jpeg,image/webp,image/gif"
  multiple
  maxFileSize={10 * 1024 * 1024}
  globalDrop
  disabled={disabled || !sessionId}
  loading={loading}
  status={loading ? "streaming" : "ready"}
  ariaLabel="任务输入"
  onsubmit={handleSubmit}
  onstop={onStop}
  class="prompt-input-composer"
>
  <PromptInputHeader class="prompt-input-composer__header">
    <ComposerAttachments />
    {#if sessionId}
      <ModelPicker groups={modelGroups} selected={selectedModel} disabled={modelBusy} onSelect={onModelSelect} />
    {/if}
  </PromptInputHeader>
  <PromptInputBody class="prompt-input-composer__body">
    <ReferencePicker
      {client}
      {skills}
      {sessionId}
      {rows}
      {disabled}
      placeholder={sessionId ? "描述任务，或输入 @ 查找官方文件/会话引用…" : "先新建一个会话…"}
    />
  </PromptInputBody>
  <PromptInputFooter class="prompt-input-composer__footer">
    <PromptInputTools class="prompt-input-composer__tools">
      <PromptInputActionMenu bind:open={actionMenuOpen} aria-label="输入工具">
        <PromptInputActionMenuTrigger aria-label="更多输入工具" title="更多输入工具" />
        <PromptInputActionMenuContent>
          <PromptInputActionAddAttachments label="添加图片" accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={disabled || !sessionId} onclick={() => actionMenuOpen = false} />
          <PromptInputActionAddScreenshot label="截取屏幕" disabled={disabled || !sessionId} onselect={() => actionMenuOpen = false} />
        </PromptInputActionMenuContent>
      </PromptInputActionMenu>
      {#if sessionId && client}
        <PermissionSelector client={client} sessionId={sessionId} permissions={contextPermissions} onNotice={onPermissionNotice} />
      {/if}
      {#if !activityOpen}
        <Button variant="ghost" size="sm" onclick={onActivityOpen}><History size={14} />活动</Button>
      {/if}
    </PromptInputTools>
    <PromptInputSubmit status={loading ? "streaming" : "ready"} onstop={onStop} disabled={disabled || !sessionId} />
  </PromptInputFooter>
</PromptInput>
