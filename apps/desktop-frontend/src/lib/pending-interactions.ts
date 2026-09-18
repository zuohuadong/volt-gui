import type { PendingApproval, PendingQuestion } from "./dsh-client";

export type PendingInteractionState = {
  approval?: PendingApproval;
  question?: PendingQuestion;
  answers: Record<string, string>;
};

export type PendingInteractionsBySession = Record<string, PendingInteractionState>;

function currentState(states: PendingInteractionsBySession, sessionId: string): PendingInteractionState {
  return states[sessionId] ?? { answers: {} };
}

export function setPendingApproval(
  states: PendingInteractionsBySession,
  sessionId: string,
  approval: PendingApproval,
): PendingInteractionsBySession {
  return { ...states, [sessionId]: { ...currentState(states, sessionId), approval } };
}

export function setPendingQuestion(
  states: PendingInteractionsBySession,
  sessionId: string,
  question: PendingQuestion,
): PendingInteractionsBySession {
  return { ...states, [sessionId]: { ...currentState(states, sessionId), question, answers: {} } };
}

export function setQuestionAnswer(
  states: PendingInteractionsBySession,
  sessionId: string,
  id: string,
  value: string,
  custom: boolean,
): PendingInteractionsBySession {
  const state = currentState(states, sessionId);
  const answerId = custom ? `${id}:custom` : id;
  return { ...states, [sessionId]: { ...state, answers: { ...state.answers, [answerId]: value } } };
}

export function clearPendingApproval(
  states: PendingInteractionsBySession,
  sessionId: string,
  rpcId: string,
): PendingInteractionsBySession {
  const state = states[sessionId];
  if (!state || state.approval?.rpcId !== rpcId) return states;
  const { approval: _approval, ...rest } = state;
  return { ...states, [sessionId]: { ...rest, answers: state.answers } };
}

export function clearPendingQuestion(
  states: PendingInteractionsBySession,
  sessionId: string,
  rpcId: string,
): PendingInteractionsBySession {
  const state = states[sessionId];
  if (!state || state.question?.rpcId !== rpcId) return states;
  const { question: _question, ...rest } = state;
  return { ...states, [sessionId]: { ...rest, answers: {} } };
}

export function clearPendingSession(
  states: PendingInteractionsBySession,
  sessionId: string,
): PendingInteractionsBySession {
  if (!(sessionId in states)) return states;
  const { [sessionId]: _removed, ...remaining } = states;
  return remaining;
}
