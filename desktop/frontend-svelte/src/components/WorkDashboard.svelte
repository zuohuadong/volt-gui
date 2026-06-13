<script lang="ts">
  import { Brain, Clock3, Database, Play, Plus, RotateCcw, Target, Trash2 } from "@lucide/svelte";
  import type { GoalInfo, MemoryView, TabMeta } from "../lib/types";

  let {
    activeTab,
    goalInfo,
    memoryView,
    resources,
    onStartGoal,
    onContinueGoal,
    onClearGoal,
    onRemember,
    onForgetMemory,
  }: {
    activeTab?: TabMeta;
    goalInfo: GoalInfo;
    memoryView: MemoryView;
    resources: Array<{ name: string; total: number }>;
    onStartGoal: (objective: string) => void;
    onContinueGoal: () => void;
    onClearGoal: () => void;
    onRemember: (scope: string, note: string) => Promise<void> | void;
    onForgetMemory: (name: string) => Promise<void> | void;
  } = $props();

  const memoryTotal = $derived(memoryView.facts.length + memoryView.docs.length || resources.find((resource) => resource.name === "memory")?.total || 0);
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
    memoryStatus = "Memory saved";
  }

  async function forgetMemory(name: string) {
    await onForgetMemory(name);
    memoryStatus = `Forgot ${name}`;
  }

  function docExcerpt(body: string) {
    return body.replace(/^#+\s+/gm, "").split(/\n+/).map((line) => line.trim()).filter(Boolean).slice(-1)[0] ?? "No content";
  }
</script>

<section class="dashboard-grid" aria-label="Work dashboard">
  <article class="goal-card">
    <div class="goal-card__header">
      <Target size={20} />
      <div>
        <h2>Goal</h2>
        <p>{goalStatus}</p>
      </div>
    </div>
    {#if hasGoal}
      <strong>{goalInfo.objective}</strong>
      {#if goalInfo.blockedReason}
        <p class="goal-card__blocked">{goalInfo.blockedReason}</p>
      {/if}
      <div class="goal-card__actions">
        <button type="button" title="Continue goal" onclick={onContinueGoal}><RotateCcw size={15} /> Continue</button>
        <button type="button" title="Clear goal" onclick={onClearGoal}><Trash2 size={15} /> Clear</button>
      </div>
    {:else}
      <textarea aria-label="Goal objective" bind:value={draftGoal} rows="3" placeholder="Ship the workbench redesign"></textarea>
      <button type="button" title="Start goal" disabled={!draftGoal.trim()} onclick={submitGoal}><Play size={15} /> Start</button>
    {/if}
  </article>
  <article>
    <Clock3 size={20} />
    <h2>Recent sessions</h2>
    <p>{activeTab?.workspaceName || "Global"} is ready for research, writing, planning, and operations work.</p>
  </article>
  <article class="memory-card">
    <Brain size={20} />
    <div>
      <h2>Memory</h2>
      <p>{memoryTotal} entries · {memoryView.storeDir || "memory store pending"}</p>
    </div>
    <div class="memory-card__quickadd" data-testid="memory-quickadd">
      <select aria-label="Memory scope" value={memoryScope || selectedScope} onchange={(event) => (memoryScope = (event.currentTarget as HTMLSelectElement).value)} disabled={!memoryView.scopes.length}>
        {#each memoryView.scopes as scope (scope.scope)}
          <option value={scope.scope}>{scope.scope}</option>
        {/each}
      </select>
      <textarea aria-label="Memory note" rows="2" placeholder="Remember that Work and Code stay separate" bind:value={draftMemory}></textarea>
      <button type="button" title="Remember" disabled={!draftMemory.trim() || !memoryView.available} onclick={submitMemory}><Plus size={15} /> Remember</button>
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
          <button type="button" title={`Forget ${fact.name}`} onclick={() => forgetMemory(fact.name)}><Trash2 size={14} /></button>
        </div>
      {:else}
        <p>No saved facts yet. Quick-add writes to the selected memory file.</p>
      {/each}
    </div>
    <div class="memory-card__docs" aria-label="Memory docs">
      {#each memoryView.docs.slice(0, 3) as doc (`${doc.scope}:${doc.path}`)}
        <span>{doc.scope}: {doc.path} · {docExcerpt(doc.body)}</span>
      {/each}
    </div>
  </article>
  <article>
    <Database size={20} />
    <h2>Resource shortcuts</h2>
    <p>Providers, models, MCP servers, skills, permissions, sessions, tasks, and memory share one typed surface.</p>
  </article>
</section>
