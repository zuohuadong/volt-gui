import { useCallback, useRef, useState } from "react";
import logo from "../assets/logo.svg";
import { useBrand } from "../lib/brand";
import { app } from "../lib/bridge";
import { useT } from "../lib/i18n";

export function OIDCLoginOverlay({ onComplete }: { onComplete: () => void }) {
  const t = useT();
  const brand = useBrand();
  const [state, setState] = useState<"idle" | "waiting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  const start = useCallback(async () => {
    cancelledRef.current = false;
    setState("waiting");
    setError(null);
    try {
      await app.StartOIDCLogin();
      onComplete();
    } catch (e) {
      if (cancelledRef.current) {
        setState("idle");
        setError(null);
        return;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (/cancel|deadline|timeout|context/i.test(msg)) {
        setError(t("auth.error.timeout"));
      } else if (/state|nonce|verify|id_token/i.test(msg)) {
        setError(t("auth.error.security"));
      } else {
        setError(msg || t("auth.error.unknown"));
      }
      setState("error");
    }
  }, [onComplete, t]);

  const cancel = useCallback(async () => {
    cancelledRef.current = true;
    await app.CancelOIDCLogin().catch(() => undefined);
    setState("idle");
    setError(null);
  }, []);

  return (
    <div className="onboarding auth-login">
      <div className="onboarding__card">
        <img src={brand.logoUrl || logo} className="onboarding__logo" alt={brand.name} />
        <div className="onboarding__title">{t("auth.title")}</div>
        <div className="onboarding__tag">{t("auth.tagline", { name: brand.name })}</div>

        {state === "waiting" && (
          <div className="auth-login__status" role="status" aria-live="polite">
            <span className="onboarding__spinner" />
            <span>{t("auth.waiting")}</span>
          </div>
        )}

        {state === "error" && error && (
          <div className="onboarding__error" role="alert">
            {error}
          </div>
        )}

        <button className="onboarding__submit" onClick={() => void start()} disabled={state === "waiting"}>
          {state === "waiting" ? t("auth.waitingButton") : t("auth.submit")}
        </button>

        {state === "waiting" && (
          <button type="button" className="onboarding__skip" onClick={() => void cancel()}>
            {t("common.cancel")}
          </button>
        )}
      </div>
    </div>
  );
}
