<script lang="ts">
  import { Database, KeyRound, MemoryStick, Server, ShieldCheck, Wrench } from "@lucide/svelte";
  import type { ActivityMode } from "../lib/types";

  const icons = {
    providers: Server,
    models: Database,
    mcpServers: Wrench,
    skills: Wrench,
    permissions: ShieldCheck,
    memory: MemoryStick,
    updates: KeyRound,
  };

  let {
    activityMode,
    resources,
  }: {
    activityMode: ActivityMode;
    resources: Array<{ name: string; total: number }>;
  } = $props();
</script>

<section class="resource-panel" aria-label="Resource console">
  <div>
    <p>{activityMode === "work" ? "Work resources" : "Code resources"}</p>
    <h2>svadmin resource layer</h2>
  </div>
  <div class="resource-grid">
    {#each resources as resource (resource.name)}
      {@const Icon = icons[resource.name as keyof typeof icons] ?? Database}
      <article>
        <Icon size={16} />
        <span>{resource.name}</span>
        <strong>{resource.total}</strong>
      </article>
    {/each}
  </div>
</section>
