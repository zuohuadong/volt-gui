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
  import { History, Send, Square } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import ComposerAttachments from "$components/ComposerAttachments.svelte";
  import ModelPicker from "$components/ModelPicker.svelte";
  import PermissionSelector from "$components/PermissionSelector.svelte";
import ReferencePicker from "$components/ReferencePicker.svelte";
import { t } from "$lib/i18n";

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
    readonly imageInputSupported?: boolean;
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
    imageInputSupported = false,
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
      reader.onerror = () => reject(reader.error || new Error(t("composer.imageReadError")));
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
  accept={imageInputSupported ? "image/png,image/jpeg,image/webp,image/gif" : undefined}
  multiple
  maxFileSize={10 * 1024 * 1024}
  globalDrop={imageInputSupported}
  disabled={disabled || !sessionId}
  loading={loading}
  status={loading ? "streaming" : "ready"}
  ariaLabel={t("composer.inputAriaLabel")}
  onsubmit={handleSubmit}
  onstop={onStop}
  class="prompt-input-composer"
>
  <PromptInputHeader class="prompt-input-composer__header">
    <ComposerAttachments />
  </PromptInputHeader>
  <PromptInputBody class="prompt-input-composer__body">
    <ReferencePicker
      {client}
      {skills}
      {sessionId}
      {rows}
      {disabled}
      placeholder={sessionId ? t("composer.placeholder") : t("composer.newSessionFirst")}
    />
  </PromptInputBody>
  <PromptInputFooter class="prompt-input-composer__footer">
    <PromptInputTools class="prompt-input-composer__tools">
     <PromptInputActionMenu bind:open={actionMenuOpen} aria-label={t("composer.moreTools")}>
       <PromptInputActionMenuTrigger aria-label={t("composer.moreTools")} title={t("composer.moreToolsTitle")} />
       <PromptInputActionMenuContent>
         <PromptInputActionAddAttachments label={t("composer.addAttachments")} accept="image/png,image/jpeg,image/webp,image/gif" multiple disabled={disabled || !sessionId || !imageInputSupported} onclick={() => actionMenuOpen = false} />
         <PromptInputActionAddScreenshot label={t("composer.addScreenshot")} disabled={disabled || !sessionId || !imageInputSupported} onselect={() => actionMenuOpen = false} />
       </PromptInputActionMenuContent>
     </PromptInputActionMenu>
      <ModelPicker groups={modelGroups} selected={selectedModel} disabled={modelBusy || !sessionId} onSelect={onModelSelect} />
      {#if client}
        <PermissionSelector client={client} sessionId={sessionId} permissions={contextPermissions} onNotice={onPermissionNotice} />
      {/if}
      {#if !activityOpen}
        <Button variant="ghost" size="sm" class="composer-activity-btn" onclick={onActivityOpen} title={t("composer.expandActivity")}>
          <History size={14} />
          <span>{t("composer.activity")}</span>
        </Button>
      {/if}
    </PromptInputTools>
    <div class="prompt-input-composer__submit-wrap">
      <PromptInputSubmit status={loading ? "streaming" : "ready"} onstop={onStop} disabled={disabled || !sessionId} class="composer-submit-btn">
        {#if loading}
          <Square size={13} fill="currentColor" aria-hidden="true" />
          <span>{t("composer.stop")}</span>
        {:else}
          <Send size={14} aria-hidden="true" />
          <span>{t("composer.send")}</span>
        {/if}
      </PromptInputSubmit>
    </div>
  </PromptInputFooter>
</PromptInput>
