<script lang="ts">
  import { Brain, Clock3, Database, Play, RotateCcw, Target, Trash2 } from "@lucide/svelte";
  import type { GoalInfo, TabMeta } from "../lib/types";

  let {
    activeTab,
    goalInfo,
    resources,
    onStartGoal,
    onContinueGoal,
    onClearGoal,
  }: {
    activeTab?: TabMeta;
    goalInfo: GoalInfo;
    resources: Array<{ name: string; total: number }>;
    onStartGoal: (objective: string) => void;
    onContinueGoal: () => void;
    onClearGoal: () => void;
  } = $props();

  const memoryTotal = $derived(resources.find((resource) => resource.name === "memory")?.total ?? 0);
  const hasGoal = $derived(goalInfo.objective.trim() !== "");
  const goalStatus = $derived(goalInfo.status || "idle");
  let draftGoal = $state("");

  function submitGoal() {
    const objective = draftGoal.trim();
    if (!objective) return;
    onStartGoal(objective);
    draftGoal = "";
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
  <article>
    <Brain size={20} />
    <h2>Memory</h2>
    <p>{memoryTotal} saved entries are available through the resource provider.</p>
  </article>
  <article>
    <Database size={20} />
    <h2>Resource shortcuts</h2>
    <p>Providers, models, MCP servers, skills, permissions, sessions, tasks, and memory share one typed surface.</p>
  </article>
</section>
