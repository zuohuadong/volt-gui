<script lang="ts">
  import { onMount } from "svelte";
  import { ChevronDown, ChevronRight, Code2, ExternalLink, FileText, Folder, GitPullRequest, Gauge, LocateFixed, RefreshCw, RotateCcw, Search } from "@lucide/svelte";
  import DiffViewer from "./DiffViewer.svelte";
  import { app } from "../lib/bridge";
  import { contextRemainingPercent, contextRemainingTokens } from "../lib/thread-ux";
  import type { CheckpointMeta, ContextPanelInfo, DirEntry, FilePreview, WorkspaceDiffView, WorkspaceChangesView } from "../lib/types";
  import { t } from "../lib/i18n";

  type RewindScope = "conversation" | "code" | "both";
  type CodeDashboardVariant = "dock" | "workbench";
  type CodeDashboardFocus = "overview" | "workspace" | "context" | "changes" | "checkpoints";

  let {
    context,
    changes,
    checkpoints,
    filePreview,
    diffPreview,
    onPreviewFile,
    onPreviewChange,
    onFork,
    onRewind,
    onRefreshContext,
    variant = "dock",
    focus = "overview",
  }: {
    context?: ContextPanelInfo;
    changes?: WorkspaceChangesView;
    checkpoints: CheckpointMeta[];
    filePreview?: FilePreview;
    diffPreview?: WorkspaceDiffView;
    onPreviewFile: (path: string) => void;
    onPreviewChange: (path: string) => void;
    onFork: (turn: number) => Promise<void> | void;
    onRewind: (turn: number, scope: RewindScope) => Promise<void> | void;
    onRefreshContext: () => Promise<void> | void;
    variant?: CodeDashboardVariant;
    focus?: CodeDashboardFocus;
  } = $props();

  let entriesByDir = $state<Record<string, DirEntry[]>>({});
  let openDirs = $state<string[]>([""]);
  let treeStatus = $state("");
  let treeBusy = $state(false);
  let contextDetail = $state<"read" | "changed">("read");
  let contextQuery = $state("");
  let contextStatus = $state("");
  let contextBusy = $state(false);
  let rewindBusy = $state("");
  let rewindStatus = $state("");

  const remainingPercent = $derived(contextRemainingPercent(context));
  const remainingTokens = $derived(contextRemainingTokens(context));
  const changedCount = $derived(changes?.files.length ?? 0);
  const selectedPath = $derived(diffPreview?.path ?? filePreview?.path);
  const selectedChange = $derived(selectedPath ? changes?.files.find((file) => file.path === selectedPath) : undefined);
  const promptTokens = $derived(context?.promptTokens ?? 0);
  const completionTokens = $derived(context?.completionTokens ?? 0);
  const reasoningTokens = $derived(context?.reasoningTokens ?? 0);
  const otherTokens = $derived(Math.max(0, (context?.usedTokens ?? 0) - promptTokens - completionTokens - reasoningTokens));
  const cacheTotal = $derived((context?.cacheHitTokens ?? 0) + (context?.cacheMissTokens ?? 0));
  const cachePercent = $derived(cacheTotal > 0 ? Math.round(((context?.cacheHitTokens ?? 0) / cacheTotal) * 100) : 0);
  const contextRows = $derived.by(() => {
    if (contextDetail === "changed") {
      return (context?.changedFiles ?? []).map((file, index) => ({
        key: `${file.path}-${index}`,
        path: file.path,
        meta: file.gitStatus || file.sources.join(", ") || "changed",
        detail: file.turns?.length ? `turns ${file.turns.join(", ")}` : "",
        time: file.latestTime ?? 0,
      }));
    }
    return (context?.readFiles ?? []).map((file, index) => ({
      key: `${file.path}-${index}`,
      path: file.path,
      meta: `turn ${file.turn}`,
      detail: file.limit ? `${file.offset ?? 0}-${(file.offset ?? 0) + file.limit}${file.truncated ? " truncated" : ""}` : "",
      time: file.time,
    }));
  });
  const filteredContextRows = $derived.by(() => {
    const query = contextQuery.trim().toLowerCase();
    if (!query) return contextRows;
    return contextRows.filter((row) => `${row.path} ${row.meta} ${row.detail}`.toLowerCase().includes(query));
  });
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

  function formatTokens(value: number) {
    if (value >= 1000) return `${Math.round(value / 1000)}k`;
    return String(value);
  }

  function formatTime(ms: number) {
    if (!ms) return "";
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function formatCheckpointFiles(checkpoint: CheckpointMeta) {
    if (!checkpoint.files.length) return "conversation only";
    const first = checkpoint.files.slice(0, 2).join(", ");
    const remaining = checkpoint.files.length > 2 ? ` +${checkpoint.files.length - 2}` : "";
    return `${first}${remaining}`;
  }

  function statusLabel(status?: string) {
    if (!status) return "changed";
    if (status === "??") return "untracked";
    if (status.includes("R")) return "renamed";
    if (status.includes("A")) return "added";
    if (status.includes("D")) return "deleted";
    if (status.includes("M")) return "modified";
    return status;
  }

  function stageLabels(file: { indexStatus?: string; worktreeStatus?: string }) {
    const labels: string[] = [];
    if (file.indexStatus && file.indexStatus !== "?") labels.push("staged");
    if (file.worktreeStatus && file.worktreeStatus !== "?") labels.push("unstaged");
    if (file.indexStatus === "?" || file.worktreeStatus === "?") labels.push("untracked");
    return labels;
  }

  async function rewindCheckpoint(checkpoint: CheckpointMeta, scope: RewindScope) {
    const key = `${checkpoint.turn}:${scope}`;
    rewindBusy = key;
    rewindStatus = `Rewinding #${checkpoint.turn} ${scope}...`;
    try {
      await onRewind(checkpoint.turn, scope);
      rewindStatus = `Rewound #${checkpoint.turn} ${scope}; refreshed history, context, changes, and checkpoints.`;
    } catch (error) {
      rewindStatus = error instanceof Error ? error.message : String(error);
    } finally {
      rewindBusy = "";
    }
  }

  async function forkCheckpoint(checkpoint: CheckpointMeta) {
    const key = `${checkpoint.turn}:fork`;
    rewindBusy = key;
    rewindStatus = `Forking #${checkpoint.turn}...`;
    try {
      await onFork(checkpoint.turn);
      rewindStatus = `Forked #${checkpoint.turn} into a new Thread.`;
    } catch (error) {
      rewindStatus = error instanceof Error ? error.message : String(error);
    } finally {
      rewindBusy = "";
    }
  }

  async function refreshContextPanel() {
    contextBusy = true;
    contextStatus = "Refreshing context...";
    try {
      await onRefreshContext();
      contextStatus = "Context refreshed";
    } catch (error) {
      contextStatus = error instanceof Error ? error.message : String(error);
    } finally {
      contextBusy = false;
    }
  }
</script>

<section class={["code-layout", `code-layout--${variant}`, `code-layout--focus-${focus}`]} aria-label="Code workspace">
  <div class="dashboard-grid">
    <article>
      <Gauge size={20} />
      <h2>{t.code.contextFiles}</h2>
      <p>{remainingPercent === undefined || remainingTokens === undefined ? "上下文待统计。" : `剩余 ${remainingTokens.toLocaleString()} / ${context?.windowTokens.toLocaleString()} tokens (${remainingPercent}%)`}</p>
    </article>
    <article>
      <GitPullRequest size={20} />
      <h2>Changed files</h2>
      <p>{changedCount === 0 ? "Workspace is clean." : `${changedCount} files have pending changes.`}</p>
    </article>
    <article>
      <RotateCcw size={20} />
      <h2>{t.code.checkpoints}</h2>
      <p>{checkpoints.length ? `${checkpoints.length} rewind points available for this tab.` : "No checkpoints yet."}</p>
    </article>
  </div>

  <aside class="code-dock">
    <section class={["context-card", (focus === "context" || focus === "overview") && "is-focus"]} data-testid="code-context-panel">
      <div class="code-dock__section-head">
        <h2><Gauge size={15} /> {t.code.contextFiles}</h2>
        <button type="button" title={t.code.refresh} disabled={contextBusy} onclick={refreshContextPanel}><RefreshCw size={14} /></button>
      </div>
      {#if context}
        <div class="context-card__meter" style:--context-used={`${remainingPercent ?? 0}%`}>
          <div>
            <strong>{formatTokens(remainingTokens ?? 0)}</strong>
            <span>/ {formatTokens(context.windowTokens)} tokens 剩余</span>
          </div>
          <span>{remainingPercent === undefined ? "待统计" : `${remainingPercent}%`}</span>
        </div>
        <div class="context-card__bar" aria-label="Context remaining">
          <span></span>
        </div>
        <div class="context-card__metrics">
          <div><span>Prompt</span><strong>{promptTokens.toLocaleString()}</strong></div>
          <div><span>Completion</span><strong>{completionTokens.toLocaleString()}</strong></div>
          <div><span>Reasoning</span><strong>{reasoningTokens.toLocaleString()}</strong></div>
          <div><span>Other</span><strong>{otherTokens.toLocaleString()}</strong></div>
          <div><span>Cache hit</span><strong>{cachePercent ? `${cachePercent}%` : "-"}</strong></div>
        </div>
        <div class="context-card__tabs" role="tablist" aria-label="Context detail">
          <button type="button" aria-pressed={contextDetail === "read"} onclick={() => (contextDetail = "read")}>Read {context.readFiles.length}</button>
          <button type="button" aria-pressed={contextDetail === "changed"} onclick={() => (contextDetail = "changed")}>Changed {context.changedFiles.length}</button>
        </div>
        <label class="context-card__search">
          <Search size={14} />
          <input aria-label="Filter context files" placeholder={t.code.filter} bind:value={contextQuery} />
        </label>
        <div class="context-card__rows">
          {#each filteredContextRows.slice(0, 6) as row (row.key)}
            <button
              type="button"
              data-context-path={row.path}
              onclick={() => (contextDetail === "changed" ? onPreviewChange(row.path) : onPreviewFile(row.path))}
            >
              <span>{row.path}</span>
              <em>{row.meta}{row.detail ? ` · ${row.detail}` : ""}{row.time ? ` · ${formatTime(row.time)}` : ""}</em>
            </button>
          {:else}
            <span>{contextDetail === "changed" ? "No changed files in context." : "No read files in context."}</span>
          {/each}
        </div>
        {#if contextStatus}
          <span class="code-dock__status">{contextStatus}</span>
        {/if}
      {:else}
        <span>Context panel pending.</span>
      {/if}
    </section>
    <section class={[(focus === "workspace" || focus === "overview") && "is-focus"]}>
      <div class="code-dock__section-head">
        <h2><Folder size={15} /> Files</h2>
        <button type="button" title={t.code.refresh} disabled={treeBusy} onclick={refreshTree}><RefreshCw size={14} /></button>
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
                <button type="button" title={`${t.code.open} ${row.path}`} onclick={() => openWorkspacePath(row.path)}><ExternalLink size={13} /></button>
                <button type="button" title={`${t.code.reveal} ${row.path}`} onclick={() => revealWorkspacePath(row.path)}><LocateFixed size={13} /></button>
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
    <section class={[focus === "context" && "is-focus"]}>
      <h2><Code2 size={15} /> Read files</h2>
      {#if context?.readFiles.length}
        {#each context.readFiles as file (`${file.path}-${file.turn}`)}
          <button type="button" onclick={() => onPreviewFile(file.path)}>{file.path}</button>
        {/each}
      {:else}
        <span>No files read yet.</span>
      {/if}
    </section>
    <section class={[focus === "changes" && "is-focus"]}>
      <h2><GitPullRequest size={15} /> Changes</h2>
      {#if changes?.files.length}
        {#each changes.files as file (file.path)}
          <button class="change-row" type="button" data-change-path={file.path} data-status={file.gitStatus || ""} onclick={() => onPreviewChange(file.path)}>
            <strong>{statusLabel(file.gitStatus)}</strong>
            <span>{file.path}</span>
            {#if file.oldPath}
              <em>from {file.oldPath}</em>
            {/if}
            {#each stageLabels(file) as label (label)}
              <small>{label}</small>
            {/each}
          </button>
        {/each}
      {:else}
        <span>{changes?.gitErr || "No changed files."}</span>
      {/if}
    </section>
    <section class={[focus === "checkpoints" && "is-focus"]} data-testid="code-checkpoints">
      <h2><RotateCcw size={15} /> Checkpoints</h2>
      {#if checkpoints.length}
        {#each checkpoints as checkpoint (checkpoint.turn)}
          <div class="checkpoint">
            <strong>#{checkpoint.turn} {checkpoint.prompt}</strong>
            <span class="checkpoint__meta">
              {formatTime(checkpoint.time)}
              <span aria-hidden="true">·</span>
              {checkpoint.files.length} files
            </span>
            <span class="checkpoint__files">{formatCheckpointFiles(checkpoint)}</span>
            <div class="checkpoint__actions">
              <button type="button" disabled={!!rewindBusy} aria-busy={rewindBusy === `${checkpoint.turn}:fork`} onclick={() => forkCheckpoint(checkpoint)}>Fork Thread</button>
              {#if checkpoint.canConversation !== false}
                <button type="button" disabled={!!rewindBusy} aria-busy={rewindBusy === `${checkpoint.turn}:conversation`} onclick={() => rewindCheckpoint(checkpoint, "conversation")}>Conversation</button>
              {/if}
              {#if checkpoint.canCode !== false}
                <button type="button" disabled={!!rewindBusy} aria-busy={rewindBusy === `${checkpoint.turn}:code`} onclick={() => rewindCheckpoint(checkpoint, "code")}>Code</button>
              {/if}
              <button type="button" disabled={!!rewindBusy} aria-busy={rewindBusy === `${checkpoint.turn}:both`} onclick={() => rewindCheckpoint(checkpoint, "both")}>Both</button>
            </div>
          </div>
        {/each}
      {:else}
        <span>No rewind points yet.</span>
      {/if}
      {#if rewindStatus}
        <span class="code-dock__status">{rewindStatus}</span>
      {/if}
    </section>
    <section class={[(focus === "workspace" || focus === "changes" || focus === "overview") && "is-focus"]}>
      <h2><FileText size={15} /> Preview</h2>
      <DiffViewer change={selectedChange} preview={filePreview} diff={diffPreview} />
    </section>
  </aside>
</section>
