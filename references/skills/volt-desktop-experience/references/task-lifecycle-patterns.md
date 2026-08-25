# Official DSH Task Lifecycle Reference

The official DSH Web profile is the authority for queues, steering, approvals,
tools, receipts, recovery, workspace state, and persistent sessions.

When reviewing a request:

1. Verify whether the installed official DSH version already implements it.
2. Prefer a documented profile or plugin extension.
3. Keep Electron limited to native shell behavior.
4. Reject local mocks, copied renderer code, preload bridges, or duplicate state
   as acceptance evidence.
5. Record missing official extension points as dependency requirements.
