<script lang="ts">
  import { onMount } from "svelte";
  import { AtSign, Check, FileText, FileType, Folder, FolderKanban, Image, ListChecks, Paperclip, Plus, Presentation, Search, Send, ShieldCheck, Square, Table, Target, WandSparkles, X } from "@lucide/svelte";
  import { t } from "../lib/i18n";
  import { app, onFilesDropped } from "../lib/bridge";
  import type { ActivityMode, CommandInfo, ComposerAttachment, DirEntry, ModelInfo, SlashArgItem } from "../lib/types";

  let {
    input,
    commands,
    sending,
    onInput,
    onSend,
    onCancel,
    onPreviewFile,
    models = [],
    selectedModel = "",
    imageInputEnabled = false,
    disabled = false,
    disabledReason = "",
    onModelChange,
    projectOptions = [],
    selectedProjectId = "",
    onProjectChange,
    workPermission = "auto-approve",
    onWorkPermissionChange,
    onOpenResources,
    activityMode,
  }: {
    input: string;
    commands: CommandInfo[];
    sending: boolean;
    onInput: (value: string) => void;
    onSend: (displayText: string, submitText?: string) => void;
    onCancel: () => void;
    onPreviewFile: (path: string) => void;
    models?: ModelInfo[];
    selectedModel?: string;
    imageInputEnabled?: boolean;
    disabled?: boolean;
    disabledReason?: string;
    onModelChange?: (event: Event) => void;
    projectOptions?: { id: string; label: string }[];
    selectedProjectId?: string;
    onProjectChange?: (value: string) => void;
    workPermission?: string;
    onWorkPermissionChange?: (value: string) => void;
    onOpenResources?: () => void;
    activityMode?: ActivityMode;
  } = $props();

  let fileMatches = $state<DirEntry[]>([]);
  let slashArgItems = $state<SlashArgItem[]>([]);
  let slashArgFrom = $state(0);
  let slashArgRequest = 0;
  let attachments = $state<ComposerAttachment[]>([]);
  let pendingAttachmentWrites = $state(0);
  let dragOver = $state(false);
  let plusMenuOpen = $state(false);
  let projectMenuOpen = $state(false);
  let permissionMenuOpen = $state(false);
  let fileAccept = $state("");
  let fileInput: HTMLInputElement | undefined;
  let textarea: HTMLTextAreaElement | undefined;
  let composerRoot: HTMLFormElement | undefined;

  const workPermissionOptions = [
    { id: "ask", label: "请求批准", mark: "手" },
    { id: "auto-approve", label: "替我批准", mark: "审" },
    { id: "full-access", label: "完全访问权限", mark: "!" },
  ];

  const slashQuery = $derived(input.startsWith("/") && !/\s/.test(input) ? input.slice(1).toLowerCase() : null);
  const slashMatches = $derived(slashQuery === null ? [] : commands.filter((command) => command.name.toLowerCase().includes(slashQuery)).slice(0, 6));
  const slashArgMode = $derived(/^\/[^\s]+\s+/.test(input));
  const atMatch = $derived(/(?:^|\s)@([^\s]*)$/.exec(input)?.[1] ?? null);
  const atDir = $derived(splitAtToken(input)?.dir ?? "");
  const canSubmit = $derived(!sending && !disabled && (input.trim() !== "" || attachments.length > 0) && pendingAttachmentWrites === 0);
  const selectedModelInfo = $derived(models.find((model) => modelValue(model) === selectedModel) ?? models.find((model) => model.current));
  const selectedModelSupportsImages = $derived(selectedModelInfo?.vision ?? imageInputEnabled);
  const hasImageAttachments = $derived(attachments.some((attachment) => Boolean(attachment.previewUrl)));
  const imageAttachmentNote = $derived(
    hasImageAttachments
      ? selectedModelSupportsImages
        ? t.composer.imageDirect
        : t.composer.imageReferenceOnly
      : "",
  );
  const currentModelCapabilityTitle = $derived(
    selectedModelSupportsImages ? t.composer.imageModelAvailable : t.composer.textModelOnly,
  );

  onMount(() => {
    const unsubscribeDropped = onFilesDropped((paths) => void attachDroppedPaths(paths));
    const closeMenusOnOutsidePointer = (event: PointerEvent) => {
      if (!plusMenuOpen && !projectMenuOpen && !permissionMenuOpen) return;
      const target = event.target;
      if (target instanceof Node && composerRoot?.contains(target)) return;
      closeMenus();
    };
    const closeMenusOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (!plusMenuOpen && !projectMenuOpen && !permissionMenuOpen) return;
      closeMenus();
      event.stopPropagation();
    };
    window.addEventListener("pointerdown", closeMenusOnOutsidePointer, true);
    window.addEventListener("keydown", closeMenusOnEscape, true);
    return () => {
      unsubscribeDropped();
      window.removeEventListener("pointerdown", closeMenusOnOutsidePointer, true);
      window.removeEventListener("keydown", closeMenusOnEscape, true);
    };
  });

  function closeMenus() {
    plusMenuOpen = false;
    projectMenuOpen = false;
    permissionMenuOpen = false;
  }

  function modelValue(model: ModelInfo) {
    return model.ref || model.name || model.model || model.label || "";
  }

  function modelKey(model: ModelInfo, index: number) {
    return modelValue(model) || `model-${index}`;
  }

  function modelLabel(model: ModelInfo, index: number) {
    const label = model.label || model.model || model.name || model.ref || `模型 ${index + 1}`;
    return model.vision ? `${label} (${t.composer.imageInputShort})` : label;
  }

  function commandKey(command: CommandInfo, index: number) {
    return command.name || `${command.kind || "command"}-${index}`;
  }

  function slashArgKey(item: SlashArgItem, index: number) {
    return item.insert || item.label || item.hint || item.description || `slash-arg-${index}`;
  }

  function fileMatchKey(entry: DirEntry, index: number) {
    return `${entry.isDir ? "dir" : "file"}:${entry.name || index}`;
  }

  function attachmentKey(attachment: ComposerAttachment, index: number) {
    return attachment.path || attachment.previewUrl || `attachment-${index}`;
  }

  function projectKey(project: { id: string; label: string }, index: number) {
    return project.id || project.label || `project-${index}`;
  }

  function baseName(path: string): string {
    return path.split(/[/\\]/).filter(Boolean).pop() ?? path;
  }

  function splitAtToken(value: string) {
    const raw = /(?:^|\s)@([^\s]*)$/.exec(value)?.[1] ?? null;
    if (raw === null) return undefined;
    const slash = raw.lastIndexOf("/");
    return {
      raw,
      dir: slash >= 0 ? raw.slice(0, slash + 1) : "",
      fragment: slash >= 0 ? raw.slice(slash + 1).toLowerCase() : raw.toLowerCase(),
    };
  }

  function joinEntryPath(dir: string, entry: DirEntry) {
    const path = `${dir}${entry.name}`;
    return entry.isDir && !path.endsWith("/") ? `${path}/` : path;
  }

  function fileMatchLabel(dir: string, entry: DirEntry) {
    const path = joinEntryPath(dir, entry);
    return entry.isDir || dir ? path : entry.name;
  }

  function addAttachment(attachment: ComposerAttachment) {
    attachments = attachments.some((item) => item.path === attachment.path) ? attachments : [...attachments, attachment];
  }

  function removeAttachment(path: string) {
    attachments = attachments.filter((attachment) => attachment.path !== path);
  }

  function readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function attachFile(file: File) {
    pendingAttachmentWrites += 1;
    try {
      const dataUrl = await readFileAsDataURL(file);
      if (file.type.startsWith("image/")) {
        const path = await app().SavePastedImage(dataUrl);
        const previewUrl = await app().AttachmentDataURL(path);
        addAttachment({ path, previewUrl });
        return;
      }
      const path = await app().SavePastedFile(file.name, dataUrl);
      addAttachment({ path });
    } catch {
      // Attachment failures should not block normal text input.
    } finally {
      pendingAttachmentWrites = Math.max(0, pendingAttachmentWrites - 1);
    }
  }

  function attachFiles(files: File[]) {
    for (const file of files) void attachFile(file);
  }

  function handleFilePicker(event: Event) {
    const files = Array.from((event.currentTarget as HTMLInputElement).files ?? []);
    attachFiles(files);
    if (fileInput) fileInput.value = "";
  }

  function openFilePicker(accept = "") {
    fileAccept = accept;
    plusMenuOpen = false;
    requestAnimationFrame(() => fileInput?.click());
  }

  function openResources() {
    plusMenuOpen = false;
    onOpenResources?.();
  }

  function togglePlusMenu() {
    plusMenuOpen = !plusMenuOpen;
    if (plusMenuOpen) {
      projectMenuOpen = false;
      permissionMenuOpen = false;
    }
  }

  function toggleProjectMenu() {
    projectMenuOpen = !projectMenuOpen;
    if (projectMenuOpen) {
      plusMenuOpen = false;
      permissionMenuOpen = false;
    }
  }

  function togglePermissionMenu() {
    permissionMenuOpen = !permissionMenuOpen;
    if (permissionMenuOpen) {
      plusMenuOpen = false;
      projectMenuOpen = false;
    }
  }

  function selectedProjectLabel() {
    return selectedProjectId ? (projectOptions.find((project) => project.id === selectedProjectId)?.label ?? "不归属项目") : "不归属项目";
  }

  function selectedPermissionLabel() {
    return workPermissionOptions.find((option) => option.id === workPermission)?.label ?? "替我批准";
  }

  function setWorkPermission(value: string) {
    onWorkPermissionChange?.(value);
    permissionMenuOpen = false;
  }

  function setProject(value: string) {
    onProjectChange?.(value);
    projectMenuOpen = false;
  }

  function insertWorkspaceReference() {
    plusMenuOpen = false;
    const next = `${input}${input.endsWith(" ") || input === "" ? "" : " "}@`;
    onInput(next);
    requestAnimationFrame(() => textarea?.focus());
    void refreshFileMatches(next);
  }

  async function attachDroppedPaths(paths: string[]) {
    dragOver = false;
    for (const path of paths) {
      pendingAttachmentWrites += 1;
      try {
        const item = await app().AttachDropped(path);
        if (item.kind === "workspace") {
          onInput(`${input}${input.endsWith(" ") || input === "" ? "" : " "}@${item.path}${item.isDir ? "/" : ""} `);
        } else {
          addAttachment({ path: item.path, previewUrl: item.previewUrl });
        }
      } catch {
        // Dropped files are optional context; a failed attach is non-fatal.
      } finally {
        pendingAttachmentWrites = Math.max(0, pendingAttachmentWrites - 1);
      }
    }
  }

  function submitComposer() {
    const text = input.trim();
    if (sending || disabled || !canSubmit) return;
    const refs = attachments.map((attachment) => `@${attachment.path}`).join(" ");
    const displayText = [text, refs].filter(Boolean).join(text && refs ? " " : "");
    const projectLabel = selectedProjectId ? selectedProjectLabel() : "";
    const permissionLabel = selectedPermissionLabel();
    const contextLines = [
      projectLabel && `归属项目：${projectLabel}`,
      `工作权限：${permissionLabel}`,
    ].filter(Boolean);
    const submitText = [...contextLines, displayText].filter(Boolean).join("\n");
    onSend(displayText, submitText);
    attachments = [];
    fileMatches = [];
    closeMenus();
  }

  async function handleInput(event: Event) {
    const next = (event.currentTarget as HTMLTextAreaElement).value;
    onInput(next);
    void refreshSlashArgs(next);
    await refreshFileMatches(next);
  }

  async function refreshFileMatches(value: string) {
    const token = splitAtToken(value);
    if (!token) {
      fileMatches = [];
      return;
    }
    if (token.dir) {
      const entries = await app().ListDir(token.dir);
      fileMatches = entries.filter((entry) => entry.name.toLowerCase().includes(token.fragment)).slice(0, 8);
      return;
    }
    const [entries, searchEntries] = await Promise.all([app().ListDir(""), token.fragment ? app().SearchFileRefs(token.fragment) : Promise.resolve<DirEntry[]>([])]);
    const local = entries.filter((entry) => entry.name.toLowerCase().includes(token.fragment));
    const seen = new Set(local.map((entry) => entry.name));
    const searched = searchEntries.filter((entry) => !seen.has(entry.name));
    fileMatches = [...local, ...searched].slice(0, 8);
  }

  function insertCommand(command: CommandInfo) {
    const next = `/${command.name} `;
    onInput(next);
    void refreshSlashArgs(next);
  }

  async function refreshSlashArgs(value: string) {
    const request = (slashArgRequest += 1);
    if (!/^\/[^\s]+\s+/.test(value)) {
      slashArgItems = [];
      slashArgFrom = 0;
      return;
    }
    try {
      const result = await app().SlashArgs(value);
      if (request !== slashArgRequest) return;
      slashArgFrom = Math.max(0, result.from);
      slashArgItems = result.items.slice(0, 6);
    } catch {
      if (request === slashArgRequest) {
        slashArgItems = [];
        slashArgFrom = 0;
      }
    }
  }

  function insertSlashArg(item: SlashArgItem) {
    const prefix = input.slice(0, slashArgFrom);
    const suffix = item.insert.endsWith(" ") ? "" : " ";
    const next = `${prefix}${item.insert}${suffix}`;
    onInput(next);
    void refreshSlashArgs(next);
  }

  function insertFile(entry: DirEntry) {
    const token = splitAtToken(input);
    if (!token) return;
    const path = joinEntryPath(token.dir, entry);
    const next = input.replace(/@([^\s]*)$/, `@${path}${entry.isDir ? "" : " "}`);
    onInput(next);
    if (entry.isDir) {
      void refreshFileMatches(next);
      return;
    }
    fileMatches = [];
    onPreviewFile(path);
  }

  function handlePaste(event: ClipboardEvent) {
    const files = Array.from(event.clipboardData?.files ?? []);
    if (!files.length) return;
    event.preventDefault();
    attachFiles(files);
  }

  function handleDrop(event: DragEvent) {
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) {
      dragOver = false;
      return;
    }
    event.preventDefault();
    dragOver = false;
    attachFiles(files);
  }

  function handleDragOver(event: DragEvent) {
    const transfer = event.dataTransfer;
    const hasFiles = Array.from(transfer?.items ?? []).some((item) => item.kind === "file");
    if (!hasFiles) return;
    event.preventDefault();
    if (transfer) transfer.dropEffect = "copy";
    dragOver = true;
  }

  function handleComposerKeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && sending) {
      onCancel();
      return;
    }
    if (event.key !== "Enter") return;
    if (event.isComposing || event.keyCode === 229) return;
    if (event.shiftKey) return;
    event.preventDefault();
    submitComposer();
  }
</script>

<form
  bind:this={composerRoot}
  class={["composer", activityMode && `composer--${activityMode}`, dragOver && "composer--drop"]}
  style="--wails-drop-target: drop"
  aria-busy={pendingAttachmentWrites > 0}
  onsubmit={(event) => {
    event.preventDefault();
    submitComposer();
  }}
  ondrop={handleDrop}
  ondragover={handleDragOver}
  ondragleave={() => (dragOver = false)}
>
  <div class="composer__input">
    <textarea
      bind:this={textarea}
      data-composer-input
      data-testid="composer-input"
      value={input}
      placeholder="与智能助手对话.... (@ 提及文件)"
      rows="3"
      aria-label="Composer input"
      aria-keyshortcuts="Enter Shift+Enter Escape"
      oninput={handleInput}
      onpaste={handlePaste}
      onpointerdown={closeMenus}
      onfocus={closeMenus}
      onkeydown={handleComposerKeydown}
    ></textarea>

    <input bind:this={fileInput} class="composer__file" type="file" accept={fileAccept} multiple onchange={handleFilePicker} />

    {#if slashMatches.length}
      <div class="composer-menu">
        <span><Search size={13} /> {t.composer.commands}</span>
        {#each slashMatches as command, index (commandKey(command, index))}
          <button type="button" onclick={() => insertCommand(command)}>
            /{command.name}
            <em>{command.description}</em>
          </button>
        {/each}
      </div>
    {/if}

    {#if slashArgMode && slashArgItems.length}
      <div class="composer-menu">
        <span><Search size={13} /> {t.composer.arguments}</span>
        {#each slashArgItems as item, index (slashArgKey(item, index))}
          <button type="button" onclick={() => insertSlashArg(item)}>
            {item.label}
            <em>{item.hint || item.description}</em>
          </button>
        {/each}
      </div>
    {/if}

    {#if atMatch !== null && fileMatches.length}
      <div class="composer-menu">
        <span><AtSign size={13} /> {t.composer.fileReferences}</span>
        {#each fileMatches as entry, index (fileMatchKey(entry, index))}
          <button type="button" onclick={() => insertFile(entry)}>
            <FileText size={13} />
            {fileMatchLabel(atDir, entry)}
          </button>
        {/each}
      </div>
    {/if}

    {#if attachments.length || pendingAttachmentWrites > 0 || dragOver}
      <div class="composer-context" aria-label="Composer attachments">
        {#each attachments as attachment, index (attachmentKey(attachment, index))}
          <div class={["composer-context__item", attachment.previewUrl && "composer-context__item--image"]}>
            <span title={attachment.path}>
              {#if attachment.previewUrl}
                <img src={attachment.previewUrl} alt="" />
              {:else}
                <FileText size={14} />
              {/if}
              {baseName(attachment.path)}
            </span>
            <button type="button" aria-label={`Remove ${baseName(attachment.path)}`} onclick={() => removeAttachment(attachment.path)}>
              <X size={13} />
            </button>
          </div>
        {/each}
        {#if pendingAttachmentWrites > 0}
          <div class="composer-context__item composer-context__item--pending">
            <Image size={14} />
            {t.composer.attaching}
          </div>
        {/if}
        {#if dragOver}
          <div class="composer-context__item composer-context__item--pending">
            <FileText size={14} />
            {t.composer.dropToAttach}
          </div>
        {/if}
        {#if imageAttachmentNote}
          <div class={["composer-context__hint", selectedModelSupportsImages ? "composer-context__hint--vision" : "composer-context__hint--text"]}>
            <Image size={14} />
            <span>{imageAttachmentNote}</span>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <div class="composer__toolbar">
    <div class="composer__tools">
      <button class="composer__plus-trigger" type="button" aria-label="添加上下文" title="添加上下文" aria-expanded={plusMenuOpen} onclick={togglePlusMenu}>
        <Plus size={16} />
      </button>
      {#if plusMenuOpen}
        <div class="composer-plus-menu" role="menu">
          <span class="composer-plus-menu__title">Add</span>
          <button class="active" type="button" role="menuitem" onclick={() => openFilePicker()}>
            <Paperclip size={16} />
            <span><strong>Files and folders</strong></span>
          </button>
          <button type="button" role="menuitem" onclick={() => openFilePicker("image/*")}>
            <Image size={14} />
            <span><strong>附加 微信</strong></span>
          </button>
          <button type="button" role="menuitem" onclick={insertWorkspaceReference}>
            <Target size={15} />
            <span><strong>目标</strong></span>
          </button>
          <button type="button" role="menuitem" onclick={insertWorkspaceReference}>
            <ListChecks size={15} />
            <span><strong>计划模式</strong></span>
          </button>
          <span class="composer-plus-menu__title">插件</span>
          <button type="button" role="menuitem" onclick={() => openFilePicker()}>
            <FileText class="plugin-docs" size={16} />
            <span><strong>Documents</strong></span>
          </button>
          <button type="button" role="menuitem" onclick={() => openFilePicker(".pdf")}>
            <FileType class="plugin-pdf" size={16} />
            <span><strong>PDF</strong></span>
          </button>
          <button type="button" role="menuitem" onclick={() => openFilePicker(".xlsx,.xls,.csv,.tsv")}>
            <Table class="plugin-sheet" size={16} />
            <span><strong>Spreadsheets</strong></span>
          </button>
          <button type="button" role="menuitem" onclick={() => openFilePicker(".ppt,.pptx")}>
            <Presentation class="plugin-slides" size={16} />
            <span><strong>Presentations</strong></span>
          </button>
          {#if onOpenResources}
            <button type="button" role="menuitem" onclick={openResources}>
              <WandSparkles class="plugin-template" size={16} />
              <span><strong>Template Creator</strong></span>
            </button>
          {/if}
        </div>
      {/if}
      {#if projectOptions.length}
        <div class="composer__project-wrap">
          <button class="composer__link-picker" type="button" title={selectedProjectLabel()} aria-haspopup="menu" aria-expanded={projectMenuOpen} onclick={toggleProjectMenu}>
            <Folder size={14} />
            <span>{selectedProjectLabel()}</span>
          </button>
          {#if projectMenuOpen}
            <div class="composer-project-menu" role="menu">
              <div class="composer-project-menu__head">
                <strong>归属项目</strong>
              </div>
              <button class:active={!selectedProjectId} type="button" role="menuitem" onclick={() => setProject("")}>
                <i><Folder size={14} /></i>
                <span>
                  <strong>不归属项目</strong>
                </span>
                {#if !selectedProjectId}<Check size={16} />{/if}
              </button>
              {#each projectOptions as project, index (projectKey(project, index))}
                <button class:active={selectedProjectId === project.id} type="button" role="menuitem" onclick={() => setProject(project.id)}>
                  <i><FolderKanban size={14} /></i>
                  <span>
                    <strong>{project.label}</strong>
                  </span>
                  {#if selectedProjectId === project.id}<Check size={16} />{/if}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {/if}
      <div class="composer__permission-wrap">
        <button class="composer__permission-picker" type="button" title="工作权限" aria-haspopup="menu" aria-expanded={permissionMenuOpen} onclick={togglePermissionMenu}>
          <ShieldCheck size={14} />
          <span>{selectedPermissionLabel()}</span>
        </button>
        {#if permissionMenuOpen}
          <div class="composer-permission-menu" role="menu">
            <div class="composer-permission-menu__head">
              <strong>应如何批准操作？</strong>
              <span>了解更多</span>
            </div>
            {#each workPermissionOptions as option (option.id)}
              <button class:active={workPermission === option.id} type="button" role="menuitem" onclick={() => setWorkPermission(option.id)}>
                <i>{option.mark}</i>
                <span>
                  <strong>{option.label}</strong>
                </span>
                {#if workPermission === option.id}<Check size={16} />{/if}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>

    <div class="composer__actions">
      {#if disabledReason}
        <span class="composer__status" aria-live="polite">{disabledReason}</span>
      {/if}
      <select class="composer__model" aria-label={t.common.model} title={currentModelCapabilityTitle} value={selectedModel} onchange={onModelChange} disabled={!models.length}>
        {#if models.length}
          {#each models as model, index (modelKey(model, index))}
            {@const value = modelValue(model)}
            <option value={value}>{modelLabel(model, index)}</option>
          {/each}
        {:else}
          <option value="">选择模型</option>
        {/if}
      </select>
      {#if sending}
        <button class="composer__submit secondary" type="button" aria-label={t.composer.cancel} title={t.composer.cancel} onclick={onCancel}>
          <Square size={16} />
        </button>
      {:else}
        <button class="composer__submit" type="submit" aria-label={t.composer.send} title={disabledReason || t.composer.send} disabled={!canSubmit}>
          <Send size={16} />
          <span>{t.composer.send}</span>
        </button>
      {/if}
    </div>
  </div>
</form>
