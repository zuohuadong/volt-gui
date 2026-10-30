<script lang="ts">
  import type { DshNativeUiView, NativeUiNode, NativeUiTone } from "$lib/dsh-native-ui";

  let { view }: { readonly view: DshNativeUiView } = $props();

  function toneClass(tone: NativeUiTone | undefined): string {
    return tone ? `dsh-native-ui-text--${tone}` : "";
  }
</script>

<section class="dsh-native-ui" aria-label={view.title || "原生界面"}>
  {#if view.title}<h3>{view.title}</h3>{/if}
  {#if view.description}<p class="dsh-native-ui-description">{view.description}</p>{/if}
  <div class="dsh-native-ui-content">
    {#each view.nodes as node, index (`${node.type}-${index}`)}{@render renderNode(node)}{/each}
  </div>
</section>

{#snippet renderNode(node: NativeUiNode)}
  {#if node.type === "text"}
    <p class={`dsh-native-ui-text ${toneClass(node.tone)}`}>{node.text}</p>
  {:else if node.type === "metric"}
    <div class="dsh-native-ui-metric">
      <span>{node.label}</span>
      <strong>{node.value}</strong>
      {#if node.detail}<small>{node.detail}</small>{/if}
    </div>
  {:else if node.type === "list"}
    <div class="dsh-native-ui-list">
      {#if node.label}<strong>{node.label}</strong>{/if}
      <ul>{#each node.items as item, index (`${item}-${index}`)}<li>{item}</li>{/each}</ul>
    </div>
  {:else if node.type === "group"}
    <fieldset class="dsh-native-ui-group">
      {#if node.title}<legend>{node.title}</legend>{/if}
      <div class="dsh-native-ui-group-content">
        {#each node.children as child, index (`${child.type}-${index}`)}{@render renderNode(child)}{/each}
      </div>
    </fieldset>
  {/if}
{/snippet}

<style>
  .dsh-native-ui { display: grid; gap: 10px; padding: 12px; border: 1px solid var(--border); border-radius: 7px; background: var(--card); }
  h3, p { margin: 0; }
  h3 { font-size: 13px; }
  .dsh-native-ui-description, .dsh-native-ui-text, small { color: var(--muted-foreground); font-size: 12px; line-height: 1.45; }
  .dsh-native-ui-content, .dsh-native-ui-group-content { display: grid; gap: 8px; }
  .dsh-native-ui-metric { display: grid; gap: 2px; padding: 8px; border: 1px solid var(--border); border-radius: 5px; }
  .dsh-native-ui-metric span, .dsh-native-ui-list > strong { color: var(--muted-foreground); font-size: 11px; }
  .dsh-native-ui-metric strong { font-size: 18px; }
  .dsh-native-ui-list ul { margin: 5px 0 0; padding-left: 18px; }
  .dsh-native-ui-list li { font-size: 12px; line-height: 1.5; }
  .dsh-native-ui-group { min-width: 0; margin: 0; padding: 8px; border: 1px solid var(--border); border-radius: 5px; }
  .dsh-native-ui-group legend { padding: 0 4px; color: var(--muted-foreground); font-size: 11px; }
  .dsh-native-ui-text--default { color: var(--foreground); }
  .dsh-native-ui-text--success { color: var(--success, #15803d); }
  .dsh-native-ui-text--warning { color: var(--warning, #a16207); }
  .dsh-native-ui-text--danger { color: var(--destructive); }
</style>
