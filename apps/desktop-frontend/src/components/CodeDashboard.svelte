<script lang="ts">
  import { onMount } from "svelte";
  import { AlertTriangle, Check, ChevronDown, ChevronRight, Code2, ExternalLink, FileText, Folder, GitBranch, GitCommitHorizontal, GitPullRequest, Gauge, LocateFixed, RefreshCw, RotateCcw, Search } from "@lucide/svelte";
  import DiffViewer from "./DiffViewer.svelte";
  import { app } from "../lib/bridge";
  import type { DiffReviewComment } from "../lib/diff-review";
  import { contextRemainingPercent, contextRemainingTokens } from "../lib/thread-ux";
  import {
    reviewActionLabel,
    reviewActionsForSource,
    reviewFileBelongsToSource,
    reviewPatchConflicts,
  } from "../lib/review-workflow";
  import type {
    CheckpointMeta,
    ContextPanelInfo,
    DirEntry,
    FilePreview,
    ReviewPatchAction,
    ReviewPatchRequest,
    ReviewSource,
    ReviewWorkflowAction,
    ReviewWorkflowRequest,
    WorkspaceDiffView,
    WorkspaceChangesView,
  } from "../lib/types";
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
    diffComments = [],
    onAddDiffComment = () => undefined,
    onResolveDiffComment = () => undefined,
    onDeleteDiffComment = () => undefined,
    onRequestDiffFix = () => undefined,
    reviewPatchPending = [],
    reviewWorkflowPending,
    reviewStatus = "",
    reviewStatusTone = "neutral",
    onReviewPatch = async () => undefined,
    onReviewWorkflow = async () => undefined,
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
    diffComments?: DiffReviewComment[];
    onAddDiffComment?: (path: string, revision: string, line: number, body: string) => void;
    onResolveDiffComment?: (id: string, resolved: boolean) => void;
    onDeleteDiffComment?: (id: string) => void;
    onRequestDiffFix?: (path: string) => void | Promise<void>;
    reviewPatchPending?: ReviewPatchRequest[];
    reviewWorkflowPending?: ReviewWorkflowRequest;
    reviewStatus?: string;
    reviewStatusTone?: "neutral" | "success" | "warning" | "danger";
    onReviewPatch?: (path: string, action: ReviewPatchAction, source: ReviewSource) => Promise<void> | void;
    onReviewWorkflow?: (action: ReviewWorkflowAction, message?: string) => Promise<void> | void;
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
  let reviewSource = $state<ReviewSource>("unstaged");
  let reviewConfirm = $state<{ path: string; action: ReviewPatchAction; source: ReviewSource } | undefined>(undefined);
  let commitMessage = $state("");

  const remainingPercent = $derived(contextRemainingPercent(context));
  const remainingTokens = $derived(contextRemainingTokens(context));
  const changedCount = $derived(changes?.files.length ?? 0);
  const selectedPath = $derived(diffPreview?.path ?? filePreview?.path);
  const selectedChange = $derived(selectedPath ? changes?.files.find((file) => file.path === selectedPath) : undefined);
  const stagedCount = $derived(changes?.files.filter((file) => reviewFileBelongsToSource(file, "staged")).length ?? 0);
  const unstagedCount = $derived(changes?.files.filter((file) => reviewFileBelongsToSource(file, "unstaged")).length ?? 0);
  const reviewFiles = $derived(changes?.files.filter((file) => reviewFileBelongsToSource(file, reviewSource)) ?? []);
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
        meta: file.gitStatus || file.sources.join(", ") || "已变更",
        detail: file.turns?.length ? `第 ${file.turns.join(", ")} 轮` : "",
        time: file.latestTime ?? 0,
      }));
    }
    return (context?.readFiles ?? []).map((file, index) => ({
      key: `${file.path}-${index}`,
      path: file.path,
      meta: `turn ${file.turn}`,
      detail: file.limit ? `${file.offset ?? 0}-${(file.offset ?? 0) + file.limit}${file.truncated ? "（已截断）" : ""}` : "",
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
    treeStatus = "正在加载文件树…";
    try {
      entriesByDir = {};
      openDirs = [""];
      await loadDir("");
      treeStatus = "文件树已就绪";
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
    treeStatus = `已打开：${path}`;
  }

  async function revealWorkspacePath(path: string) {
    await app().RevealWorkspacePath(path);
    treeStatus = `已定位：${path}`;
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
    if (!checkpoint.files.length) return "仅对话内容";
    const first = checkpoint.files.slice(0, 2).join(", ");
    const remaining = checkpoint.files.length > 2 ? ` +${checkpoint.files.length - 2}` : "";
    return `${first}${remaining}`;
  }

  function statusLabel(status?: string) {
    if (!status) return "M";
    if (status === "??" || status.includes("?")) return "U";
    if (status.includes("R")) return "R";
    if (status.includes("A")) return "A";
    if (status.includes("D")) return "D";
    if (status.includes("M")) return "M";
    return status.slice(0, 1).toUpperCase();
  }

  async function rewindCheckpoint(checkpoint: CheckpointMeta, scope: RewindScope) {
    const key = `${checkpoint.turn}:${scope}`;
    rewindBusy = key;
    rewindStatus = `正在回退第 ${checkpoint.turn} 轮（${rewindScopeLabel(scope)}）…`;
    try {
      await onRewind(checkpoint.turn, scope);
      rewindStatus = `已回退第 ${checkpoint.turn} 轮，并刷新历史、上下文、变更和检查点。`;
    } catch (error) {
      rewindStatus = error instanceof Error ? error.message : String(error);
    } finally {
      rewindBusy = "";
    }
  }

  async function forkCheckpoint(checkpoint: CheckpointMeta) {
    const key = `${checkpoint.turn}:fork`;
    rewindBusy = key;
    rewindStatus = `正在从第 ${checkpoint.turn} 轮创建分支…`;
    try {
      await onFork(checkpoint.turn);
      rewindStatus = `已从第 ${checkpoint.turn} 轮创建新的对话。`;
    } catch (error) {
      rewindStatus = error instanceof Error ? error.message : String(error);
    } finally {
      rewindBusy = "";
    }
  }

  async function refreshContextPanel() {
    contextBusy = true;
    contextStatus = "正在刷新上下文…";
    try {
      await onRefreshContext();
      contextStatus = "上下文已刷新";
    } catch (error) {
      contextStatus = error instanceof Error ? error.message : String(error);
    } finally {
      contextBusy = false;
    }
  }

  function rewindScopeLabel(scope: RewindScope) {
    if (scope === "conversation") return "对话";
    if (scope === "code") return "代码";
    return "对话与代码";
  }

  function pendingPatchFor(path: string) {
    return reviewPatchPending.find((pending) => pending.path === path);
  }

  function requestReviewAction(path: string, action: ReviewPatchAction, source: ReviewSource) {
    if (action === "revert") {
      reviewConfirm = { path, action, source };
      return;
    }
    void onReviewPatch(path, action, source);
  }

  function confirmReviewAction() {
    const confirmation = reviewConfirm;
    reviewConfirm = undefined;
    if (confirmation) void onReviewPatch(confirmation.path, confirmation.action, confirmation.source);
  }

  function runWorkflow(action: ReviewWorkflowAction) {
    void onReviewWorkflow(action, action === "commit" ? commitMessage : undefined);
  }
</script>

<section class={["code-layout", `code-layout--${variant}`, `code-layout--focus-${focus}`]} aria-label="代码工作区">
  {#if variant !== "workbench" || focus === "overview"}
  <div class="dashboard-grid" data-code-view={variant === "workbench" ? "overview" : undefined}>
    <article>
      <Gauge size={20} />
      <h2>{t.code.contextFiles}</h2>
      <p>{remainingPercent === undefined || remainingTokens === undefined ? "上下文待统计。" : `剩余 ${remainingTokens.toLocaleString()} / ${context?.windowTokens.toLocaleString()} 个令牌（${remainingPercent}%）`}</p>
    </article>
    <article>
      <GitPullRequest size={20} />
      <h2>变更文件</h2>
      <p>{changedCount === 0 ? "工作区干净。" : `有 ${changedCount} 个文件待处理。`}</p>
    </article>
    <article>
      <RotateCcw size={20} />
      <h2>{t.code.checkpoints}</h2>
      <p>{checkpoints.length ? `当前对话有 ${checkpoints.length} 个可回退检查点。` : "还没有检查点。"}</p>
    </article>
  </div>
  {/if}

  {#if variant !== "workbench" || focus !== "overview"}
  <aside class="code-dock" data-code-view={variant === "workbench" ? focus : undefined}>
    {#if variant !== "workbench" || focus === "context"}
    <section class={["context-card", (focus === "context" || focus === "overview") && "is-focus"]} data-testid="code-context-panel">
      <div class="code-dock__section-head">
        <h2><Gauge size={15} /> {t.code.contextFiles}</h2>
        <button type="button" title={t.code.refresh} disabled={contextBusy} onclick={refreshContextPanel}><RefreshCw size={14} /></button>
      </div>
      {#if context}
        <div class="context-card__meter" style:--context-used={`${remainingPercent ?? 0}%`}>
          <div>
            <strong>{formatTokens(remainingTokens ?? 0)}</strong>
            <span>/ {formatTokens(context.windowTokens)} 个令牌剩余</span>
          </div>
          <span>{remainingPercent === undefined ? "待统计" : `${remainingPercent}%`}</span>
        </div>
        <div class="context-card__bar" aria-label="上下文剩余量">
          <span></span>
        </div>
        <div class="context-card__metrics">
          <div><span>输入</span><strong>{promptTokens.toLocaleString()}</strong></div>
          <div><span>输出</span><strong>{completionTokens.toLocaleString()}</strong></div>
          <div><span>推理</span><strong>{reasoningTokens.toLocaleString()}</strong></div>
          <div><span>其他</span><strong>{otherTokens.toLocaleString()}</strong></div>
          <div><span>缓存命中</span><strong>{cachePercent ? `${cachePercent}%` : "-"}</strong></div>
        </div>
        <div class="context-card__tabs" role="tablist" aria-label="上下文详情">
          <button type="button" aria-pressed={contextDetail === "read"} onclick={() => (contextDetail = "read")}>已读取 {context.readFiles.length}</button>
          <button type="button" aria-pressed={contextDetail === "changed"} onclick={() => (contextDetail = "changed")}>已变更 {context.changedFiles.length}</button>
        </div>
        <label class="context-card__search">
          <Search size={14} />
          <input aria-label="筛选上下文文件" placeholder={t.code.filter} bind:value={contextQuery} />
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
              <span>{contextDetail === "changed" ? "上下文中没有变更文件。" : "上下文中没有已读取文件。"}</span>
          {/each}
        </div>
        {#if contextStatus}
          <span class="code-dock__status">{contextStatus}</span>
        {/if}
      {:else}
        <span>上下文面板等待数据。</span>
      {/if}
    </section>
    {/if}
    {#if variant !== "workbench" || focus === "workspace"}
    <section class={[(focus === "workspace" || focus === "overview") && "is-focus"]}>
      <div class="code-dock__section-head">
        <h2><Folder size={15} /> 文件</h2>
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
          <span>{treeStatus || "工作区中没有文件。"}</span>
        {/if}
      </div>
      {#if treeStatus}
        <span class="code-dock__status">{treeStatus}</span>
      {/if}
    </section>
    {/if}
    {#if variant !== "workbench" || focus === "context"}
    <section class={[focus === "context" && "is-focus"]}>
      <h2><Code2 size={15} /> 已读取文件</h2>
      {#if context?.readFiles.length}
        {#each context.readFiles as file (`${file.path}-${file.turn}`)}
          <button type="button" onclick={() => onPreviewFile(file.path)}>{file.path}</button>
        {/each}
      {:else}
        <span>还没有读取文件。</span>
      {/if}
    </section>
    {/if}
    {#if variant !== "workbench" || focus === "changes"}
    <section class={["review-pane", focus === "changes" && "is-focus"]} data-testid="code-review-pane">
      <div class="review-pane__header">
        <div>
          <h2><GitPullRequest size={15} /> Review</h2>
          <span><GitBranch size={12} /> {changes?.gitBranch || "workspace"}</span>
        </div>
        <button type="button" title="Refresh review" onclick={() => void onRefreshContext()}><RefreshCw size={14} /></button>
      </div>
      <div class="review-source-switch" role="tablist" aria-label="Review source">
        <button type="button" role="tab" aria-selected={reviewSource === "unstaged"} onclick={() => (reviewSource = "unstaged")}>Unstaged <span>{unstagedCount}</span></button>
        <button type="button" role="tab" aria-selected={reviewSource === "staged"} onclick={() => (reviewSource = "staged")}>Staged <span>{stagedCount}</span></button>
      </div>
      <div class="review-file-list">
        {#each reviewFiles as file (file.path)}
          {@const pendingPatch = pendingPatchFor(file.path)}
          {@const untracked = file.indexStatus === "?" || file.worktreeStatus === "?"}
          <article class={["review-file-row", selectedPath === file.path && "is-selected", pendingPatch && "is-pending"]} data-change-path={file.path} data-status={file.gitStatus || ""}>
            <button class="review-file-row__main" type="button" onclick={() => onPreviewChange(file.path)}>
              <strong>{statusLabel(reviewSource === "staged" ? file.indexStatus : file.worktreeStatus || file.gitStatus)}</strong>
              <span>{file.path}</span>
              {#if file.oldPath}<em>from {file.oldPath}</em>{/if}
            </button>
            <div class="review-file-row__actions">
              {#each reviewActionsForSource(reviewSource, untracked) as action (action)}
                <button
                  type="button"
                  class={action === "revert" ? "danger" : undefined}
                  disabled={reviewPatchConflicts(pendingPatch, file.path)}
                  aria-busy={pendingPatch?.action === action}
                  onclick={() => requestReviewAction(file.path, action, reviewSource)}
                >{reviewActionLabel(action)}</button>
              {/each}
            </div>
            {#if pendingPatch}
              <span class="review-file-row__pending">{reviewActionLabel(pendingPatch.action)} pending · ticket {pendingPatch.ticket}</span>
            {/if}
          </article>
        {:else}
          <div class="review-empty">
            <Check size={16} />
            <div><strong>{changes?.gitErr ? "Review unavailable" : `No ${reviewSource} changes`}</strong><span>{changes?.gitErr || "This source is up to date."}</span></div>
          </div>
        {/each}
      </div>
      <div class="review-workflow" aria-label="Git workflow">
        <label>
          <span>Commit message</span>
          <input bind:value={commitMessage} placeholder="Describe the staged change" disabled={Boolean(reviewWorkflowPending)} />
        </label>
        <div>
          <button type="button" disabled={Boolean(reviewWorkflowPending) || stagedCount === 0 || !commitMessage.trim()} aria-busy={reviewWorkflowPending?.action === "commit"} onclick={() => runWorkflow("commit")}><GitCommitHorizontal size={13} /> Commit</button>
          <button type="button" disabled={Boolean(reviewWorkflowPending) || !changes?.gitAvailable} aria-busy={reviewWorkflowPending?.action === "push"} onclick={() => runWorkflow("push")}>Push</button>
          <button type="button" disabled={Boolean(reviewWorkflowPending) || !changes?.gitAvailable} aria-busy={reviewWorkflowPending?.action === "create-pr"} onclick={() => runWorkflow("create-pr")}><GitPullRequest size={13} /> Create PR</button>
        </div>
      </div>
      {#if reviewStatus}
        <div class="review-status" data-tone={reviewStatusTone} aria-live="polite">
          {#if reviewStatusTone === "success"}<Check size={14} />{:else if reviewStatusTone === "warning" || reviewStatusTone === "danger"}<AlertTriangle size={14} />{:else}<RefreshCw size={14} />{/if}
          <span>{reviewStatus}</span>
        </div>
      {/if}
      {#if reviewConfirm}
        <div class="review-confirm" role="dialog" aria-modal="true" aria-labelledby="review-confirm-title">
          <div>
            <AlertTriangle size={16} />
            <strong id="review-confirm-title">Revert {reviewConfirm.source} changes?</strong>
            <p>{reviewConfirm.path}</p>
            <span>{reviewConfirm.source === "staged" ? "This runs staged → unstaged → working tree. The second phase may report partial success." : "This discards the current unstaged patch for this file."}</span>
          </div>
          <footer><button type="button" onclick={() => (reviewConfirm = undefined)}>Cancel</button><button type="button" class="danger" onclick={confirmReviewAction}>Revert</button></footer>
        </div>
      {/if}
    </section>
    {/if}
    {#if variant !== "workbench" || focus === "checkpoints"}
    <section class={[focus === "checkpoints" && "is-focus"]} data-testid="code-checkpoints">
      <h2><RotateCcw size={15} /> 检查点</h2>
      {#if checkpoints.length}
        {#each checkpoints as checkpoint (checkpoint.turn)}
          <div class="checkpoint">
            <strong>#{checkpoint.turn} {checkpoint.prompt}</strong>
            <span class="checkpoint__meta">
              {formatTime(checkpoint.time)}
              <span aria-hidden="true">·</span>
              {checkpoint.files.length} 个文件
            </span>
            <span class="checkpoint__files">{formatCheckpointFiles(checkpoint)}</span>
            <div class="checkpoint__actions">
              <button type="button" disabled={!!rewindBusy} aria-busy={rewindBusy === `${checkpoint.turn}:fork`} onclick={() => forkCheckpoint(checkpoint)}>创建对话分支</button>
              {#if checkpoint.canConversation !== false}
                <button type="button" disabled={!!rewindBusy} aria-busy={rewindBusy === `${checkpoint.turn}:conversation`} onclick={() => rewindCheckpoint(checkpoint, "conversation")}>回退对话</button>
              {/if}
              {#if checkpoint.canCode !== false}
                <button type="button" disabled={!!rewindBusy} aria-busy={rewindBusy === `${checkpoint.turn}:code`} onclick={() => rewindCheckpoint(checkpoint, "code")}>回退代码</button>
              {/if}
              <button type="button" disabled={!!rewindBusy} aria-busy={rewindBusy === `${checkpoint.turn}:both`} onclick={() => rewindCheckpoint(checkpoint, "both")}>全部回退</button>
            </div>
          </div>
        {/each}
      {:else}
        <span>还没有可回退的检查点。</span>
      {/if}
      {#if rewindStatus}
        <span class="code-dock__status">{rewindStatus}</span>
      {/if}
    </section>
    {/if}
    {#if variant !== "workbench" || focus === "workspace" || focus === "changes"}
    <section class={[(focus === "workspace" || focus === "changes" || focus === "overview") && "is-focus"]}>
      <h2><FileText size={15} /> 预览</h2>
      <DiffViewer
        change={selectedChange}
        preview={filePreview}
        diff={diffPreview}
        comments={diffComments}
        onAddComment={onAddDiffComment}
        onResolveComment={onResolveDiffComment}
        onDeleteComment={onDeleteDiffComment}
        onRequestFix={onRequestDiffFix}
      />
    </section>
    {/if}
  </aside>
  {/if}
</section>
