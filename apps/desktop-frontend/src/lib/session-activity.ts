export type SessionOperation = {
  id: string;
  kind: "created" | "renamed" | "forked" | "deleted" | "restored" | "purged";
  sessionId: string;
  title: string;
  time: number;
};
