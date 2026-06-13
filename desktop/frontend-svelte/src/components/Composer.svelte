<script lang="ts">
  import { onMount } from "svelte";
  import { AtSign, FileText, Image, Search, Send, Square, X } from "@lucide/svelte";
  import { app, onFilesDropped } from "../lib/bridge";
  import type { ActivityMode, CommandInfo, ComposerAttachment, DirEntry, RunMode, SlashArgItem } from "../lib/types";

  let {
    input,
    activityMode,
    runMode,
    commands,
    sending,
    onInput,
    onSend,
    onCancel,
    onPreviewFile,
  }: {
    input: string;
    activityMode: ActivityMode;
    runMode: RunMode;
    commands: CommandInfo[];
    sending: boolean;
    onInput: (value: string) => void;
    onSend: (displayText: string, submitText?: string) => void;
    onCancel: () => void;
    onPreviewFile: (path: string) => void;
  } = $props();

  let fileMatches = $state<DirEntry[]>([]);
  let slashArgItems = $state<SlashArgItem[]>([]);
  let slashArgFrom = $state(0);
  let slashArgRequest = 0;
  let attachments = $state<ComposerAttachment[]>([]);
  let pendingAttachmentWrites = $state(0);
  let dragOver = $state(false);

  const slashQuery = $derived(input.startsWith("/") && !/\s/.test(input) ? input.slice(1).toLowerCase() : null);
  const slashMatches = $derived(slashQuery === null ? [] : commands.filter((command) => command.name.toLowerCase().includes(slashQuery)).slice(0, 6));
  const slashArgMode = $derived(/^\/[^\s]+\s+/.test(input));
  const atMatch = $derived(/(?:^|\s)@([^\s]*)$/.exec(input)?.[1] ?? null);
  const atDir = $derived(splitAtToken(input)?.dir ?? "");
  const canSubmit = $derived((input.trim() !== "" || attachments.length > 0) && pendingAttachmentWrites === 0);

  onMount(() => onFilesDropped((paths) => void attachDroppedPaths(paths)));

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
    if (!canSubmit) return;
    const refs = attachments.map((attachment) => `@${attachment.path}`).join(" ");
    const displayText = [text, refs].filter(Boolean).join(text && refs ? " " : "");
    onSend(displayText, displayText);
    attachments = [];
    fileMatches = [];
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
</script>

<form
  class={["composer", dragOver && "composer--drop"]}
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
      data-composer-input
      data-testid="composer-input"
      value={input}
      placeholder={`Send a ${activityMode} request in ${runMode.toUpperCase()} mode...`}
      rows="3"
      aria-label="Composer input"
      aria-keyshortcuts="Control+K Meta+K Control+Enter Meta+Enter Escape"
      oninput={handleInput}
      onpaste={handlePaste}
      onkeydown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") submitComposer();
        if (event.key === "Escape" && sending) onCancel();
      }}
    ></textarea>

    {#if slashMatches.length}
      <div class="composer-menu">
        <span><Search size={13} /> Commands</span>
        {#each slashMatches as command (command.name)}
          <button type="button" onclick={() => insertCommand(command)}>
            /{command.name}
            <em>{command.description}</em>
          </button>
        {/each}
      </div>
    {/if}

    {#if slashArgMode && slashArgItems.length}
      <div class="composer-menu">
        <span><Search size={13} /> Arguments</span>
        {#each slashArgItems as item (item.label)}
          <button type="button" onclick={() => insertSlashArg(item)}>
            {item.label}
            <em>{item.hint || item.description}</em>
          </button>
        {/each}
      </div>
    {/if}

    {#if atMatch !== null && fileMatches.length}
      <div class="composer-menu">
        <span><AtSign size={13} /> File references</span>
        {#each fileMatches as entry (entry.name)}
          <button type="button" onclick={() => insertFile(entry)}>
            <FileText size={13} />
            {fileMatchLabel(atDir, entry)}
          </button>
        {/each}
      </div>
    {/if}

    {#if attachments.length || pendingAttachmentWrites > 0 || dragOver}
      <div class="composer-context" aria-label="Composer attachments">
        {#each attachments as attachment (attachment.path)}
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
            Attaching...
          </div>
        {/if}
        {#if dragOver}
          <div class="composer-context__item composer-context__item--pending">
            <FileText size={14} />
            Drop to attach
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if sending}
    <button class="secondary" type="button" onclick={onCancel}>
      <Square size={16} />
      Cancel
    </button>
  {:else}
    <button type="submit" disabled={!canSubmit}>
      <Send size={16} />
      Send
    </button>
  {/if}
</form>
