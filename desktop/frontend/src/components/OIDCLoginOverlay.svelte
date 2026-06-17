<script lang="ts">
  import { ShieldCheck } from "@lucide/svelte";
  import { app } from "../lib/bridge";

  let {
    onComplete,
  }: {
    onComplete: () => void;
  } = $props();

  type LoginState = "idle" | "waiting" | "error";
  let loginState = $state<LoginState>("idle");
  let errorMsg = $state("");
  let cancelled = false;

  async function start() {
    cancelled = false;
    loginState = "waiting";
    errorMsg = "";
    try {
      await app().StartOIDCLogin();
      onComplete();
    } catch (e) {
      if (cancelled) {
        loginState = "idle";
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|deadline|timeout|context/i.test(msg)) {
        errorMsg = "Login timed out or was cancelled. Please try again.";
      } else if (/state|nonce|verify|id_token/i.test(msg)) {
        errorMsg = "Security verification failed. Please try again.";
      } else {
        errorMsg = msg || "An unexpected error occurred during login.";
      }
      loginState = "error";
    }
  }

  async function cancel() {
    cancelled = true;
    await app().CancelOIDCLogin().catch(() => {});
    loginState = "idle";
    errorMsg = "";
  }
</script>

<div class="auth-login">
  <div class="auth-login__card">
    <div class="auth-login__icon">
      <ShieldCheck size={48} />
    </div>
    <h1 class="auth-login__title">Employee Login</h1>
    <p class="auth-login__tag">Sign in with your organization account to continue.</p>

    {#if loginState === "waiting"}
      <div class="auth-login__status" role="status" aria-live="polite">
        <span class="auth-login__spinner"></span>
        <span>Waiting for authorization…</span>
      </div>
    {/if}

    {#if loginState === "error" && errorMsg}
      <div class="auth-login__error" role="alert">
        {errorMsg}
      </div>
    {/if}

    <button
      type="button"
      class="auth-login__submit"
      onclick={() => void start()}
      disabled={loginState === "waiting"}
    >
      {loginState === "waiting" ? "Waiting…" : "Sign In"}
    </button>

    {#if loginState === "waiting"}
      <button type="button" class="auth-login__cancel" onclick={() => void cancel()}>
        Cancel
      </button>
    {/if}
  </div>
</div>

<style>
  .auth-login {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--background);
    z-index: 9999;
  }

  .auth-login__card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
    padding: 48px 40px;
    max-width: 400px;
    width: 90%;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow, 0 18px 48px oklch(0.13 0.02 265 / 0.1));
    text-align: center;
  }

  .auth-login__icon {
    color: var(--primary);
    display: flex;
    margin-bottom: 4px;
  }

  .auth-login__title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: var(--foreground);
  }

  .auth-login__tag {
    margin: 0 0 8px;
    font-size: 0.9rem;
    color: var(--muted-foreground);
    line-height: 1.5;
  }

  .auth-login__status {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 0.875rem;
    color: var(--muted-foreground);
    padding: 8px 0;
  }

  .auth-login__spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--primary);
    border-radius: 50%;
    animation: auth-spin 0.8s linear infinite;
  }

  @keyframes auth-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .auth-login__error {
    font-size: 0.85rem;
    color: var(--destructive);
    background: oklch(from var(--destructive) l c h / 0.1);
    border-radius: calc(var(--radius) * 0.5);
    padding: 10px 14px;
    width: 100%;
    text-align: left;
  }

  .auth-login__submit {
    width: 100%;
    padding: 12px 20px;
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--primary-foreground);
    background: var(--primary);
    border: none;
    border-radius: calc(var(--radius) * 0.6);
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .auth-login__submit:hover:not(:disabled) {
    opacity: 0.9;
  }

  .auth-login__submit:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .auth-login__cancel {
    background: none;
    border: none;
    font-size: 0.85rem;
    color: var(--muted-foreground);
    cursor: pointer;
    padding: 4px 8px;
  }

  .auth-login__cancel:hover {
    color: var(--foreground);
  }
</style>
