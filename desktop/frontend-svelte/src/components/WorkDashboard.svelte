<script lang="ts">
  import { Brain, Clock3, Database, Target } from "@lucide/svelte";
  import type { TabMeta } from "../lib/types";

  let {
    activeTab,
    resources,
  }: {
    activeTab?: TabMeta;
    resources: Array<{ name: string; total: number }>;
  } = $props();

  const memoryTotal = $derived(resources.find((resource) => resource.name === "memory")?.total ?? 0);
</script>

<section class="dashboard-grid" aria-label="Work dashboard">
  <article>
    <Target size={20} />
    <h2>Goals and tasks</h2>
    <p>Active topic: {activeTab?.topicTitle || "Global work"}</p>
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
