<script lang="ts">
  import { onMount } from "svelte";
  import { ChevronRight, LoaderCircle, Square, Terminal } from "@lucide/svelte";
  import { Button } from "$components/ui/button";
  import {
    appendJobOutput,
    canKillJob,
    formatElapsed,
    hasRunningJob,
    isJobRunning,
    jobElapsedSeconds,
    type JobRow,
  } from "$lib/jobs";
  import { t } from "$lib/i18n";

  interface Props {
    readonly sessionId: string;
    readonly jobs: readonly JobRow[];
    readonly onKill: (job: JobRow) => Promise<void> | void;
  }

  let { sessionId, jobs, onKill }: Props = $props();

  let openJobId = $state("");
  let output = $state("");
  let lossy = $state(false);
  let now = $state(Date.now());
  let killBusy = $state("");

  // 只有还有活任务时才走时钟：全部结束就不会每秒钟重绘一次。
  $effect(() => {
    if (!hasRunningJob(jobs)) return;
    const timer = setInterval(() => { now = Date.now(); }, 1000);
    return () => clearInterval(timer);
  });

  $effect(() => {
    // 会话切换时输出尾随必须跟着作废，否则会把上一个会话的输出显示在新会话里。
    void sessionId;
    openJobId = "";
    output = "";
    lossy = false;
    void window.voltDesktop?.unfollowJob?.();
  });

  // 输出尾帧由主进程推送（`job/output`）；组件只认当前展开的那个任务。
  onMount(() => {
    const unsubscribe = window.voltDesktop?.onDshFrame?.((raw) => {
      const payload = (raw as { payload?: Record<string, unknown> } | null)?.payload;
      if (!payload || payload.type !== "job/output") return;
      if (payload.sessionId !== sessionId || payload.jobId !== openJobId) return;
      const text = typeof payload.text === "string" ? payload.text : "";
      const next = appendJobOutput(output, text);
      output = next.text;
      lossy = lossy || next.dropped || payload.lossy === true;
    });
    return () => {
      unsubscribe?.();
      // 组件被卸载（例如切到没有任务的会话）时主进程不会再收到 toggle：
      // 必须在这里释放跟随订阅，否则它会继续读一个没人看的输出尾。
      void window.voltDesktop?.unfollowJob?.();
    };
  });

  async function toggle(job: JobRow): Promise<void> {
    if (openJobId === job.id) {
      openJobId = "";
      await window.voltDesktop?.unfollowJob?.();
      return;
    }
    openJobId = job.id;
    output = "";
    lossy = false;
    await window.voltDesktop?.followJob?.(sessionId, job.id);
  }

  async function kill(job: JobRow): Promise<void> {
    killBusy = job.id;
    try {
      await onKill(job);
    } finally {
      killBusy = "";
    }
  }
</script>

{#if jobs.length > 0}
  <section class="job-roster" aria-label={t("jobs.label")}>
    <header>
      <Terminal size={14} aria-hidden="true" />
      <strong>{t("jobs.title", { count: String(jobs.length) })}</strong>
      <small>{t("jobs.hint")}</small>
    </header>
    <ul>
      {#each jobs as job (job.id)}
        <li class:job-open={openJobId === job.id}>
          <div class="job-row">
            <button type="button" class="job-toggle" aria-expanded={openJobId === job.id} onclick={() => void toggle(job)}>
              <ChevronRight size={13} aria-hidden="true" />
              <span class="job-label">{job.label || job.kind}</span>
              <small class="job-status job-status--{job.status}">
                {isJobRunning(job) ? t("jobs.statusRunning") : t(`jobs.status_${job.status}`)}
              </small>
              {#if job.progress}<small class="job-progress">{job.progress}</small>{/if}
              <small class="job-elapsed">{formatElapsed(jobElapsedSeconds(job, now))}</small>
            </button>
            {#if canKillJob(job)}
              <Button variant="ghost" size="sm" disabled={killBusy === job.id} title={t("jobs.killHint")} onclick={() => void kill(job)}>
                <Square size={12} fill="currentColor" aria-hidden="true" />{t("jobs.kill")}
              </Button>
            {/if}
          </div>
          {#if openJobId === job.id}
            {#if job.detail}<p class="job-detail">{job.detail}</p>{/if}
            {#if lossy}<p class="job-detail" role="status">{t("jobs.outputTruncated")}</p>{/if}
            {#if output}<pre class="job-output">{output}</pre>{:else}<p class="job-detail" role="status"><LoaderCircle size={12} class="spin" aria-hidden="true" />{t("jobs.outputWaiting")}</p>{/if}
          {/if}
        </li>
      {/each}
    </ul>
  </section>
{/if}

<style>
  .job-roster { border: 1px solid var(--border); border-radius: 8px; margin: 10px 0; background: var(--card); }
  .job-roster > header { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  .job-roster > header small { margin-left: auto; color: var(--muted-foreground); font-size: 11px; }
  .job-roster ul { list-style: none; margin: 0; padding: 4px 0; }
  .job-row { display: flex; align-items: center; gap: 4px; padding-right: 4px; }
  .job-toggle { display: flex; flex: 1; align-items: center; gap: 6px; min-width: 0; padding: 4px 10px; background: none; border: 0; font: inherit; text-align: left; cursor: pointer; }
  .job-toggle:hover { background: var(--muted); }
  .job-toggle[aria-expanded="true"] > :global(svg:first-child) { transform: rotate(90deg); }
  .job-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; }
  .job-status, .job-progress, .job-elapsed { color: var(--muted-foreground); font-size: 11px; }
  .job-status--failed { color: var(--destructive); }
  .job-status--running { color: var(--primary); }
  .job-elapsed { font-variant-numeric: tabular-nums; min-width: 44px; text-align: right; }
  .job-detail { display: flex; align-items: center; gap: 6px; margin: 0; padding: 0 10px 8px; color: var(--muted-foreground); font-size: 12px; }
  .job-output { margin: 0; padding: 6px 10px 10px; max-height: 260px; overflow: auto; font-family: var(--font-mono, ui-monospace, monospace); font-size: 11.5px; white-space: pre-wrap; }
</style>