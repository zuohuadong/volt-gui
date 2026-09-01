<script lang="ts">
  import { Artifact, CodeBlock, FileTree, Terminal, TestResults } from "@svadmin/ai-elements";
  import type { ToolInfo } from "$lib/transcript";
  import { hasStructuredToolOutput, toolPresentation } from "$lib/ai-elements-adapter";
  import { t } from "$lib/i18n";

  let { tool }: { readonly tool: ToolInfo } = $props();
  const presentation = $derived(toolPresentation(tool));
  const hasStructuredOutput = $derived(hasStructuredToolOutput(presentation));
</script>

{#if hasStructuredOutput}<div class="structured-tool-output">
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
