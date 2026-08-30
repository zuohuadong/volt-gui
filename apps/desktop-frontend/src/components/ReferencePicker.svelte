<script lang="ts">
  import { File, Folder, History, LoaderCircle } from "@lucide/svelte";
  import type { DshClient, FileReferenceCandidate, SessionReferenceCandidate } from "$lib/dsh-client";

  interface Props {
    readonly client?: DshClient;
    readonly sessionId: string;
    value?: string;
    readonly rows?: number;
    readonly disabled?: boolean;
    readonly placeholder?: string;
    readonly onSubmit?: () => void;
  }

  let { client, sessionId, value = $bindable(""), rows = 4, disabled = false, placeholder = "", onSubmit }: Props = $props();
  let inputElement = $state<HTMLTextAreaElement>();
  let candidates = $state<Array<{ kind: "file" | "directory" | "session"; label: string; detail: string; path?: string; mention?: string }>>([]);
  let highlighted = $state(0);
  let busy = $state(false);
  let tokenStart = $state(-1);
  let tokenEnd = $state(-1);
  let queryToken = $state("");
  let requestSerial = 0;

  function activeToken(text: string, cursor: number): { start: number; end: number; query: string; quoted: boolean } | undefined {
    const before = text.slice(0, cursor);
    const quoted = /(^|\s)(@"([^"]*))$/u.exec(before);
    if (quoted?.index !== undefined && quoted[1] !== undefined && quoted[3] !== undefined) {
      return { start: quoted.index + quoted[1].length, end: cursor, query: quoted[3], quoted: true };
    }
    const plain = /(^|\s)(@([^\s]*))$/u.exec(before);
    if (plain?.index !== undefined && plain[1] !== undefined && plain[3] !== undefined) {
      return { start: plain.index + plain[1].length, end: cursor, query: plain[3], quoted: false };
    }
    return undefined;
  }

  function encodeSessionUri(session: string): string {
    const bytes = new TextEncoder().encode(JSON.stringify(session));
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `dsh-session:${btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "")}`;
  }

  function fileMention(item: FileReferenceCandidate, quoted: boolean): string {
    const path = item.kind === "directory" ? `${item.path}/` : item.path;
    const needsQuote = quoted || /\s/u.test(path);
    if (!needsQuote) return `@${path}`;
    return item.kind === "directory" ? `@"${path}` : `@"${path}"`;
  }

  async function refreshSuggestions(): Promise<void> {
    const element = inputElement;
    if (!client || !sessionId || !element) return;
    const cursor = element.selectionStart;
    const token = activeToken(value, cursor);
    if (!token) { candidates = []; tokenStart = -1; return; }
    tokenStart = token.start;
    tokenEnd = token.end;
    queryToken = token.query;
    const serial = ++requestSerial;
    busy = true;
    try {
      const [files, sessions] = await Promise.all([
        client.listFileReferences(sessionId, token.query).catch(() => []),
        client.listSessionReferenceCandidates(sessionId, token.query).catch(() => []),
      ]);
      if (serial !== requestSerial) return;
      candidates = [
        ...files.slice(0, 8).map((item) => ({ kind: item.kind, label: item.path, detail: item.kind === "directory" ? "目录" : "文件", path: fileMention(item, token.quoted) })),
        ...sessions.slice(0, 5).map((item) => ({ kind: "session" as const, label: item.label, detail: item.cwd || "会话快照", mention: item.mention || `@[${item.label}](${encodeSessionUri(item.sessionId)})` })),
      ];
      highlighted = Math.min(highlighted, Math.max(candidates.length - 1, 0));
    } finally {
      if (serial === requestSerial) busy = false;
    }
  }

  function selectCandidate(candidate: typeof candidates[number]): void {
    if (tokenStart < 0 || tokenEnd < 0 || !inputElement) return;
    const replacement = candidate.kind === "session" ? candidate.mention || "" : candidate.path || "";
    value = `${value.slice(0, tokenStart)}${replacement}${value.slice(tokenEnd)}`;
    candidates = [];
    const cursor = tokenStart + replacement.length;
    requestAnimationFrame(() => { inputElement?.focus(); inputElement?.setSelectionRange(cursor, cursor); });
  }

  function onInput(event: Event): void {
    value = (event.currentTarget as HTMLTextAreaElement).value;
    void refreshSuggestions();
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); onSubmit?.(); return; }
    if (candidates.length === 0) return;
    if (event.key === "ArrowDown") { event.preventDefault(); highlighted = (highlighted + 1) % candidates.length; }
    else if (event.key === "ArrowUp") { event.preventDefault(); highlighted = (highlighted - 1 + candidates.length) % candidates.length; }
    else if (event.key === "Enter" || event.key === "Tab") { event.preventDefault(); selectCandidate(candidates[highlighted]); }
    else if (event.key === "Escape") { candidates = []; }
  }
</script>

<div class="reference-picker">
  <textarea bind:this={inputElement} bind:value rows={rows} {disabled} {placeholder} oninput={onInput} onkeydown={onKeydown} aria-label="任务输入"></textarea>
  {#if busy || candidates.length > 0}
    <div class="reference-suggestions" role="listbox" aria-label="引用候选">
      {#if busy}<div class="reference-loading"><LoaderCircle class="animate-spin" size={13} />正在查找官方引用…</div>{/if}
      {#each candidates as candidate, index (candidate.kind + candidate.label)}
        <button class:active={index === highlighted} type="button" role="option" aria-selected={index === highlighted} onclick={() => selectCandidate(candidate)}>
          <span class="reference-icon">{#if candidate.kind === "session"}<History size={14} />{:else if candidate.kind === "directory"}<Folder size={14} />{:else}<File size={14} />{/if}</span>
          <span><strong>{candidate.label}</strong><small>{candidate.detail}</small></span>
        </button>
      {/each}
      {#if !busy && candidates.length === 0 && queryToken}<div class="reference-empty">没有匹配的官方引用</div>{/if}
    </div>
  {/if}
</div>
