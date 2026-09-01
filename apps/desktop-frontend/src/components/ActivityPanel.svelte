<script lang="ts">
  import { History, X } from "@lucide/svelte";
  import {
    ChainOfThought,
    ChainOfThoughtContent,
    ChainOfThoughtHeader,
    ChainOfThoughtStep,
    Plan,
    Task,
  } from "@svadmin/ai-elements";
  import { Button } from "$components/ui/button";
  import type { TodoItem, TranscriptMessage } from "$lib/transcript";

  type Props = {
    messages: TranscriptMessage[];
    todos: TodoItem[];
    sending: boolean;
    open: boolean;
    onClose: () => void;
  };
  let { messages, todos, sending, open, onClose }: Props = $props();
  const activityItems = $derived(messages.filter((item) => item.tool).slice(-12).reverse());
  const runningTools = $derived(activityItems.filter((item) => item.tool?.state === "running"));
  const completedTools = $derived(messages.filter((item) => item.tool?.state === "success").length);
  const failedTools = $derived(messages.filter((item) => item.tool?.state === "error").length);
  const planSteps = $derived(todos.map((todo, index) => ({
    id: `todo-${index}-${todo.content}`,
    title: todo.content,
    status: todo.status === "completed" ? "complete" as const : todo.status === "in_progress" ? "active" as const : "pending" as const,
  })));
  const taskSteps = $derived(activityItems.map((message) => ({
    id: message.id,
    title: message.tool?.name || "工具",
    status: message.tool?.state === "success" ? "complete" as const : message.tool?.state === "error" ? "failed" as const : "running" as const,
    detail: message.tool?.state === "error" ? "执行失败" : message.tool?.state === "success" ? "已完成" : "运行中",
  })));
  const taskStatus = $derived(failedTools > 0 ? "failed" as const : sending || runningTools.length > 0 ? "running" as const : activityItems.length > 0 ? "complete" as const : "queued" as const);
</script>

<aside class:open class="activity-panel">
  <div class="panel-heading">
    <div><div class="section-label">活动记录</div><strong>{runningTools.length ? `${runningTools.length} 个工具运行中` : "当前会话轨迹"}</strong></div>
    <Button variant="ghost" size="icon-sm" aria-label="关闭活动面板" onclick={onClose}><X size={14} /></Button>
  </div>
  <div class="activity-summary" aria-label="活动摘要">
    <div><strong>{runningTools.length}</strong><span>运行中</span></div>
    <div><strong>{completedTools}</strong><span>已完成</span></div>
    <div><strong>{todos.filter((todo) => todo.status === "completed").length}/{todos.length}</strong><span>待办</span></div>
  </div>
  <div class="activity-content ai-activity-content">
    {#if todos.length > 0}
      <Plan steps={planSteps} title="任务计划" description="来自官方 DSH todo projection" isStreaming={sending} />
    {/if}
    <Task
      title="工具执行"
      description="当前会话的真实工具调用"
      status={taskStatus}
      progress={taskSteps.length ? Math.round((taskSteps.filter((step) => step.status === "complete").length / taskSteps.length) * 100) : 0}
      steps={taskSteps}
      open
    />
    <ChainOfThought defaultOpen={activityItems.length > 0} class="activity-chain">
      <ChainOfThoughtHeader>执行轨迹</ChainOfThoughtHeader>
      <ChainOfThoughtContent>
        {#each activityItems as item (item.id)}
          <ChainOfThoughtStep
            label={item.tool?.name || "工具"}
            description={item.tool?.state === "running" ? "运行中" : item.tool?.state === "error" ? "执行失败" : "已完成"}
            status={item.tool?.state === "running" ? "active" : item.tool?.state === "error" ? "pending" : "complete"}
          />
        {:else}
          <div class="panel-empty"><History size={18} /><p>任务开始后，工具调用和执行状态会显示在这里。</p></div>
        {/each}
      </ChainOfThoughtContent>
    </ChainOfThought>
  </div>
</aside>
