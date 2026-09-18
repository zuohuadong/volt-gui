<script lang="ts">
  import { Artifact, CodeBlock, FileTree, Terminal, TestResults } from "@svadmin/ai-elements";
  import type { ToolInfo } from "$lib/transcript";
  import { hasStructuredToolOutput, toolPresentation } from "$lib/ai-elements-adapter";
  import { t } from "$lib/i18n";

  let { tool }: { readonly tool: ToolInfo } = $props();
  const presentation = $derived(toolPresentation(tool));
  const hasStructuredOutput = $derived(hasStructuredToolOutput(presentation));
  const web = $derived(presentation.web);

  function openExternal(event: MouseEvent, url: string): void {
    if (!window.voltDesktop?.openExternal) return;
    event.preventDefault();
    void window.voltDesktop.openExternal(url).catch(() => undefined);
  }
</script>

{#if hasStructuredOutput}<div class="structured-tool-output">
  {#if presentation.images.length}
    <div class="tool-image-results">
      {#each presentation.images as image (image.id)}
        <a href={image.src} target="_blank" rel="noreferrer" onclick={(event) => openExternal(event, image.src)} class="tool-image-link" title={image.alt || t("structured.openImage")}>
          <img src={image.src} alt={image.alt || t("structured.toolImage")} loading="lazy" />
        </a>
      {/each}
    </div>
  {/if}
  {#if web}
    <section class="web-tool-result">
      <div class="web-tool-result__header">
        <strong>{web.title}</strong>
        <span>{web.kind === "fetch" ? t("structured.webFetch") : web.kind === "computer" ? t("structured.computerUse") : t("structured.webSearch")}</span>
      </div>
      {#if web.url}<a class="web-tool-result__url" href={web.url} target="_blank" rel="noreferrer" onclick={(event) => openExternal(event, web.url!)}>{web.url}</a>{/if}
      {#if web.statusCode}<small>HTTP {web.statusCode}</small>{/if}
      {#if web.answer}<p>{web.answer}</p>{/if}
      {#if web.sources.length}<ul>{#each web.sources as source (source.id)}<li><a href={source.url || "#"} target="_blank" rel="noreferrer" onclick={(event) => source.url && openExternal(event, source.url)}>{source.title}</a>{#if source.quote}<small>{source.quote}</small>{/if}</li>{/each}</ul>{/if}
      {#if web.truncated}<small>{t("structured.webTruncated")}</small>{/if}
    </section>
  {/if}
  {#if presentation.code}
    <CodeBlock code={presentation.code.code} language={presentation.code.language} showLineNumbers />
  {/if}
  {#if presentation.terminal}
    <Terminal output={presentation.terminal.output} title={presentation.terminal.title} cwd={presentation.terminal.cwd} readOnly isStreaming={tool.state === "running"} />
  {/if}
  {#if presentation.tests.length}
    <TestResults results={presentation.tests} title={t("structured.testResults")} />
  {/if}
  {#if presentation.files.length}
    <FileTree nodes={presentation.files} label={t("structured.fileResults")} />
  {/if}
  {#if presentation.artifact}
    <Artifact
      title={presentation.artifact.title}
      description={presentation.artifact.description}
      content={presentation.artifact.content}
      kind={presentation.artifact.kind}
      language={presentation.artifact.language}
    />
  {/if}
</div>{/if}
