export type KnowledgeDeleteConfirmation = (message: string) => boolean;

export function knowledgeDeleteConfirmationMessage(title: string): string {
  const label = title.trim() || "该文档";
  return `确认删除知识文档“${label}”吗？文档及其全文检索、相似检索索引将一并删除，且不可恢复。`;
}

export function confirmKnowledgeDocumentDeletion(
  title: string,
  confirmDeletion: KnowledgeDeleteConfirmation,
): boolean {
  return confirmDeletion(knowledgeDeleteConfirmationMessage(title));
}
