<script lang="ts">
  import { PromptInputActionAddAttachments } from "@svadmin/ai-elements";
  import { t } from "$lib/i18n";

  let { disabled = false }: { disabled?: boolean } = $props();
</script>

<PromptInputActionAddAttachments
  {disabled}
  label={t("composer.addAttachments")}
  aria-label={t("composer.addAttachments")}
/>
