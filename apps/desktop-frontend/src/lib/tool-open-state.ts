export type ToolOpenState = Record<string, true>;

export function setToolOpenState(openToolIDs: Readonly<ToolOpenState>, toolID: string, open: boolean): ToolOpenState {
  const next = { ...openToolIDs };
  if (open) next[toolID] = true;
  else delete next[toolID];
  return next;
}

export function isToolDetailsOpen(openToolIDs: Readonly<ToolOpenState>, toolID: string, pending?: boolean): boolean {
  return Boolean(pending) || Boolean(openToolIDs[toolID]);
}
