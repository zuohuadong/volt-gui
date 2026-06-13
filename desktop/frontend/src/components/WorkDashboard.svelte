<script lang="ts">
  import { Brain, CheckCircle2, Clock3, ListChecks, Play, Plus, RotateCcw, Target, Trash2 } from "@lucide/svelte";
  import type { GoalInfo, MemoryView, ResourceRecord, SessionMeta, TabMeta } from "../lib/types";
  import { t } from "../lib/i18n";

  let {
    activeTab,
    goalInfo,
    memoryView,
    workTasks,
    recentSessions,
    resources,
    onStartGoal,
    onContinueGoal,
    onClearGoal,
    onUpdateTask,
    onResumeSession,
    onRemember,
    onForgetMemory,
  }: {
    activeTab?: TabMeta;
    goalInfo: GoalInfo;
    memoryView: MemoryView;
    workTasks: ResourceRecord[];
    recentSessions: SessionMeta[];
    resources: Array<{ name: string; total: number }>;
    onStartGoal: (objective: string) => void;
    onContinueGoal: () => void;
    onClearGoal: () => void;
    onUpdateTask: (id: string, status: string) => Promise<void> | void;
    onResumeSession: (session: SessionMeta) => Promise<void> | void;
    onRemember: (scope: string, note: string) => Promise<void> | void;
    onForgetMemory: (name: string) => Promise<void> | void;
  } = $props();

  const memoryTotal = $derived(memoryView.facts.length + memoryView.docs.length || resources.find((resource) => resource.name === "memory")?.total || 0);
  const taskTotal = $derived(workTasks.length || resources.find((resource) => resource.name === "tasks")?.total || 0);
  const activeTaskCount = $derived(workTasks.filter((task) => text(task, "status") === "active").length);
  const readyTaskCount = $derived(workTasks.filter((task) => text(task, "status") === "ready").length);
  const hasGoal = $derived(goalInfo.objective.trim() !== "");
  const goalStatus = $derived(goalInfo.status || "idle");
  const selectedScope = $derived(memoryView.scopes[0]?.scope ?? "project");
  let draftGoal = $state("");
  let draftMemory = $state("");
  let memoryScope = $state("");
  let memoryStatus = $state("");

  function submitGoal() {
    const objective = draftGoal.trim();
    if (!objective) return;
    onStartGoal(objective);
    draftGoal = "";
  }

  async function submitMemory() {
    const note = draftMemory.trim();
    if (!note) return;
    await onRemember(memoryScope || selectedScope, note);
    draftMemory = "";
    memoryStatus = t.work.remember;
  }

  async function forgetMemory(name: string) {
    await onForgetMemory(name);
    memoryStatus = `${t.work.forget} ${name}`;
  }

  function docExcerpt(body: string) {
    return body.replace(/^#+\s+/gm, "").split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(-1)[0] ?? "No content";
  }

  function text(record: ResourceRecord, key: string, fallback = "") {
    const value = record[key];
    return typeof value === "string" ? value : fallback;
  }

  function formatTime(ms: number) {
    if (!ms) return "";
    return new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  }

  function sessionTitle(session: SessionMeta) {
    return session.title || session.topicTitle || session.preview || t.common.untitledSession;
  }

  async function advanceTask(task: ResourceRecord) {
    const status = text(task, "status", "ready");
    const next = status === "ready" ? "active" : status === "active" ? "complete" : "active";
    await onUpdateTask(task.id, next);
  }
</script>

<section class="dashboard-grid" aria-label="Work dashboard">
  <article class="goal-card">
    <div class="goal-card__header">
      <Target size={20} />
      <div>
        <h2>{t.work.goal}</h2>
        <p>{goalStatus}</p>
      </div>
    </div>
    {#if hasGoal}
      <strong>{goalInfo.objective}</strong>
      {#if goalInfo.blockedReason}
        <p class="goal-card__blocked">{goalInfo.blockedReason}</p>
      {/if}
      <div class="goal-card__actions">
        <button type="button" title={t.work.continueGoal} onclick={onContinueGoal}><RotateCcw size={15} /> {t.work.continueGoal}</button>
        <button type="button" title={t.work.clearGoal} onclick={onClearGoal}><Trash2 size={15} /> {t.work.clearGoal}</button>
      </div>
    {:else}
      <textarea aria-label="Goal objective" bind:value={draftGoal} rows="3" placeholder="Ship the workbench redesign"></textarea>
      <button type="button" title={t.work.startGoal} disabled={!draftGoal.trim()} onclick={submitGoal}><Play size={15} /> {t.work.startGoal}</button>
    {/if}
  </article>
  <article>
    <ListChecks size={20} />
    <h2>{t.work.tasks}</h2>
    <p>{taskTotal} tracked · {activeTaskCount} active · {readyTaskCount} ready</p>
    <div class="work-list" data-testid="work-tasks">
      {#each workTasks.slice(0, 4) as task (task.id)}
        <div class="work-list__row">
          <div>
            <strong>{text(task, "title", task.id)}</strong>
            <span>{text(task, "status", t.work.taskReady)} · {text(task, "priority", "normal")} · {text(task, "owner", "team")}</span>
            <p>{text(task, "summary", t.work.noTasks)}</p>
          </div>
          <button type="button" onclick={() => advanceTask(task)}>
            {text(task, "status") === "ready" ? t.work.start : text(task, "status") === "active" ? t.work.complete : t.work.reopen}
          </button>
        </div>
      {:else}
        <p>{t.work.noTasks}</p>
      {/each}
    </div>
  </article>
  <article>
    <Clock3 size={20} />
    <h2>{t.work.recentSessions}</h2>
    <p>{activeTab?.workspaceName || "Global"} is ready for research, writing, planning, and operations work.</p>
    <div class="work-list" data-testid="recent-sessions">
      {#each recentSessions.slice(0, 4) as session (session.path)}
        <div class="work-list__row">
          <div>
            <strong>{sessionTitle(session)}</strong>
            <span>{session.open ? t.activity.open : t.work.saved} · {session.turns} {t.work.turns} · {formatTime(session.lastActivityAt || session.modTime)}</span>
            <p>{session.preview || session.topicTitle || "No preview"}</p>
          </div>
          <button type="button" onclick={() => onResumeSession(session)}><CheckCircle2 size={14} /> {t.work.resume}</button>
        </div>
      {:else}
        <p>{t.work.noSessions}</p>
      {/each}
    </div>
  </article>
  <article class="memory-card">
    <Brain size={20} />
    <div>
      <h2>{t.work.memory}</h2>
      <p>{memoryTotal} entries · {memoryView.storeDir || "memory store pending"}</p>
    </div>
    <div class="memory-card__quickadd" data-testid="memory-quickadd">
      <select aria-label="Memory scope" value={memoryScope || selectedScope} onchange={(event) => (memoryScope = (event.currentTarget as HTMLSelectElement).value)} disabled={!memoryView.scopes.length}>
        {#each memoryView.scopes as scope (scope.scope)}
          <option value={scope.scope}>{scope.scope}</option>
        {/each}
      </select>
      <textarea aria-label="{t.work.memory}" rows="2" placeholder="{t.work.memoryPlaceholder}" bind:value={draftMemory}></textarea>
      <button type="button" title={t.work.remember} disabled={!draftMemory.trim() || !memoryView.available} onclick={submitMemory}><Plus size={15} /> {t.work.remember}</button>
    </div>
    {#if memoryStatus}
      <p class="memory-card__status">{memoryStatus}</p>
    {/if}
    <div class="memory-card__list" data-testid="memory-list">
      {#each memoryView.facts.slice(0, 4) as fact (fact.name)}
        <div class="memory-card__fact">
          <div>
            <strong>{fact.title || fact.name}</strong>
            <span>{fact.name} · {fact.type}</span>
            <p>{fact.description || fact.body || "Saved memory"}</p>
          </div>
          <button type="button" title={`${t.work.forget} ${fact.name}`} onclick={() => forgetMemory(fact.name)}><Trash2 size={14} /></button>
        </div>
      {:else}
        <p>{t.work.noMemory}</p>
      {/each}
    </div>
    <div class="memory-card__docs" aria-label="Memory docs">
      {#each memoryView.docs.slice(0, 3) as doc (`${doc.scope}:${doc.path}`)}
        <span>{doc.scope}: {doc.path} · {docExcerpt(doc.body)}</span>
      {/each}
    </div>
  </article>
</section>
