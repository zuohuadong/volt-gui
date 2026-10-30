<script lang="ts">
  import { onDestroy, onMount, untrack } from "svelte";
  import {
    PromptInput,
    PromptInputActionMenuItem,
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
import type { ScreenshotSelection } from "../electron";
  import { MAX_UPLOAD_FILE_BYTES, type PromptContentPart, type DshClient, type DshSkill, type ModelGroup, type PermissionSelect, type SpeechCatalog } from "$lib/dsh-client";
  import { Eye, History, LoaderCircle, Mic, Monitor, Send, Square } from "@lucide/svelte";
  import { preferredImageModel } from "$lib/model-catalog";
  import { VoiceRecorder } from "$lib/voice-input";
  import { createLocalFileDropHandlers } from "$lib/local-file-drop";
  import { Button } from "$components/ui/button";
  import ComposerAttachments from "$components/ComposerAttachments.svelte";
  import ComposerAddFiles from "$components/ComposerAddFiles.svelte";
  import ModelPicker from "$components/ModelPicker.svelte";
  import PermissionSelector from "$components/PermissionSelector.svelte";
import ReferencePicker from "$components/ReferencePicker.svelte";
import ScreenshotCrop from "$components/ScreenshotCrop.svelte";
import { t } from "$lib/i18n";

type ImagePart = Extract<PromptContentPart, { type: "image" }>;

  interface Props {
    readonly client?: DshClient;
    readonly sessionId: string;
    readonly skills?: DshSkill[];
    value?: string;
    draftFiles?: File[];
    readonly rows?: number;
    readonly disabled?: boolean;
    readonly loading?: boolean;
    readonly selectedModel: string;
    readonly modelGroups: ModelGroup[];
    readonly imageInputSupported?: boolean;
    readonly modelBusy?: boolean;
    readonly modelLoading?: boolean;
    readonly modelLoadError?: string;
    readonly onModelSettings: () => void;
    readonly onVoiceSettings: () => void;
    readonly onConfigureImageModel: () => void;
    readonly contextPermissions?: PermissionSelect;
    readonly activityOpen?: boolean;
    readonly onModelSelect: (provider: string, model: string) => void;
    readonly onPermissionNotice?: (message: string) => void;
    readonly onActivityOpen: () => void;
  readonly onSubmit: (text: string, images: ImagePart[], files: File[]) => void | Promise<void>;
    readonly onStop: () => void;
  }

  let {
    client,
    sessionId,
    skills = [],
    value = $bindable(""),
    draftFiles = $bindable<File[]>([]),
    rows = 4,
    disabled = false,
    loading = false,
    selectedModel,
    modelGroups,
    imageInputSupported = false,
    modelBusy = false,
    modelLoading = false,
    modelLoadError = "",
    onModelSettings,
    onVoiceSettings,
    onConfigureImageModel,
    contextPermissions,
    activityOpen = true,
    onModelSelect,
    onPermissionNotice,
    onActivityOpen,
    onSubmit,
    onStop,
  }: Props = $props();
  let actionMenuOpen = $state(false);
  let actionMenuRef = $state<HTMLDivElement | null>(null);
  let promptInputElement = $state<HTMLElement | null>(null);
  let fileDropError = $state(false);
  let captureBusy = $state(false);
  let captureError = $state(false);
  // 框选截图：先把整屏 PNG 冻结下来，用户在弹层里框选后再裁切。
  let pendingCapture = $state("");
  let cropBusy = $state(false);
  type VoiceFailure = "" | "permission" | "device" | "unsupported" | "model" | "busy" | "failed";
  type MicrophonePermission = "granted" | "denied" | "restricted" | "not-determined" | "unknown";
  let voiceState = $state<"idle" | "recording" | "transcribing">("idle");
  let voiceFailure = $state<VoiceFailure>("");
  let voiceRecorder: VoiceRecorder | undefined;
  let speechCatalog = $state<SpeechCatalog>();
  let microphonePermission = $state<MicrophonePermission>("unknown");
  let environmentSupportsRecording = $state(true);
  let speechClient: DshClient | undefined;
  let imageActionBlocked = $state(false);
  let imageRejectedNoModel = $state(false);
  let destroyed = false;
  const restoredUrls = new Set<string>();
  let attachments = $state<PromptInputSubmitDetail["files"]>(untrack(() => draftFiles.map((file, index) => {
    const url = URL.createObjectURL(file);
    restoredUrls.add(url);
    return { id: `draft-${index}`, name: file.name, mediaType: file.type, size: file.size, file, url };
  })));
  $effect(() => {
    draftFiles = attachments.flatMap((attachment) => attachment.file ? [attachment.file] : []);
    const activeUrls = new Set(attachments.map((attachment) => attachment.url));
    for (const url of restoredUrls) {
      if (activeUrls.has(url)) continue;
      URL.revokeObjectURL(url);
      restoredUrls.delete(url);
    }
  });
  onDestroy(() => {
    destroyed = true;
    void voiceRecorder?.cancel();
    restoredUrls.forEach((url) => URL.revokeObjectURL(url));
  });

  const imageTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
  const imageModel = $derived(preferredImageModel(modelGroups, selectedModel));
  const unsupportedImages = $derived(!imageInputSupported && attachments.some((file) => imageTypes.has(file.mediaType || file.file?.type || "")));
  const speechProvider = $derived(
    speechCatalog?.providers.find((provider) => provider.id === speechCatalog?.selection?.providerId)
      ?? speechCatalog?.providers[0],
  );
  const speechPreparing = $derived.by(() => {
    const phase = speechProvider?.preparation?.phase;
    return phase === "checking" || phase === "downloading" || phase === "loading" || phase === "waking" || phase === "cancelling";
  });
  const speechReady = $derived.by(() => {
    const phase = speechProvider?.preparation?.phase;
    return !phase || phase === "ready" || phase === "standby";
  });
  const voiceBlockedReason = $derived<VoiceFailure | "preparing" | "">(
    !environmentSupportsRecording ? "unsupported"
      : microphonePermission === "denied" || microphonePermission === "restricted" ? "permission"
        : speechCatalog && !speechProvider ? "model"
          : speechPreparing ? "preparing"
            : speechCatalog && !speechReady ? "model"
              : "",
  );

  function classifyVoiceError(error: unknown): VoiceFailure {
    const message = error instanceof Error ? error.message : String(error ?? "");
    const name = error instanceof DOMException ? error.name : "";
    if (message === "voice-permission" || name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError") return "permission";
    if (message === "voice-device" || name === "NotFoundError" || name === "DevicesNotFoundError" || name === "OverconstrainedError") return "device";
    if (message === "voice-unavailable" || name === "NotSupportedError") return "unsupported";
    if (name === "NotReadableError" || name === "TrackStartError" || /device in use|in use|busy/i.test(message)) return "busy";
    if (message === "voice-model" || /speech|transcri|provider|model|prepare|not ready/i.test(message)) return "model";
    return "failed";
  }

  function voiceFailureLabel(failure: VoiceFailure): string {
    if (failure === "permission") return t("composer.voicePermission");
    if (failure === "device") return t("composer.voiceDevice");
    if (failure === "unsupported") return t("composer.voiceUnsupported");
    if (failure === "model") return t("composer.voiceModelUnavailable");
    if (failure === "busy") return t("composer.voiceBusy");
    return t("composer.voiceFailed");
  }

  function voiceBlockedLabel(reason: VoiceFailure | "preparing" | ""): string {
    if (reason === "preparing") return t("settings.voicePreparing");
    return voiceFailureLabel(reason as VoiceFailure) || t("composer.voiceInput");
  }

  async function refreshSpeechStatus(current = client): Promise<void> {
    if (!current) return;
    try {
      const catalog = await current.speechCatalog();
      if (!destroyed) speechCatalog = catalog;
    } catch {
      if (!destroyed) speechCatalog = undefined;
    }
  }

  async function refreshMicrophonePermission(): Promise<void> {
    if (!window.voltDesktop?.microphoneAccess) return;
    try {
      microphonePermission = await window.voltDesktop.microphoneAccess();
    } catch {
      microphonePermission = "unknown";
    }
  }

  async function openMicrophoneSettings(): Promise<void> {
    try {
      await window.voltDesktop?.openMicrophoneSettings();
    } catch {
      // 系统设置入口不可用时保留错误说明。
    }
  }

  async function toggleVoice(): Promise<void> {
    if (voiceState === "transcribing" || !client || !sessionId) return;
    if (voiceBlockedReason) {
      voiceFailure = voiceBlockedReason === "preparing" ? "model" : voiceBlockedReason;
      return;
    }
    if (voiceState === "recording") {
      const current = voiceRecorder;
      voiceRecorder = undefined;
      voiceState = "transcribing";
      voiceFailure = "";
      try {
        if (!current) throw new Error("voice-empty");
        const capture = await current.stop();
        const catalog = await client.speechCatalog();
        if (!destroyed) speechCatalog = catalog;
        const providerId = catalog.selection?.providerId;
        if (!providerId) throw new Error("voice-model");
        const language = catalog.selection?.language || "zh";
        const result = await client.speechTranscribe(capture.audioBase64, providerId, language);
        if (destroyed) return;
        const text = result.text.trim();
        if (!text) throw new Error("voice-empty");
        value = `${value}${value && !/\s$/u.test(value) ? " " : ""}${text}`;
        promptInputElement?.querySelector("textarea")?.focus();
      } catch (error) {
        if (!destroyed) voiceFailure = classifyVoiceError(error);
      } finally {
        if (!destroyed) voiceState = "idle";
      }
      return;
    }
    voiceFailure = "";
    voiceState = "recording";
    try {
      const catalog = await client.speechCatalog();
      if (!destroyed) speechCatalog = catalog;
      const provider = catalog.providers.find((item) => item.id === catalog.selection?.providerId) ?? catalog.providers[0];
      const phase = provider?.preparation?.phase;
      if (!provider || (phase && phase !== "ready" && phase !== "standby")) throw new Error("voice-model");
      voiceRecorder = new VoiceRecorder();
      await voiceRecorder.start();
    } catch (error) {
      voiceRecorder = undefined;
      if (!destroyed) {
        voiceState = "idle";
        voiceFailure = classifyVoiceError(error);
      }
    }
  }

  async function addScreenshot(): Promise<void> {
    if (captureBusy || disabled || !sessionId) return;
    if (!imageInputSupported) {
      if (imageModel) imageActionBlocked = true;
      else imageRejectedNoModel = true;
      return;
    }
    const captureSessionId = sessionId;
    captureBusy = true;
    captureError = false;
    try {
      const shell = window.voltDesktop;
      if (!shell?.captureScreen) throw new Error("Desktop capture unavailable");
      const image = await shell.captureScreen();
      if (!image || destroyed || sessionId !== captureSessionId) return;
      pendingCapture = image;
    } catch {
      if (!destroyed && sessionId === captureSessionId) captureError = true;
    } finally {
      captureBusy = false;
    }
  }

  // 框选区已经由弹层换算成截图图片的像素坐标，这里只负责裁切并加入草稿。
  async function applyCrop(selection: ScreenshotSelection): Promise<void> {
    const shell = window.voltDesktop;
    const source = pendingCapture;
    if (!shell?.cropScreenshot || !source || cropBusy) return;
    cropBusy = true;
    try {
      const image = await shell.cropScreenshot(source, selection);
      if (!image) throw new Error("empty crop");
      const bytes = Uint8Array.from(atob(image.slice("data:image/png;base64,".length)), (char) => char.charCodeAt(0));
      const file = new File([bytes], `screenshot-${Date.now()}.png`, { type: "image/png" });
      const url = URL.createObjectURL(file);
      restoredUrls.add(url);
      imageActionBlocked = false;
      imageRejectedNoModel = false;
      attachments = [...attachments, { id: crypto.randomUUID(), name: file.name, mediaType: file.type, size: file.size, file, url }];
      pendingCapture = "";
    } catch {
      if (!destroyed) captureError = true;
    } finally {
      cropBusy = false;
    }
  }

  function isImageAttachment(attachment: PromptInputSubmitDetail["files"][number]): boolean {
    return imageTypes.has(attachment.mediaType || attachment.file?.type || "");
  }

  $effect(() => {
    if (imageInputSupported || imageModel) return;
    if (!attachments.some(isImageAttachment)) return;
    // 没有视觉模型时直接移除图片，避免用户把无法发送的附件带到提交流程。
    attachments = attachments.filter((attachment) => !isImageAttachment(attachment));
    imageRejectedNoModel = true;
  });

  $effect(() => {
    if (!imageInputSupported && !imageModel) return;
    imageActionBlocked = false;
    imageRejectedNoModel = false;
  });

  $effect(() => {
    const current = client;
    if (!current || current === speechClient) return;
    speechClient = current;
    void refreshSpeechStatus(current);
  });

  onMount(() => {
    environmentSupportsRecording = Boolean(navigator.mediaDevices) && typeof MediaRecorder !== "undefined";
    void refreshMicrophonePermission();
    window.addEventListener("focus", refreshMicrophonePermission);
    function closeActionMenu(event: PointerEvent): void {
      if (actionMenuOpen && actionMenuRef && !actionMenuRef.contains(event.target as Node)) {
        actionMenuOpen = false;
      }
    }

    document.addEventListener("pointerdown", closeActionMenu);
    const fileDrop = createLocalFileDropHandlers({
      contains: (target) => target instanceof Node && Boolean(promptInputElement?.contains(target)),
      enabled: () => !disabled && !loading && !!sessionId,
      resolvePath: (file) => window.voltDesktop?.getPathForFile(file) || "",
      insert: (references) => {
        fileDropError = false;
        value += `${value && !/\s$/u.test(value) ? " " : ""}${references} `;
        promptInputElement?.querySelector("textarea")?.focus();
      },
      unavailable: () => { fileDropError = true; },
    });

    document.addEventListener("dragover", fileDrop.dragover, true);
    document.addEventListener("drop", fileDrop.drop, true);
    return () => {
      document.removeEventListener("pointerdown", closeActionMenu);
      document.removeEventListener("dragover", fileDrop.dragover, true);
      document.removeEventListener("drop", fileDrop.drop, true);
      window.removeEventListener("focus", refreshMicrophonePermission);
    };
  });

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
    if (!imageInputSupported && detail.files.some(isImageAttachment)) {
      if (imageModel) imageActionBlocked = true;
      else imageRejectedNoModel = true;
      return;
    }
    const images = (await Promise.all(detail.files.map((attachment) => toImagePart(attachment.file, attachment)))).filter(
      (item): item is ImagePart => Boolean(item),
    );
    const files = detail.files.flatMap((attachment) => {
      const file = attachment.file;
      return file && !imageTypes.has(attachment.mediaType || file.type || "") ? [file] : [];
    });
    await onSubmit(detail.text, images, files);
  }
</script>

<div bind:this={promptInputElement} class="prompt-input-drop-zone">
  <PromptInput
    bind:value
    bind:attachments
    multiple
    maxFileSize={MAX_UPLOAD_FILE_BYTES}
    globalDrop={false}
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
    {#if captureBusy}<p role="status">{t("composer.capturingScreenshot")}</p>{/if}
    {#if captureError}<p class="file-drop-error" role="alert">{t("composer.screenshotFailed")}</p>{/if}
    {#if voiceFailure}
      <p class="file-drop-error" role="alert">{voiceFailureLabel(voiceFailure)}</p>
      <div class="voice-error-actions">
        {#if voiceFailure === "permission" && window.voltDesktop?.openMicrophoneSettings}
          <Button type="button" variant="outline" size="sm" onclick={() => void openMicrophoneSettings()}>
            {t("composer.openMicrophoneSettings")}
          </Button>
        {:else if voiceFailure === "model"}
          <Button type="button" variant="outline" size="sm" onclick={onVoiceSettings}>
            {t("composer.openVoiceSettings")}
          </Button>
        {:else if voiceFailure === "failed" || voiceFailure === "busy"}
          <Button type="button" variant="outline" size="sm" disabled={!!voiceBlockedReason} onclick={() => void toggleVoice()}>
            {t("settings.voiceRetry")}
          </Button>
        {/if}
      </div>
    {/if}
    {#if voiceState === "recording"}<p role="status">{t("composer.voiceRecording")}</p>{/if}
    {#if voiceState === "transcribing"}<p role="status">{t("composer.voiceTranscribing")}</p>{/if}
    {#if sessionId && voiceBlockedReason && !voiceFailure}
      <div class="voice-capability-notice" role="status">
        <Mic size={14} aria-hidden="true" />
        <span>{voiceBlockedLabel(voiceBlockedReason)}</span>
        {#if voiceBlockedReason === "permission" && window.voltDesktop?.openMicrophoneSettings}
          <Button type="button" variant="outline" size="sm" onclick={() => void openMicrophoneSettings()}>
            {t("composer.openMicrophoneSettings")}
          </Button>
        {:else if voiceBlockedReason === "model"}
          <Button type="button" variant="outline" size="sm" onclick={onVoiceSettings}>
            {t("composer.openVoiceSettings")}
          </Button>
        {/if}
      </div>
    {/if}
    {#if fileDropError}
      <p class="file-drop-error" role="alert">{t("composer.filePathUnavailable")}</p>
    {/if}
    {#if sessionId && (unsupportedImages || imageActionBlocked)}
      <div class="image-capability-notice" role="status">
        <Eye size={14} aria-hidden="true" />
        <span>{t("composer.textOnlyModel")}</span>
        {#if imageModel}
          <Button type="button" variant="outline" size="sm" disabled={disabled || loading || modelBusy} onclick={() => onModelSelect(imageModel!.provider, imageModel!.model.id)}>
            <Eye size={14} />{t("composer.switchImageModel", { name: imageModel.model.name })}
          </Button>
        {:else}
          <span>{t("composer.noImageModel")}</span>
          <Button type="button" variant="outline" size="sm" onclick={onConfigureImageModel}>
            {t("composer.openModelSettings")}
          </Button>
        {/if}
      </div>
    {/if}
    {#if sessionId && imageRejectedNoModel}
      <div class="image-capability-notice" role="status">
        <Eye size={14} aria-hidden="true" />
        <span>{t("composer.imageRejectedNoModel")}</span>
        <Button type="button" variant="outline" size="sm" onclick={onConfigureImageModel}>
          {t("composer.imageRejectedNoModelAction")}
        </Button>
      </div>
    {/if}
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
     <div bind:this={actionMenuRef} class="composer-action-menu">
       <PromptInputActionMenu bind:open={actionMenuOpen} aria-label={t("composer.moreTools")}>
         <PromptInputActionMenuTrigger aria-label={t("composer.moreTools")} title={t("composer.moreToolsTitle")} />
         <PromptInputActionMenuContent>
          <ComposerAddFiles disabled={disabled || !sessionId} />
           <PromptInputActionMenuItem disabled={disabled || !sessionId || captureBusy} onselect={() => void addScreenshot()}>
             <Monitor size={16} aria-hidden="true" />{t("composer.addScreenshot")}
           </PromptInputActionMenuItem>
         </PromptInputActionMenuContent>
       </PromptInputActionMenu>
     </div>
        <ModelPicker groups={modelGroups} selected={selectedModel} disabled={modelBusy || !sessionId} loading={modelLoading} error={modelLoadError} onSettings={onModelSettings} onSelect={onModelSelect} />
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
      <Button
        type="button"
        variant={voiceState === "recording" ? "destructive" : "ghost"}
        size="icon-sm"
        class="composer-voice-btn"
        aria-label={voiceState === "recording" ? t("composer.voiceStop") : t("composer.voiceInput")}
        title={voiceState === "recording" ? t("composer.voiceStop") : voiceBlockedReason ? voiceBlockedLabel(voiceBlockedReason) : t("composer.voiceInput")}
        disabled={!client || !sessionId || disabled || loading || modelBusy || voiceState === "transcribing" || (!!voiceBlockedReason && voiceState !== "recording")}
        onclick={() => void toggleVoice()}
      >
        {#if voiceState === "transcribing"}
          <LoaderCircle size={14} class="spin" aria-hidden="true" />
        {:else if voiceState === "recording"}
          <Square size={12} fill="currentColor" aria-hidden="true" />
        {:else}
          <Mic size={14} aria-hidden="true" />
        {/if}
      </Button>
      <PromptInputSubmit status={loading ? "streaming" : "ready"} onstop={onStop} disabled={!sessionId || (!loading && (disabled || unsupportedImages || modelBusy))} class="composer-submit-btn">
        {#if loading}
          <Square size={13} fill="currentColor" aria-hidden="true" />
        {:else}
          <Send size={14} aria-hidden="true" />
        {/if}
        <span class="sr-only">{loading ? t("composer.stop") : t("composer.send")}</span>
      </PromptInputSubmit>
    </div>
  </PromptInputFooter>
  </PromptInput>
  {#if pendingCapture}
    <ScreenshotCrop
      image={pendingCapture}
      busy={cropBusy}
      onConfirm={(selection) => void applyCrop(selection)}
      onCancel={() => { pendingCapture = ""; }}
    />
  {/if}
</div>

<style>
  .prompt-input-drop-zone { display: contents; }
  .file-drop-error { color: var(--destructive); font-size: 12px; margin: 0; }
  .image-capability-notice, .voice-capability-notice { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; padding: 6px 10px; color: var(--muted-foreground); font-size: 12px; }
  .image-capability-notice span, .voice-capability-notice span { min-width: 0; overflow-wrap: anywhere; }
  .voice-error-actions { display: flex; flex-wrap: wrap; gap: 6px; padding: 0 0 4px; }
</style>
