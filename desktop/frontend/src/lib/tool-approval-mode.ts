export const composerToolApprovalModes = ["ask", "auto-approve", "full-access"] as const;

export type ComposerToolApprovalMode = (typeof composerToolApprovalModes)[number];
export type BackendToolApprovalMode = "ask" | "auto" | "yolo";

export function composerToolApprovalModeToBackend(mode: string | undefined): BackendToolApprovalMode {
  switch (mode) {
    case "auto-approve":
      return "auto";
    case "full-access":
      return "yolo";
    default:
      return "ask";
  }
}

export function backendToolApprovalModeToComposer(mode: string | undefined): ComposerToolApprovalMode {
  switch (mode) {
    case "auto":
    case "auto-approve":
      return "auto-approve";
    case "yolo":
    case "full-access":
    case "full":
    case "bypass":
      return "full-access";
    default:
      return "ask";
  }
}
