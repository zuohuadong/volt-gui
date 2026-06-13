<script lang="ts">
  import { AtSign, FileText, Search, Send, Square } from "@lucide/svelte";
  import { app } from "../lib/bridge";
  import type { ActivityMode, CommandInfo, DirEntry, RunMode } from "../lib/types";

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
    onSend: () => void;
    onCancel: () => void;
    onPreviewFile: (path: string) => void;
  } = $props();

  let fileMatches = $state<DirEntry[]>([]);

  const slashQuery = $derived(input.startsWith("/") && !/\s/.test(input) ? input.slice(1).toLowerCase() : null);
  const slashMatches = $derived(slashQuery === null ? [] : commands.filter((command) => command.name.toLowerCase().includes(slashQuery)).slice(0, 6));
  const atMatch = $derived(/(?:^|\s)@([^\s]*)$/.exec(input)?.[1] ?? null);

  async function handleInput(event: Event) {
    const next = (event.currentTarget as HTMLTextAreaElement).value;
    onInput(next);
    const match = /(?:^|\s)@([^\s]*)$/.exec(next)?.[1] ?? null;
    if (!match) {
      fileMatches = [];
      return;
    }
    fileMatches = await app().SearchFileRefs(match);
  }

  function insertCommand(command: CommandInfo) {
    onInput(`/${command.name} `);
  }

  function insertFile(entry: DirEntry) {
    onInput(input.replace(/@([^\s]*)$/, `@${entry.name} `));
    fileMatches = [];
    if (!entry.isDir) onPreviewFile(entry.name);
  }
</script>

<form class="composer" onsubmit={(event) => { event.preventDefault(); onSend(); }}>
  <div class="composer__input">
    <textarea
      value={input}
      placeholder={`Send a ${activityMode} request in ${runMode.toUpperCase()} mode...`}
      rows="3"
      oninput={handleInput}
      onkeydown={(event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === "Enter") onSend();
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

    {#if atMatch !== null && fileMatches.length}
      <div class="composer-menu">
        <span><AtSign size={13} /> File references</span>
        {#each fileMatches as entry (entry.name)}
          <button type="button" onclick={() => insertFile(entry)}>
            <FileText size={13} />
            {entry.name}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  {#if sending}
    <button class="secondary" type="button" onclick={onCancel}>
      <Square size={16} />
      Cancel
    </button>
  {:else}
    <button type="submit" disabled={!input.trim()}>
      <Send size={16} />
      Send
    </button>
  {/if}
</form>
