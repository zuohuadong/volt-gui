<script lang="ts">
  import { BookOpen } from "@lucide/svelte";
  import type { DshSkill } from "$lib/dsh-client";
  import { i18n, t } from "$lib/i18n";
  import { filterLocalizedSkills, skillDisplayCopy } from "$lib/skill-i18n";

  let { skills, query = "" }: { skills: DshSkill[]; query?: string } = $props();
  const visibleSkills = $derived(filterLocalizedSkills(skills.map((skill) => skillDisplayCopy(skill, i18n.locale)), query));
</script>

<div class="knowledge-skill-list">
  {#each visibleSkills as skill (skill.name)}
    <article>
      <div class="skill-heading">
        <span class="row-icon"><BookOpen size={15} /></span>
        <div>
          <strong title={skill.name}>{skill.displayName}</strong>
          <small>{skill.modelInvocable ? t("knowledge.skillInvocableModel") : t("knowledge.skillInvocableUser")}</small>
        </div>
      </div>
      <p>{skill.description}</p>
      {#if skill.whenToUse}
        <details>
          <summary>{t("knowledge.originalUsage")}</summary>
          <p>{skill.whenToUse}</p>
        </details>
      {/if}
    </article>
  {/each}
</div>
