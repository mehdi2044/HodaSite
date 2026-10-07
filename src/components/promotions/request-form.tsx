"use client";
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
type Reply<T> = { ok: true; data: T } | { ok: false; code: string };
/** Replay keyed requests exactly; version-only status changes require a reload. */
export function RequestForm<T>({
  children,
  build,
  action,
  onSuccess,
  recoveryMode = "retry",
}: {
  children: React.ReactNode;
  build: (data: FormData) => unknown;
  action: (input: unknown) => Promise<Reply<T>>;
  onSuccess?: (result: T) => void;
  recoveryMode?: "retry" | "reload";
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTranslations("promotionAdmin");
  const [busy, setBusy] = useState(false),
    [retry, setRetry] = useState<{ input: unknown } | null>(null),
    [reloadRequired, setReloadRequired] = useState(false),
    [message, setMessage] = useState<string | null>(null);
  async function send(input: unknown) {
    setBusy(true);
    setMessage(null);
    try {
      const response = await action(input);
      setRetry(null);
      if (response.ok) {
        setMessage("saved");
        const confirmed =
          formRef.current?.querySelector<HTMLInputElement>(
            '[name="confirmed"]',
          );
        if (confirmed) confirmed.checked = false;
        onSuccess?.(response.data);
      } else if (
        recoveryMode === "reload" &&
        ["STALE_VERSION", "ARCHIVED"].includes(response.code)
      ) {
        setReloadRequired(true);
        setMessage("statusNeedsReload");
      } else setMessage(`errors.${response.code}`);
    } catch {
      if (recoveryMode === "reload") {
        setReloadRequired(true);
        setMessage("statusNeedsReload");
      } else {
        setRetry({ input });
        setMessage("unknown");
      }
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      ref={formRef}
      className="grid gap-4 min-w-0"
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || retry || reloadRequired) return;
        try {
          const input = build(new FormData(e.currentTarget));
          void send(input);
        } catch {
          setMessage("errors.VALIDATION");
        }
      }}
    >
      <fieldset
        disabled={busy || !!retry || reloadRequired}
        className="grid gap-4 min-w-0"
      >
        {children}
      </fieldset>
      {busy && <p role="status">{t("working")}</p>}
      {message && (
        <p role={message === "saved" ? "status" : "alert"}>{t(message)}</p>
      )}
      {retry && (
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => void send(retry.input)}
        >
          {t("retry")}
        </button>
      )}
      {reloadRequired && (
        <button
          className="button"
          type="button"
          disabled={busy}
          onClick={() => window.location.reload()}
        >
          {t("reloadStatus")}
        </button>
      )}
    </form>
  );
}
export function ConfirmSave({ label = "save" }: { label?: string }) {
  const t = useTranslations("promotionAdmin");
  return (
    <>
      <label className="flex items-start gap-3 min-h-11">
        <input className="mt-1" type="checkbox" name="confirmed" required />
        {t("confirm")}
      </label>
      <button className="button justify-self-start" type="submit">
        {t(label)}
      </button>
    </>
  );
}
