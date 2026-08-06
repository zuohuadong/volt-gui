package main

import "time"

// desktopTurnTimeout bounds one foreground turn. Thinking-heavy models can
// legitimately spend several minutes per board/section of an office document
// task, so six minutes cut healthy long turns off at the protection limit;
// loop shapes are handled by the agent's storm/churn guards instead of the
// wall clock.
const desktopTurnTimeout = 12 * time.Minute
