import { useCallback, useMemo, useState } from "react";
import { SquarePen, Brain } from "lucide-react";
import { useController } from "./lib/useController";
import { Transcript } from "./components/Transcript";
import { Composer } from "./components/Composer";
import { TodoPanel } from "./components/TodoPanel";
import { ApprovalModal } from "./components/ApprovalModal";
import { AskCard } from "./components/AskCard";
import { StatusBar } from "./components/StatusBar";
import { MemoryPanel } from "./components/MemoryPanel";
import { parseTodos } from "./lib/tools";
import type { MemoryView } from "./lib/types";

export default function App() {
  const { state, send, cancel, approve, answerQuestion, setPlan, newSession, setModel, fetchMemory, remember, saveDoc } =
    useController();
  const [plan, setPlanLocal] = useState(false);
  const [memView, setMemView] = useState<MemoryView | null>(null);

  const togglePlan = () => {
    const next = !plan;
    setPlanLocal(next);
    setPlan(next);
  };

  // Switching models rebuilds the controller, which starts in normal mode — so
  // re-apply the current plan state, or the pill would say "plan on" while the
  // fresh controller silently lets writers through.
  const switchModel = useCallback(
    async (name: string) => {
      await setModel(name);
      if (plan) setPlan(true);
    },
    [setModel, plan, setPlan],
  );

  // The live task list pinned above the composer comes from the most recent
  // top-level todo_write call; it stays visible while work remains, clears itself
  // once every item is completed, and can be dismissed by the user (the ✕). A
  // dismissal is keyed to that list's id, so a fresh todo_write (a new task)
  // brings the panel back.
  const todoItem = useMemo(() => {
    for (let i = state.items.length - 1; i >= 0; i--) {
      const it = state.items[i];
      if (it.kind === "tool" && it.name === "todo_write" && !it.parentId) return it;
    }
    return null;
  }, [state.items]);
  const todos = useMemo(() => (todoItem ? parseTodos(todoItem.args) : []), [todoItem]);
  const [dismissedTodo, setDismissedTodo] = useState<string | null>(null);
  const showTodos =
    !!todoItem &&
    todoItem.id !== dismissedTodo &&
    todos.length > 0 &&
    todos.some((t) => t.status !== "completed");

  // Memory drawer: opening fetches a fresh snapshot; writes re-fetch so the
  // panel reflects what landed on disk.
  const openMemory = useCallback(async () => {
    setMemView(await fetchMemory());
  }, [fetchMemory]);

  const closeMemory = useCallback(() => setMemView(null), []);

  const onRemember = useCallback(
    async (scope: string, note: string) => {
      await remember(scope, note);
      setMemView(await fetchMemory());
    },
    [remember, fetchMemory],
  );

  const onSaveDoc = useCallback(
    async (path: string, body: string) => {
      await saveDoc(path, body);
      setMemView(await fetchMemory());
    },
    [saveDoc, fetchMemory],
  );

  return (
    <div className="app">
      <header className="topbar">
        <span className="topbar__model">{state.meta?.label ?? "…"}</span>
        <div className="topbar__spacer" />
        <button className="chip chip--icon" onClick={() => void openMemory()} title="Memory">
          <Brain size={13} />
        </button>
        <button className="chip chip--icon" onClick={newSession} title="New session">
          <SquarePen size={13} />
        </button>
      </header>

      {state.meta?.startupErr && (
        <div className="banner banner--error">startup error: {state.meta.startupErr}</div>
      )}

      <main className="main">
        <Transcript items={state.items} onPrompt={send} />
      </main>

      <footer className="footer">
        {showTodos && <TodoPanel todos={todos} onDismiss={() => setDismissedTodo(todoItem!.id)} />}
        <Composer running={state.running} plan={plan} onSend={send} onCancel={cancel} onTogglePlan={togglePlan} />
        <StatusBar
          meta={state.meta}
          context={state.context}
          running={state.running}
          plan={plan}
          turnStartAt={state.turnStartAt}
          turnTokens={state.turnTokens}
          onSwitchModel={switchModel}
        />
      </footer>

      {state.approval && (
        <ApprovalModal
          approval={state.approval}
          onAnswer={(allow, session) => {
            // Approving an exit_plan_mode plan leaves plan mode (the controller
            // flips the executor; mirror it here for the indicator).
            if (state.approval!.tool === "exit_plan_mode" && allow) setPlanLocal(false);
            approve(state.approval!.id, allow, session);
          }}
        />
      )}

      {state.ask && (
        <AskCard
          ask={state.ask}
          onAnswer={answerQuestion}
          onDismiss={() => answerQuestion(state.ask!.id, [])}
        />
      )}

      {memView !== null && (
        <MemoryPanel
          view={memView}
          onClose={closeMemory}
          onRemember={onRemember}
          onSaveDoc={onSaveDoc}
        />
      )}
    </div>
  );
}
