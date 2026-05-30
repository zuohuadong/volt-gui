import type { WireApproval } from "../lib/types";

export function ApprovalModal({
  approval,
  onAnswer,
}: {
  approval: WireApproval;
  onAnswer: (allow: boolean, session: boolean) => void;
}) {
  // A plan approval is special: the controller proposes it when a plan-mode turn
  // ends with a proposal. The plan itself is already shown above as the assistant's
  // reply, so this is just the gate — start coding vs keep planning.
  if (approval.tool === "exit_plan_mode") {
    return (
      <div className="modal-backdrop">
        <div className="modal modal--plan">
          <div className="modal__title">Ready to start coding?</div>
          <div className="modal__plannote">
            Review the plan above. Approving exits plan mode and starts the work.
          </div>
          <div className="modal__actions">
            <button className="btn" onClick={() => onAnswer(false, false)}>
              Keep planning
            </button>
            <button className="btn btn--primary" onClick={() => onAnswer(true, false)}>
              Proceed
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal__title">Allow this tool call?</div>
        <div className="modal__tool">
          <span className="tool__name">{approval.tool}</span>
        </div>
        {approval.subject && <pre className="modal__subject">{approval.subject}</pre>}
        <div className="modal__actions">
          <button className="btn" onClick={() => onAnswer(false, false)}>
            Deny
          </button>
          <button className="btn" onClick={() => onAnswer(true, false)}>
            Allow once
          </button>
          <button className="btn btn--primary" onClick={() => onAnswer(true, true)}>
            Allow for session
          </button>
        </div>
      </div>
    </div>
  );
}
