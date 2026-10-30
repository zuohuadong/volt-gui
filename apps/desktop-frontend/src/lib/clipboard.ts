export async function writeClipboard(text: string): Promise<void> {
  const desktop = typeof window !== "undefined" ? window.voltDesktop : undefined;
  if (desktop?.copyText) {
    await desktop.copyText(text);
    return;
  }
  await navigator.clipboard.writeText(text);
}
