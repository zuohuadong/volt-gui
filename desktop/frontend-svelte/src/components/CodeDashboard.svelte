<script lang="ts">
  import { onMount } from "svelte";
  import { ChevronDown, ChevronRight, Code2, ExternalLink, FileText, Folder, GitPullRequest, Gauge, LocateFixed, RefreshCw, RotateCcw } from "@lucide/svelte";
  import DiffViewer from "./DiffViewer.svelte";
  import { app } from "../lib/bridge";
  import type { CheckpointMeta, ContextPanelInfo, DirEntry, FilePreview, WorkspaceDiffView, WorkspaceChangesView } from "../lib/types";

  let {
    context,
    changes,
    checkpoints,
    filePreview,
    diffPreview,
    onPreviewFile,
    onPreviewChange,
    onRewind,
  }: {
    context?: ContextPanelInfo;
    changes?: WorkspaceChangesView;
    checkpoints: CheckpointMeta[];
    filePreview?: FilePreview;
    diffPreview?: WorkspaceDiffView;
    onPreviewFile: (path: string) => void;
    onPreviewChange: (path: string) => void;
    onRewind: (turn: number, scope: string) => void;
  } = $props();

  const tokenPercent = $derived(context ? Math.min(100, Math.round((context.usedTokens / Math.max(context.windowTokens, 1)) * 100)) : 0);
  const changedCount = $derived(changes?.files.length ?? 0);
  const selectedPath = $derived(diffPreview?.path ?? filePreview?.path);
  const selectedChange = $derived(selectedPath ? changes?.files.find((file) => file.path === selectedPath) : undefined);
  let entriesByDir = $state<Record<string, DirEntry[]>>({});
  let openDirs = $state<string[]>([""]);
  let treeStatus = $state("");
  let treeBusy = $state(false);

  const treeRows = $derived.by(() => {
    const rows: Array<DirEntry & { path: string; depth: number; open: boolean }> = [];
    function collect(dir: string, depth: number) {
      for (const entry of entriesByDir[dir] ?? []) {
        const path = entryPath(dir, entry);
        const open = entry.isDir && openDirs.includes(path);
        rows.push({ ...entry, path, depth, open });
        if (entry.isDir && open) collect(path, depth + 1);
      }
    }
    collect("", 0);
    return rows;
  });

  onMount(() => {
    void refreshTree();
  });

  function entryPath(dir: string, entry: DirEntry) {
    return dir ? `${dir}/${entry.name}` : entry.name;
  }

  async function loadDir(dir: string) {
    const entries = await app().ListDir(dir);
    entriesByDir = { ...entriesByDir, [dir]: entries };
  }

  async function refreshTree() {
    treeBusy = true;
    treeStatus = "Loading file tree...";
    try {
      entriesByDir = {};
      openDirs = [""];
      await loadDir("");
      treeStatus = "File tree ready";
    } catch (error) {
      treeStatus = error instanceof Error ? error.message : String(error);
    } finally {
      treeBusy = false;
    }
  }

  async function toggleDir(path: string) {
    if (openDirs.includes(path)) {
      openDirs = openDirs.filter((dir) => dir !== path);
      return;
    }
    openDirs = [...openDirs, path];
    if (!entriesByDir[path]) await loadDir(path);
  }

  async function selectTreeRow(row: DirEntry & { path: string }) {
    if (row.isDir) {
      await toggleDir(row.path);
      return;
    }
    onPreviewFile(row.path);
  }

  async function openWorkspacePath(path: string) {
    await app().OpenWorkspacePath(path);
    treeStatus = `Opened ${path}`;
  }

  async function revealWorkspacePath(path: string) {
    await app().RevealWorkspacePath(path);
    treeStatus = `Revealed ${path}`;
  }
</script>

<section class="code-layout" aria-label="Code workspace">
  <div class="dashboard-grid">
    <article>
      <Gauge size={20} />
      <h2>Context</h2>
      <p>{context ? `${context.usedTokens.toLocaleString()} / ${context.windowTokens.toLocaleString()} tokens (${tokenPercent}%)` : "Context panel pending."}</p>
    </article>
    <article>
      <GitPullRequest size={20} />
      <h2>Changed files</h2>
      <p>{changedCount === 0 ? "Workspace is clean." : `${changedCount} files have pending changes.`}</p>
    </article>
    <article>
      <RotateCcw size={20} />
      <h2>Checkpoints</h2>
      <p>{checkpoints.length ? `${checkpoints.length} rewind points available for this tab.` : "No checkpoints yet."}</p>
    </article>
  </div>

  <aside class="code-dock">
    <section>
      <div class="code-dock__section-head">
        <h2><Folder size={15} /> Files</h2>
        <button type="button" title="Refresh file tree" disabled={treeBusy} onclick={refreshTree}><RefreshCw size={14} /></button>
      </div>
      <div class="file-tree" data-testid="code-file-tree">
        {#if treeRows.length}
          {#each treeRows as row (row.path)}
            <div class={["file-tree__row", selectedPath === row.path && "file-tree__row--active"]} data-path={row.path} data-dir={row.isDir} style:--tree-depth={row.depth}>
              <button type="button" class="file-tree__main" onclick={() => selectTreeRow(row)}>
                {#if row.isDir}
                  {#if row.open}
                    <ChevronDown size={13} />
                  {:else}
                    <ChevronRight size={13} />
                  {/if}
                  <Folder size={14} />
                {:else}
                  <span class="file-tree__spacer"></span>
                  <FileText size={14} />
                {/if}
                <span>{row.name}</span>
              </button>
              <div class="file-tree__actions">
                <button type="button" title={`Open ${row.path}`} onclick={() => openWorkspacePath(row.path)}><ExternalLink size={13} /></button>
                <button type="button" title={`Reveal ${row.path}`} onclick={() => revealWorkspacePath(row.path)}><LocateFixed size={13} /></button>
              </div>
            </div>
          {/each}
        {:else}
          <span>{treeStatus || "No workspace files."}</span>
        {/if}
      </div>
      {#if treeStatus}
        <span class="code-dock__status">{treeStatus}</span>
      {/if}
    </section>
    <section>
      <h2><Code2 size={15} /> Read files</h2>
      {#if context?.readFiles.length}
        {#each context.readFiles as file (`${file.path}-${file.turn}`)}
          <button type="button" onclick={() => onPreviewFile(file.path)}>{file.path}</button>
        {/each}
      {:else}
        <span>No files read yet.</span>
      {/if}
    </section>
    <section>
      <h2><GitPullRequest size={15} /> Changes</h2>
      {#if changes?.files.length}
        {#each changes.files as file (file.path)}
          <button type="button" onclick={() => onPreviewChange(file.path)}>
            <strong>{file.gitStatus || "?"}</strong>
            <span>{file.path}</span>
          </button>
        {/each}
      {:else}
        <span>{changes?.gitErr || "No changed files."}</span>
      {/if}
    </section>
    <section>
      <h2><RotateCcw size={15} /> Checkpoints</h2>
      {#if checkpoints.length}
        {#each checkpoints as checkpoint (checkpoint.turn)}
          <div class="checkpoint">
            <strong>#{checkpoint.turn} {checkpoint.prompt}</strong>
            <span>{checkpoint.files.length} files</span>
            <div>
              {#if checkpoint.canConversation !== false}
                <button type="button" onclick={() => onRewind(checkpoint.turn, "conversation")}>Conversation</button>
              {/if}
              {#if checkpoint.canCode !== false}
                <button type="button" onclick={() => onRewind(checkpoint.turn, "code")}>Code</button>
              {/if}
              <button type="button" onclick={() => onRewind(checkpoint.turn, "both")}>Both</button>
            </div>
          </div>
        {/each}
      {:else}
        <span>No rewind points yet.</span>
      {/if}
    </section>
    <section>
      <h2><FileText size={15} /> Preview</h2>
      <DiffViewer change={selectedChange} preview={filePreview} diff={diffPreview} />
    </section>
  </aside>
</section>
