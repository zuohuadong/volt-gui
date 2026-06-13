import type { ModelInfo, TabMeta, WireEvent } from "./types";

interface AppBindings {
  SubmitToTab(tabID: string, input: string): Promise<void>;
  ListTabs(): Promise<TabMeta[]>;
  SetActiveTab(tabID: string): Promise<void>;
  OpenGlobalTab(topicID: string): Promise<TabMeta>;
  ModelsForTab(tabID: string): Promise<ModelInfo[]>;
  SetModelForTab(tabID: string, name: string): Promise<void>;
  Capabilities(): Promise<unknown>;
  Settings(): Promise<unknown>;
  Memory(): Promise<unknown>;
}

interface WailsRuntime {
  EventsOn(name: string, cb: (...data: unknown[]) => void): () => void;
}

declare global {
  interface Window {
    runtime?: WailsRuntime;
    go?: { main?: { App?: AppBindings } };
  }
}

const EVENT_CHANNEL = "agent:event";

function realApp(): AppBindings | undefined {
  return typeof window === "undefined" ? undefined : window.go?.main?.App;
}

function mockTabs(): TabMeta[] {
  return [
    {
      id: "mock-global",
      scope: "global",
      workspaceRoot: "",
      workspaceName: "Global",
      topicId: "welcome",
      topicTitle: "Workbench",
      active: true,
      running: false,
      mode: "normal",
    },
    {
      id: "mock-code",
      scope: "project",
      workspaceRoot: "~/projects/voltui",
      workspaceName: "voltui",
      topicId: "code",
      topicTitle: "Code session",
      active: false,
      running: false,
      mode: "normal",
    },
  ];
}

const mockListeners = new Set<(event: WireEvent) => void>();

const mockApp: AppBindings = {
  async SubmitToTab(_tabID: string, input: string) {
    const emit = (event: WireEvent) => {
      for (const listener of mockListeners) listener(event);
    };
    emit({ kind: "turn_started" });
    emit({ kind: "text", text: `Mock response for: ${input}` });
    emit({
      kind: "tool_dispatch",
      tool: {
        id: "mock-tool",
        name: "workspace_overview",
        args: JSON.stringify({ activity: "workbench" }),
        readOnly: true,
      },
    });
    emit({ kind: "tool_result", tool: { id: "mock-tool", name: "workspace_overview", output: "ready", readOnly: true } });
    emit({ kind: "turn_done" });
  },
  async ListTabs() {
    return mockTabs();
  },
  async SetActiveTab(_tabID: string) {},
  async OpenGlobalTab(_topicID: string) {
    return mockTabs()[0];
  },
  async ModelsForTab(_tabID: string) {
    return [
      { name: "deepseek-flash", label: "DeepSeek Flash", current: true },
      { name: "mimo-pro", label: "MiMo Pro" },
    ];
  },
  async SetModelForTab(_tabID: string, _name: string) {},
  async Capabilities() {
    return { skills: [], servers: [] };
  },
  async Settings() {
    return { providers: [], permissions: { mode: "ask" } };
  },
  async Memory() {
    return { entries: [] };
  },
};

export function app(): AppBindings {
  return realApp() ?? mockApp;
}

export function onAgentEvent(cb: (event: WireEvent) => void): () => void {
  if (typeof window !== "undefined" && window.runtime) {
    return window.runtime.EventsOn(EVENT_CHANNEL, (payload) => cb(payload as WireEvent));
  }
  mockListeners.add(cb);
  return () => mockListeners.delete(cb);
}
