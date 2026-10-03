"use client";
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
type Reply<T> = { ok: true; data: T } | { ok: false; code: string };
/** Preserve the exact request/key after a lost response; never mint a new retry. */
export function RequestForm<T>({
  children,
  build,
  action,
  onSuccess,
}: {
  children: React.ReactNode;
  build: (data: FormData) => unknown;
  action: (input: unknown) => Promise<Reply<T>>;
  onSuccess?: (result: T) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const t = useTranslations("promotionAdmin");
  const [busy, setBusy] = useState(false),
    [retry, setRetry] = useState<{ input: unknown } | null>(null),
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
      } else setMessage(`errors.${response.code}`);
    } catch {
      setRetry({ input });
      setMessage("unknown");
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
        if (busy || retry) return;
        try {
          const input = build(new FormData(e.currentTarget));
          void send(input);
        } catch {
          setMessage("errors.VALIDATION");
        }
      }}
    >
      <fieldset disabled={busy || !!retry} className="grid gap-4 min-w-0">
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
