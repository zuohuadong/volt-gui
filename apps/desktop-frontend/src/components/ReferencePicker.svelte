<script lang="ts">
  import { File, Folder, History } from "@lucide/svelte";
  import {
    PromptInputCommand,
    PromptInputCommandEmpty,
    PromptInputCommandGroup,
    PromptInputCommandItem,
    PromptInputCommandList,
    PromptInputTextarea,
    Loader,
    usePromptInputController,
  } from "@svadmin/ai-elements";
  import type { DshClient, DshSkill, FileReferenceCandidate, SessionReferenceCandidate } from "$lib/dsh-client";

  interface Candidate {
    kind: "file" | "directory" | "session" | "command";
    label: string;
    detail: string;
    path?: string;
    mention?: string;
    replacement?: string;
  }

  interface Props {
    readonly client?: DshClient;
    readonly skills?: DshSkill[];
    readonly sessionId: string;
    readonly rows?: number;
    readonly disabled?: boolean;
    readonly placeholder?: string;
  }

  let { client, skills = [], sessionId, rows = 4, disabled = false, placeholder = "" }: Props = $props();
  const controller = usePromptInputController();
  let inputElement = $state<HTMLTextAreaElement>();
  let candidates = $state<Candidate[]>([]);
  let busy = $state(false);
  let queryToken = $state("");
  let highlighted = $state(0);
  let tokenStart = $state(-1);
  let tokenEnd = $state(-1);
  let requestSerial = 0;

  function activeToken(text: string, cursor: number): { start: number; end: number; query: string; quoted: boolean; prefix: "@" | "/" } | undefined {
    const before = text.slice(0, cursor);
    const quoted = /(^|\s)(@"([^"]*))$/u.exec(before);
    if (quoted?.index !== undefined && quoted[1] !== undefined && quoted[3] !== undefined) {
      return { start: quoted.index + quoted[1].length, end: cursor, query: quoted[3], quoted: true, prefix: "@" };
    }
    const plain = /(^|\s)(@([^\s]*))$/u.exec(before);
    if (plain?.index !== undefined && plain[1] !== undefined && plain[3] !== undefined) {
      return { start: plain.index + plain[1].length, end: cursor, query: plain[3], quoted: false, prefix: "@" };
    }
    const command = /(^|\s)(\/([^\s]*))$/u.exec(before);
    if (command?.index !== undefined && command[1] !== undefined && command[3] !== undefined) {
      return { start: command.index + command[1].length, end: cursor, query: command[3], quoted: false, prefix: "/" };
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
    if (!quoted && !/\s/u.test(path)) return `@${path}`;
    return item.kind === "directory" ? `@"${path}` : `@"${path}"`;
  }

  async function refreshSuggestions(text: string, cursor: number): Promise<void> {
    if (!client || !sessionId) return;
    const token = activeToken(text, cursor);
    if (!token) {
      requestSerial += 1;
      busy = false;
      candidates = [];
      queryToken = "";
      tokenStart = -1;
      tokenEnd = -1;
      return;
    }
    tokenStart = token.start;
    tokenEnd = token.end;
    queryToken = token.query;
    const serial = ++requestSerial;
    busy = true;
    try {
      if (token.prefix === "/") {
        candidates = skills
          .filter((skill) => `${skill.name} ${skill.description}`.toLowerCase().includes(token.query.toLowerCase()))
          .slice(0, 8)
          .map((skill) => ({ kind: "command" as const, label: `/${skill.name}`, detail: skill.description || "官方 Skill", replacement: `/${skill.name} ` }));
        highlighted = Math.min(highlighted, Math.max(candidates.length - 1, 0));
        return;
      }
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

  function onInput(event: Event): void {
    inputElement = event.currentTarget as HTMLTextAreaElement;
    void refreshSuggestions(inputElement.value, inputElement.selectionStart);
  }

  function onKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) return;
    if (candidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        highlighted = (highlighted + 1) % candidates.length;
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        highlighted = (highlighted - 1 + candidates.length) % candidates.length;
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        selectCandidate(candidates[highlighted]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        candidates = [];
        queryToken = "";
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      event.preventDefault();
      const textarea = event.currentTarget as HTMLTextAreaElement;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const current = controller.textInput.value;
      const next = `${current.slice(0, start)}\n${current.slice(end)}`;
      controller.textInput.setInput(next);
      requestAnimationFrame(() => {
        inputElement?.focus();
        inputElement?.setSelectionRange(start + 1, start + 1);
      });
    }
  }

  function selectCandidate(candidate: Candidate): void {
    if (tokenStart < 0 || tokenEnd < 0) return;
    const current = controller.textInput.value;
    const replacement = candidate.replacement || (candidate.kind === "session" ? candidate.mention || "" : candidate.path || "");
    const next = `${current.slice(0, tokenStart)}${replacement}${current.slice(tokenEnd)}`;
    controller.textInput.setInput(next);
    candidates = [];
    queryToken = "";
    const cursor = tokenStart + replacement.length;
    requestAnimationFrame(() => {
      inputElement?.focus();
      inputElement?.setSelectionRange(cursor, cursor);
    });
  }
</script>

<div class="reference-picker">
  <PromptInputTextarea
    {rows}
    {disabled}
    {placeholder}
    aria-label="任务输入"
    oninput={onInput}
    onkeydown={onKeydown}
  />
  {#if busy || candidates.length > 0 || queryToken}
    <PromptInputCommand bind:value={queryToken} class="reference-command">
      {#if busy}<div class="reference-loading"><Loader size={13} label="正在查找官方引用" />正在查找官方引用…</div>{/if}
      <PromptInputCommandList>
        <PromptInputCommandGroup>
          {#each candidates as candidate, index (candidate.kind + candidate.label)}
            <PromptInputCommandItem class={index === highlighted ? "active" : ""} value={`${candidate.label} ${candidate.detail}`} onclick={() => selectCandidate(candidate)}>
              <span class="reference-icon">{#if candidate.kind === "session"}<History size={14} />{:else if candidate.kind === "directory"}<Folder size={14} />{:else}<File size={14} />{/if}</span>
              <span><strong>{candidate.label}</strong><small>{candidate.detail}</small></span>
            </PromptInputCommandItem>
          {/each}
          {#if !busy && candidates.length === 0 && queryToken}<PromptInputCommandEmpty>没有匹配的官方引用</PromptInputCommandEmpty>{/if}
        </PromptInputCommandGroup>
      </PromptInputCommandList>
    </PromptInputCommand>
  {/if}
</div>
