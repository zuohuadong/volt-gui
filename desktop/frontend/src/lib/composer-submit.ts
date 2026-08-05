export function composerSubmission(input: {
  text: string;
  attachmentPaths: string[];
}): { displayText: string; submitText: string } {
  const text = input.text.trim();
  const refs = input.attachmentPaths.map((path) => `@${path}`).join(" ");
  const displayText = [text, refs].filter(Boolean).join(text && refs ? " " : "");
  return { displayText, submitText: displayText };
}
