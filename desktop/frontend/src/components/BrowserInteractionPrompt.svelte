<script lang="ts">
  import { KeyRound, ShieldCheck, UserRound, X } from "@lucide/svelte";
  import type { WireBrowserPrompt } from "../lib/types";

  let {
    credential,
    verification,
    onSubmitCredential,
    onCompleteVerification,
  }: {
    credential?: WireBrowserPrompt;
    verification?: WireBrowserPrompt;
    onSubmitCredential: (username: string, password: string, save: boolean) => void | Promise<void>;
    onCompleteVerification: (continued: boolean) => void | Promise<void>;
  } = $props();

  let username = $derived(credential?.usernameHint ?? "");
  let password = $state("");
  let submitting = $state(false);

  async function submitCredential(save: boolean) {
    if (!credential || !password || submitting) return;
    submitting = true;
    const secret = password;
    password = "";
    try {
      await onSubmitCredential(username, secret, save);
    } finally {
      submitting = false;
    }
  }

  async function cancelCredential() {
    if (submitting) return;
    password = "";
    await onSubmitCredential("", "", false);
  }
</script>

{#if credential}
  <section class="browser-prompt" aria-label="浏览器安全登录">
    <header>
      <span><KeyRound size={17} /></span>
      <div>
        <strong>浏览器需要登录</strong>
        <p>{credential.origin}</p>
      </div>
    </header>
    <p class="browser-prompt__reason">{credential.reason || "凭据只会发送到本机浏览器，不会进入模型上下文、聊天记录或工具日志。"}</p>
    <form onsubmit={(event) => { event.preventDefault(); void submitCredential(false); }}>
      <label>
        <span><UserRound size={14} />账号</span>
        <input bind:value={username} autocomplete="username" placeholder="请输入登录账号" />
      </label>
      <label>
        <span><KeyRound size={14} />密码</span>
        <input bind:value={password} type="password" autocomplete="current-password" placeholder="仅通过本机安全通道提交" />
      </label>
      <p class="browser-prompt__save-note"><ShieldCheck size={14} />“保存并登录”会把凭据存入系统钥匙串，供该站点后续自动化使用。</p>
      <div class="browser-prompt__actions">
        <button type="button" disabled={submitting} onclick={() => void cancelCredential()}><X size={14} />取消登录</button>
        <button type="submit" disabled={!password || submitting}>仅本次登录</button>
        <button class="primary" type="button" disabled={!password || submitting} onclick={() => void submitCredential(true)}>保存并登录</button>
      </div>
    </form>
  </section>
{:else if verification}
  <section class="browser-prompt" aria-label="浏览器人工验证">
    <header>
      <span><ShieldCheck size={17} /></span>
      <div>
        <strong>需要人工完成验证</strong>
        <p>{verification.origin}</p>
      </div>
    </header>
    <p class="browser-prompt__reason">请在已打开的浏览器窗口中完成验证码、扫码或 MFA。VoltUI 不会尝试绕过验证，浏览器会保持运行。</p>
    {#if verification.reason}<p class="browser-prompt__detail">{verification.reason}</p>{/if}
    <div class="browser-prompt__actions">
      <button type="button" onclick={() => void onCompleteVerification(false)}><X size={14} />取消登录</button>
      <button class="primary" type="button" onclick={() => void onCompleteVerification(true)}><ShieldCheck size={14} />已完成，继续</button>
    </div>
  </section>
{/if}

<style>
  .browser-prompt {
    margin: 14px 18px;
    padding: 16px;
    border: 1px solid color-mix(in srgb, var(--border, #d9dce2) 82%, #315b88 18%);
    border-radius: 14px;
    background: color-mix(in srgb, var(--panel, #fff) 96%, #edf4fb 4%);
    box-shadow: 0 10px 30px rgb(26 37 51 / 8%);
  }
  header { display: flex; align-items: center; gap: 10px; }
  header > span { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: #eef4fa; color: #294f75; }
  header div { min-width: 0; }
  header strong { display: block; font-size: 14px; }
  header p { margin: 3px 0 0; color: var(--muted, #6b7280); font-size: 12px; overflow-wrap: anywhere; }
  .browser-prompt__reason, .browser-prompt__detail { margin: 12px 0; color: var(--muted, #5f6875); font-size: 12px; line-height: 1.65; }
  form { display: grid; gap: 10px; }
  label { display: grid; gap: 6px; color: var(--muted, #5f6875); font-size: 12px; }
  label span, .browser-prompt__save-note { display: flex; align-items: center; gap: 6px; }
  input { width: 100%; box-sizing: border-box; border: 1px solid var(--border, #d9dce2); border-radius: 10px; padding: 10px 11px; background: var(--surface, #fff); color: inherit; }
  input:focus { outline: 2px solid rgb(49 91 136 / 18%); border-color: #527ba4; }
  .browser-prompt__save-note { margin: 0; color: var(--muted, #66717e); font-size: 11px; line-height: 1.5; }
  .browser-prompt__actions { display: flex; justify-content: flex-end; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
  button { display: inline-flex; align-items: center; justify-content: center; gap: 5px; min-height: 36px; border: 1px solid var(--border, #d9dce2); border-radius: 10px; padding: 0 12px; background: var(--surface, #fff); color: inherit; cursor: pointer; }
  button.primary { border-color: #20262d; background: #20262d; color: #fff; }
  button:disabled { opacity: .5; cursor: not-allowed; }
  @media (max-width: 560px) {
    .browser-prompt { margin: 10px; padding: 14px; }
    .browser-prompt__actions { display: grid; grid-template-columns: 1fr; }
    button { width: 100%; }
  }
</style>
